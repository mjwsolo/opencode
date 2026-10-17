import { define } from "@opencode/plugin/effect/plugin"
import type { SessionHooks } from "@opencode/plugin/effect/session"
import { Duration, Effect, type JsonSchema } from "effect"
import { Model } from "../../model.js"
import { LocalContext } from "../../session/local-context.js"
import type { PluginInternal } from "../internal.js"
import { LocalCodeTools } from "./localcode-tools.js"
import { SchemaCompact } from "./schema-compact.js"

/** The provider id LocalCode's launcher writes into its config; its model list follows the supervisor. */
export const PROVIDER_ID = "localcode"
/** The launcher's placeholder model while nothing is loaded yet. */
export const PENDING = "__pending__"

export type Status = {
  readonly current?: string | null
  readonly state?: string
  readonly vision?: boolean
  readonly ctx?: number
  readonly budget?: number
}

const controlURL = () => (process.env.LOCALCODE_CONTROL_URL ?? process.env.OPENCODE_CONTROL_URL ?? "").replace(/\/$/, "")

/** The supervisor's control API requires the session token on every request. */
export async function readStatus(): Promise<Status | undefined> {
  const base = controlURL()
  const token = process.env.LOCALCODE_CONTROL_TOKEN ?? process.env.OPENCODE_CONTROL_TOKEN
  if (!base || !token) return undefined
  try {
    const response = await fetch(base + "/status", {
      headers: { "x-localcode-token": token },
      signal: AbortSignal.timeout(1500),
    })
    if (!response.ok) return undefined
    return (await response.json()) as Status
  } catch {
    return undefined
  }
}

/** The loaded model's capabilities and the context the server really gives each request. */
export function loaded(status: Status | undefined) {
  if (!status?.current || status.state !== "ready") return undefined
  const context = typeof status.ctx === "number" && Number.isFinite(status.ctx) && status.ctx > 0 ? status.ctx : undefined
  // The supervisor's budget (ui/context_budget.py) is the prompt length at which the session
  // should compact; it already holds one step's headroom.
  const budget =
    context && typeof status.budget === "number" && Number.isFinite(status.budget) && status.budget > 0
      ? Math.min(Math.floor(status.budget), context)
      : undefined
  return { alias: status.current, vision: status.vision === true, context, budget }
}

/** Only the ready, loaded model with a vision projector accepts images; every other alias is text-only. */
export function inputs(alias: string, current: ReturnType<typeof loaded>) {
  return current?.alias === alias && current.vision ? ["text", "image"] : ["text"]
}

/** llama-server reasoning is off by default; a per-request template switch turns it on or off. */
export function variants(alias: string) {
  // Muse's backend permits its self-reasoning channel even with thinking disabled.
  if (alias.toLowerCase().includes("muse-glimmer")) return []
  return [
    { id: Model.VariantID.make("none"), body: { chat_template_kwargs: { enable_thinking: false } } },
    { id: Model.VariantID.make("thinking"), body: { chat_template_kwargs: { enable_thinking: true } } },
  ]
}

/**
 * Slot affinity. llama-server routes a request to the idle slot whose cached prompt shares the
 * longest prefix. Every request shares the system prompt and tool schemas, so a short side request
 * (title generation) landed on the conversation's slot and truncated its cache; the next turn
 * re-read the whole conversation while other slots sat idle. Side requests go to the LAST slot.
 */
/** A side request: no tools and a short prompt (a long tool-less request keeps its cached slot). */
export const SIDE_REQUEST_MAX_CHARS = 24_000

export function pinSideRequest(body: string, slots: number) {
  if (slots <= 1 || body.length > SIDE_REQUEST_MAX_CHARS) return body
  try {
    const json = JSON.parse(body)
    if (!json || typeof json !== "object" || Array.isArray(json) || json.id_slot !== undefined) return body
    if (Array.isArray(json.tools) && json.tools.length > 0) return body
    return JSON.stringify({ ...json, id_slot: slots - 1 })
  } catch {
    return body
  }
}

/**
 * A separate title request adds prompt reading and can displace the warmed local prefix, so a
 * localcode session is titled from the user's own first message without an inference request.
 */
export function localTitle(text: string) {
  const original = text.startsWith("Original request:\n")
    ? text.slice("Original request:\n".length).split("\n\nRecent conversation:\n")[0]!
    : text
  const clean = original.replace(/[\s\x00-\x1f\x7f]+/g, " ").trim()
  if (!clean) return undefined
  return clean.length > 100 ? clean.substring(0, 97) + "..." : clean
}

/**
 * Small local models pay for every tool-schema byte on every turn. Unless the user launched with
 * full context, documentation-only keywords go first; then any schema still over the per-tool
 * budget is compacted the way Codex does (see schema-compact.ts).
 */
export function localToolSchema(input: JsonSchema.JsonSchema, full = LocalContext.fullContext(PROVIDER_ID)) {
  const lean = full ? input : LocalContext.compactToolSchema(input)
  return SchemaCompact.compactToolSchema(lean as Record<string, unknown>) as JsonSchema.JsonSchema
}

const slotCache = new Map<string, { n: number; at: number }>()
async function slotCount(url: string) {
  const root = new URL(url).origin
  const hit = slotCache.get(root)
  if (hit && Date.now() - hit.at < 60_000) return hit.n
  const n = await fetch(root + "/slots", { signal: AbortSignal.timeout(1000) })
    .then(async (response) => {
      if (!response.ok) return 1
      const json: unknown = await response.json()
      return Array.isArray(json) && json.length > 0 ? json.length : 1
    })
    .catch(() => 1)
  slotCache.set(root, { n, at: Date.now() })
  return n
}

export const LocalCodeProviderPlugin = define({
  id: "localcode.provider",
  effect: Effect.fn(function* (ctx) {
    const state = {
      status: undefined as ReturnType<typeof loaded>,
      key: "",
      // Every alias this process has served stays selectable, so a resumed session's model resolves.
      seen: new Set<string>(),
    }

    const supervised = controlURL() !== ""
    yield* ctx.model.transform((models) => {
      const configured = models.list(PROVIDER_ID)
      const template = models.get(PROVIDER_ID, PENDING) ?? configured[0]
      if (!template) return
      const current = state.status
      const aliases = new Set([...state.seen, ...configured.map((model) => model.id)])
      if (current) aliases.add(current.alias)
      aliases.delete(PENDING)
      for (const alias of aliases) {
        models.update(PROVIDER_ID, alias, (model) => {
          if (!configured.some((item) => item.id === alias)) {
            Object.assign(model, structuredClone(template))
            model.name = alias
          }
          // A picked model's wire id is its alias.
          model.modelID = Model.ID.make(alias)
          model.variants = variants(alias)
          // Image input follows the gguf the supervisor loaded (its projector), not the config template.
          if (supervised) model.capabilities = { ...model.capabilities, input: inputs(alias, current) }
          if (current?.alias !== alias) return
          if (current.context) {
            const output = Math.min(model.limit.output || 8192, Math.max(1, Math.floor(current.context / 4)))
            // The launcher sets no compaction buffer: the supervisor's budget already holds one
            // step's headroom. Without a budget, leave room for one response, as opencode v1 did.
            model.limit = { context: current.context, output, input: current.budget ?? current.context - output }
          }
        })
      }
      if (current || aliases.size > 0) models.remove(PROVIDER_ID, PENDING)
      if (current) models.default.set(PROVIDER_ID, current.alias)
    })

    yield* ctx.session.hook(
      "title",
      (event) =>
        Effect.sync(() => {
          const text = event.messages
            .filter((message) => message.role === "user")
            .flatMap((message) => message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])))
            .join(" ")
          const title = localTitle(text)
          if (title) event.result = title
        }),
      { providerID: PROVIDER_ID },
    )

    const compactTools = (event: SessionHooks["context"]) =>
      Effect.sync(() => {
        const full = LocalContext.fullContext(event.model.providerID)
        // Mutate in place: the request maps hooked definitions back to their tools by identity.
        for (const [name, tool] of Object.entries(event.tools)) {
          tool.input = localToolSchema(tool.input, full)
          // Compact descriptions of the built-in tools, in every context mode.
          LocalCodeTools.lean(name, tool as { description: string; input: unknown })
        }
      })
    yield* ctx.session.hook("context", compactTools, { providerID: PROVIDER_ID })
    yield* ctx.session.hook("compaction", compactTools, { providerID: PROVIDER_ID })
    yield* ctx.session.hook("generate", compactTools, { providerID: PROVIDER_ID })

    // Side requests (titles, helper generations, a short compaction) carry no tools and a short
    // prompt; keep them off the conversation's slot. A long tool-less request (compaction of a big
    // conversation) stays where its prefix is already cached.
    yield* ctx.session.hook(
      "http.request",
      (event) =>
        Effect.gen(function* () {
          if (event.kind === "primary") return
          const body = yield* Effect.promise(() => event.request.clone().text())
          if (!body) return
          const slots = yield* Effect.promise(() => slotCount(event.request.url))
          const next = pinSideRequest(body, slots)
          if (next === body) return
          const headers = new Headers(event.request.headers)
          headers.delete("content-length")
          event.request = new Request(event.request.url, { method: event.request.method, headers, body: next })
        }),
      { providerID: PROVIDER_ID },
    )

    if (!controlURL()) return
    const refresh = Effect.fn("LocalCodeProvider.refresh")(function* () {
      const status = loaded(yield* Effect.promise(readStatus))
      const key = JSON.stringify(status ?? null)
      if (key === state.key) return
      state.key = key
      state.status = status
      if (status) state.seen.add(status.alias)
      yield* ctx.model.reload()
    })
    // Know the loaded model before the first request (readStatus times out after 1.5 s), then a
    // short poll of the local supervisor keeps the model list in step with the picker.
    yield* refresh().pipe(Effect.ignore)
    yield* Effect.sleep(Duration.seconds(2)).pipe(
      Effect.andThen(refresh().pipe(Effect.ignore)),
      Effect.forever,
      Effect.forkScoped,
    )
  }),
} satisfies PluginInternal.InternalPlugin)

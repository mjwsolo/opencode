import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import * as LSPClient from "./client"
import path from "path"
import { which } from "@opencode-ai/core/util/which"
import { Global } from "@opencode-ai/core/global"
import { pathToFileURL, fileURLToPath } from "url"
import * as LSPServer from "./server"
import { Config } from "@/config/config"
import { Process } from "@/util/process"
import { spawn as lspspawn } from "./launch"
import { Effect, Layer, Context, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { containsPath } from "@/project/instance-context"
import { NonNegativeInt } from "@opencode-ai/core/schema"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { LspEvent } from "@opencode-ai/schema/lsp-event"

export const Event = LspEvent

const Position = Schema.Struct({
  line: NonNegativeInt,
  character: NonNegativeInt,
})

export const Range = Schema.Struct({
  start: Position,
  end: Position,
}).annotate({ identifier: "Range" })
export type Range = typeof Range.Type

export const Symbol = Schema.Struct({
  name: Schema.String,
  kind: NonNegativeInt,
  location: Schema.Struct({
    uri: Schema.String,
    range: Range,
  }),
}).annotate({ identifier: "Symbol" })
export type Symbol = typeof Symbol.Type

export const DocumentSymbol = Schema.Struct({
  name: Schema.String,
  detail: Schema.optional(Schema.String),
  kind: NonNegativeInt,
  range: Range,
  selectionRange: Range,
}).annotate({ identifier: "DocumentSymbol" })
export type DocumentSymbol = typeof DocumentSymbol.Type

export const Status = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  root: Schema.String,
  status: Schema.Literals(["connected", "starting", "error"]),
}).annotate({ identifier: "LSPStatus" })
export type Status = typeof Status.Type

// localcode: what /lsp shows. Language servers are never downloaded on their own;
// the user picks one here, sees what it fetches, and confirms.
export const CatalogEntry = Schema.Struct({
  id: Schema.String,
  extensions: Schema.Array(Schema.String),
  installed: Schema.Boolean,
  status: Schema.Literals(["connected", "starting", "error", "idle"]),
  download: Schema.String, // what installing fetches, e.g. "npm: typescript-language-server (~2 MB)"
}).annotate({ identifier: "LSPCatalogEntry" })
export type CatalogEntry = typeof CatalogEntry.Type

export const InstallInput = Schema.Struct({ id: Schema.String }).annotate({ identifier: "LSPInstallInput" })
export type InstallInput = typeof InstallInput.Type
export const InstallResult = Schema.Struct({ ok: Schema.Boolean, error: Schema.optional(Schema.String) }).annotate({
  identifier: "LSPInstallResult",
})
export type InstallResult = typeof InstallResult.Type

/** Binary on PATH that means "already installed", and what a download would fetch. */
const CATALOG_HINTS: Record<string, { bin?: string[]; pkg?: string; download: string }> = {
  typescript: { bin: ["typescript-language-server"], pkg: "typescript-language-server", download: "npm: typescript-language-server (~2 MB); needs `typescript` in the project" },
  vue: { bin: ["vue-language-server"], pkg: "@vue/language-server", download: "npm: @vue/language-server (~10 MB)" },
  eslint: { download: "GitHub zip: vscode-eslint server (~3 MB); needs eslint in the project" },
  oxlint: { bin: ["oxlint"], pkg: "oxlint", download: "npm: oxlint (~15 MB)" },
  biome: { bin: ["biome"], pkg: "@biomejs/biome", download: "npm: @biomejs/biome (~20 MB)" },
  pyright: { bin: ["pyright-langserver", "pyright"], pkg: "pyright", download: "npm: pyright (~15 MB)" },
  ty: { bin: ["ty"], download: "GitHub release: ty (~20 MB)" },
  gopls: { bin: ["gopls"], download: "go install gopls (needs Go; ~30 MB)" },
  "ruby-lsp": { bin: ["ruby-lsp"], download: "gem install ruby-lsp (needs Ruby)" },
  "elixir-ls": { bin: ["elixir-ls", "language_server.sh"], download: "GitHub release: elixir-ls (~10 MB)" },
  zls: { bin: ["zls"], download: "GitHub release: zls (~5 MB)" },
  csharp: { download: "NuGet: roslyn language server (~60 MB)" },
  razor: { download: "NuGet: razor language server (~30 MB)" },
  fsharp: { download: "dotnet tool: fsautocomplete (~40 MB)" },
  "sourcekit-lsp": { bin: ["sourcekit-lsp"], download: "ships with Xcode / Swift toolchain; nothing downloaded" },
  rust: { bin: ["rust-analyzer"], download: "rustup component add rust-analyzer (needs rustup); nothing downloaded here" },
  clangd: { bin: ["clangd"], download: "GitHub release: clangd (~30 MB)" },
  svelte: { bin: ["svelteserver"], pkg: "svelte-language-server", download: "npm: svelte-language-server (~10 MB)" },
  astro: { bin: ["astro-ls"], pkg: "@astrojs/language-server", download: "npm: @astrojs/language-server (~10 MB)" },
  deno: { bin: ["deno"], download: "needs Deno on PATH; nothing downloaded" },
}

enum SymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

const kinds = [
  SymbolKind.Class,
  SymbolKind.Function,
  SymbolKind.Method,
  SymbolKind.Interface,
  SymbolKind.Variable,
  SymbolKind.Constant,
  SymbolKind.Struct,
  SymbolKind.Enum,
]

const filterExperimentalServers = (servers: Record<string, LSPServer.Info>, flags: RuntimeFlags.Info) => {
  if (flags.experimentalLspTy) {
    if (servers["pyright"]) {
      delete servers["pyright"]
    }
  } else {
    if (servers["ty"]) {
      delete servers["ty"]
    }
  }
}

type LocInput = { file: string; line: number; character: number }

interface State {
  clients: LSPClient.Info[]
  servers: Record<string, LSPServer.Info>
  broken: Set<string>
  spawning: Map<string, Promise<LSPClient.Info | undefined>>
}

export interface Interface {
  readonly init: () => Effect.Effect<void>
  readonly status: () => Effect.Effect<Status[]>
  readonly catalog: () => Effect.Effect<CatalogEntry[]>
  readonly install: (id: string) => Effect.Effect<InstallResult>
  readonly hasClients: (file: string) => Effect.Effect<boolean>
  readonly touchFile: (input: string, diagnostics?: "document" | "full") => Effect.Effect<void>
  readonly diagnostics: () => Effect.Effect<Record<string, LSPClient.Diagnostic[]>>
  readonly hover: (input: LocInput) => Effect.Effect<any>
  readonly definition: (input: LocInput) => Effect.Effect<any[]>
  readonly references: (input: LocInput) => Effect.Effect<any[]>
  readonly implementation: (input: LocInput) => Effect.Effect<any[]>
  readonly documentSymbol: (uri: string) => Effect.Effect<(DocumentSymbol | Symbol)[]>
  readonly workspaceSymbol: (query: string) => Effect.Effect<Symbol[]>
  readonly prepareCallHierarchy: (input: LocInput) => Effect.Effect<any[]>
  readonly incomingCalls: (input: LocInput) => Effect.Effect<any[]>
  readonly outgoingCalls: (input: LocInput) => Effect.Effect<any[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/LSP") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const flags = yield* RuntimeFlags.Service
    const events = yield* EventV2Bridge.Service

    const state = yield* InstanceState.make<State>(
      Effect.fn("LSP.state")(function* (ctx) {
        const cfg = yield* config.get()

        const servers: Record<string, LSPServer.Info> = {}

        if (!cfg.lsp) {
          yield* Effect.logInfo("all LSPs are disabled")
        } else {
          for (const server of Object.values(LSPServer)) {
            servers[server.id] = server
          }

          filterExperimentalServers(servers, flags)

          if (cfg.lsp !== true) {
            for (const [name, item] of Object.entries(cfg.lsp)) {
              const existing = servers[name]
              if (item.disabled) {
                yield* Effect.logInfo(`LSP server ${name} is disabled`)
                delete servers[name]
                continue
              }
              servers[name] = {
                ...existing,
                id: name,
                root: existing?.root ?? (async (_file, ctx) => ctx.directory),
                extensions: item.extensions ?? existing?.extensions ?? [],
                spawn: async (root) => ({
                  process: lspspawn(item.command[0], item.command.slice(1), {
                    cwd: root,
                    env: { ...process.env, ...item.env },
                  }),
                  initialization: item.initialization,
                }),
              }
            }
          }

          yield* Effect.logInfo("enabled LSP servers", {
            serverIds: Object.values(servers)
              .map((server) => server.id)
              .join(", "),
          })
        }

        const s: State = {
          clients: [],
          servers,
          broken: new Set(),
          spawning: new Map(),
        }

        yield* Effect.addFinalizer(() =>
          Effect.promise(async () => {
            await Promise.all(s.clients.map((client) => client.shutdown()))
          }),
        )

        return s
      }),
    )

    const getClients = Effect.fnUntraced(function* (file: string) {
      const ctx = yield* InstanceState.context
      if (!containsPath(file, ctx)) return [] as LSPClient.Info[]
      const s = yield* InstanceState.get(state)
      const clients = yield* Effect.promise(async () => {
        const extension = path.parse(file).ext || file
        const result: LSPClient.Info[] = []
        let updated = 0

        async function schedule(server: LSPServer.Info, root: string, key: string) {
          const handle = await server
            .spawn(root, ctx, flags)
            .then((value) => {
              if (!value) s.broken.add(key)
              return value
            })
            .catch(() => {
              s.broken.add(key)
              return undefined
            })

          if (!handle) return undefined
          const client = await LSPClient.create({
            serverID: server.id,
            server: handle,
            root,
            directory: ctx.directory,
            instance: ctx,
          }).catch(async () => {
            s.broken.add(key)
            await Process.stop(handle.process)
            return undefined
          })

          if (!client) return undefined

          const existing = s.clients.find((x) => x.root === root && x.serverID === server.id)
          if (existing) {
            await Process.stop(handle.process)
            return existing
          }

          s.clients.push(client)
          return client
        }

        for (const server of Object.values(s.servers)) {
          if (server.extensions.length && !server.extensions.includes(extension)) continue

          const root = await server.root(file, ctx)
          if (!root) continue
          if (s.broken.has(root + server.id)) continue

          const match = s.clients.find((x) => x.root === root && x.serverID === server.id)
          if (match) {
            result.push(match)
            continue
          }

          const inflight = s.spawning.get(root + server.id)
          if (inflight) {
            const client = await inflight
            if (!client) continue
            result.push(client)
            continue
          }

          const task = schedule(server, root, root + server.id)
          s.spawning.set(root + server.id, task)
          // localcode: a server that is downloading/starting, or one that failed,
          // is visible in the sidebar instead of silently absent.
          updated++

          task.finally(() => {
            if (s.spawning.get(root + server.id) === task) {
              s.spawning.delete(root + server.id)
            }
          })

          const client = await task
          if (!client) {
            updated++
            continue
          }

          result.push(client)
          updated++
        }

        return { result, updated }
      })
      yield* Effect.forEach(Array.from({ length: clients.updated }), () => events.publish(Event.Updated, {}), {
        discard: true,
      })
      return clients.result
    })

    const run = Effect.fnUntraced(function* <T>(file: string, fn: (client: LSPClient.Info) => Promise<T>) {
      const clients = yield* getClients(file)
      return yield* Effect.promise(() => Promise.all(clients.map((x) => fn(x))))
    })

    const runAll = Effect.fnUntraced(function* <T>(fn: (client: LSPClient.Info) => Promise<T>) {
      const s = yield* InstanceState.get(state)
      return yield* Effect.promise(() => Promise.all(s.clients.map((x) => fn(x))))
    })

    const init = Effect.fn("LSP.init")(function* () {
      yield* InstanceState.get(state)
    })

    const status = Effect.fn("LSP.status")(function* () {
      const ctx = yield* InstanceState.context
      const s = yield* InstanceState.get(state)
      const result: Status[] = []
      for (const client of s.clients) {
        result.push({
          id: client.serverID,
          name: s.servers[client.serverID].id,
          root: path.relative(ctx.directory, client.root),
          status: "connected",
        })
      }
      for (const server of Object.values(s.servers)) {
        for (const key of s.spawning.keys()) {
          if (!key.endsWith(server.id)) continue
          const root = key.slice(0, -server.id.length)
          result.push({ id: server.id, name: server.id, root: path.relative(ctx.directory, root), status: "starting" })
        }
        for (const key of s.broken) {
          if (!key.endsWith(server.id)) continue
          const root = key.slice(0, -server.id.length)
          result.push({ id: server.id, name: server.id, root: path.relative(ctx.directory, root), status: "error" })
        }
      }
      return result
    })

    const catalog = Effect.fn("LSP.catalog")(function* () {
      const ctx = yield* InstanceState.context
      const s = yield* InstanceState.get(state)
      const current = yield* status()
      const out: CatalogEntry[] = []
      for (const server of Object.values(s.servers)) {
        const hint = CATALOG_HINTS[server.id] ?? { download: "downloaded on install" }
        const onPath = (hint.bin ?? []).some((b) => !!which(b))
        const cached = hint.pkg
          ? yield* Effect.promise(async () => {
              const dir = path.join(Global.Path.cache, "packages", hint.pkg!.replace(/[^A-Za-z0-9._-]/g, "_"), "node_modules", hint.pkg!)
              return Bun.file(path.join(dir, "package.json")).exists()
            })
          : false
        const mine = current.filter((c) => c.id === server.id)
        const st = mine.some((c) => c.status === "connected")
          ? "connected"
          : mine.some((c) => c.status === "starting")
            ? "starting"
            : mine.some((c) => c.status === "error")
              ? "error"
              : "idle"
        out.push({
          id: server.id,
          extensions: server.extensions,
          installed: onPath || cached || st === "connected",
          status: st,
          download: hint.download,
        })
      }
      void ctx
      return out.toSorted((a, b) => a.id.localeCompare(b.id))
    })

    /** User-requested install of one language server: the only place downloads are allowed. */
    const install = Effect.fn("LSP.install")(function* (id: string) {
      const ctx = yield* InstanceState.context
      const s = yield* InstanceState.get(state)
      const server = s.servers[id]
      if (!server) return { ok: false, error: `unknown language server "${id}"` } satisfies InstallResult
      const root = ctx.directory
      for (const key of [...s.broken]) if (key.endsWith(server.id)) s.broken.delete(key)
      const allow = { ...flags, disableLspDownload: false }
      const result = yield* Effect.promise(async () => {
        try {
          const handle = await server.spawn(root, ctx, allow)
          if (!handle) return { ok: false, error: `${id}: nothing to start — see /lsp for what it needs` } satisfies InstallResult
          const existing = s.clients.find((x) => x.root === root && x.serverID === server.id)
          if (existing) {
            await Process.stop(handle.process)
            return { ok: true } satisfies InstallResult
          }
          const client = await LSPClient.create({ serverID: server.id, server: handle, root, directory: ctx.directory, instance: ctx }).catch(
            async () => {
              await Process.stop(handle.process)
              return undefined
            },
          )
          if (!client) return { ok: false, error: `${id}: started but did not answer` } satisfies InstallResult
          s.clients.push(client)
          return { ok: true } satisfies InstallResult
        } catch (e) {
          return { ok: false, error: String(e) } satisfies InstallResult
        }
      })
      yield* events.publish(Event.Updated, {})
      return result
    })

    const hasClients = Effect.fn("LSP.hasClients")(function* (file: string) {
      const ctx = yield* InstanceState.context
      const s = yield* InstanceState.get(state)
      return yield* Effect.promise(async () => {
        const extension = path.parse(file).ext || file
        for (const server of Object.values(s.servers)) {
          if (server.extensions.length && !server.extensions.includes(extension)) continue
          const root = await server.root(file, ctx)
          if (!root) continue
          if (s.broken.has(root + server.id)) continue
          return true
        }
        return false
      })
    })

    const touchFile = Effect.fn("LSP.touchFile")(function* (input: string, diagnostics?: "document" | "full") {
      yield* Effect.logInfo("touching file", { file: input })
      const clients = yield* getClients(input)
      yield* Effect.promise(() =>
        Promise.all(
          clients.map(async (client) => {
            const after = Date.now()
            const version = await client.notify.open({ path: input })
            if (!diagnostics) return
            return client.waitForDiagnostics({
              path: input,
              version,
              mode: diagnostics,
              after,
            })
          }),
        ).catch(() => {}),
      )
    })

    const diagnostics = Effect.fn("LSP.diagnostics")(function* () {
      const results: Record<string, LSPClient.Diagnostic[]> = {}
      const all = yield* runAll(async (client) => client.diagnostics)
      for (const result of all) {
        for (const [p, diags] of result.entries()) {
          const arr = results[p] || []
          arr.push(...diags)
          results[p] = arr
        }
      }
      return results
    })

    const hover = Effect.fn("LSP.hover")(function* (input: LocInput) {
      return yield* run(input.file, (client) =>
        client.connection
          .sendRequest("textDocument/hover", {
            textDocument: { uri: pathToFileURL(input.file).href },
            position: { line: input.line, character: input.character },
          })
          .catch(() => null),
      )
    })

    const definition = Effect.fn("LSP.definition")(function* (input: LocInput) {
      const results = yield* run(input.file, (client) =>
        client.connection
          .sendRequest("textDocument/definition", {
            textDocument: { uri: pathToFileURL(input.file).href },
            position: { line: input.line, character: input.character },
          })
          .catch(() => null),
      )
      return results.flat().filter(Boolean)
    })

    const references = Effect.fn("LSP.references")(function* (input: LocInput) {
      const results = yield* run(input.file, (client) =>
        client.connection
          .sendRequest("textDocument/references", {
            textDocument: { uri: pathToFileURL(input.file).href },
            position: { line: input.line, character: input.character },
            context: { includeDeclaration: true },
          })
          .catch(() => []),
      )
      return results.flat().filter(Boolean)
    })

    const implementation = Effect.fn("LSP.implementation")(function* (input: LocInput) {
      const results = yield* run(input.file, (client) =>
        client.connection
          .sendRequest("textDocument/implementation", {
            textDocument: { uri: pathToFileURL(input.file).href },
            position: { line: input.line, character: input.character },
          })
          .catch(() => null),
      )
      return results.flat().filter(Boolean)
    })

    const documentSymbol = Effect.fn("LSP.documentSymbol")(function* (uri: string) {
      const file = fileURLToPath(uri)
      const results = yield* run(file, (client) =>
        client.connection.sendRequest("textDocument/documentSymbol", { textDocument: { uri } }).catch(() => []),
      )
      return (results.flat() as (DocumentSymbol | Symbol)[]).filter(Boolean)
    })

    const workspaceSymbol = Effect.fn("LSP.workspaceSymbol")(function* (query: string) {
      const results = yield* runAll((client) =>
        client.connection
          .sendRequest<Symbol[]>("workspace/symbol", { query })
          .then((result) => result.filter((x) => kinds.includes(x.kind)).slice(0, 10))
          .catch(() => [] as Symbol[]),
      )
      return results.flat()
    })

    const prepareCallHierarchy = Effect.fn("LSP.prepareCallHierarchy")(function* (input: LocInput) {
      const results = yield* run(input.file, (client) =>
        client.connection
          .sendRequest("textDocument/prepareCallHierarchy", {
            textDocument: { uri: pathToFileURL(input.file).href },
            position: { line: input.line, character: input.character },
          })
          .catch(() => []),
      )
      return results.flat().filter(Boolean)
    })

    const callHierarchyRequest = Effect.fnUntraced(function* (
      input: LocInput,
      direction: "callHierarchy/incomingCalls" | "callHierarchy/outgoingCalls",
    ) {
      const results = yield* run(input.file, async (client) => {
        const items = await client.connection
          .sendRequest<unknown[] | null>("textDocument/prepareCallHierarchy", {
            textDocument: { uri: pathToFileURL(input.file).href },
            position: { line: input.line, character: input.character },
          })
          .catch(() => [] as unknown[])
        if (!items?.length) return []
        return client.connection.sendRequest(direction, { item: items[0] }).catch(() => [])
      })
      return results.flat().filter(Boolean)
    })

    const incomingCalls = Effect.fn("LSP.incomingCalls")(function* (input: LocInput) {
      return yield* callHierarchyRequest(input, "callHierarchy/incomingCalls")
    })

    const outgoingCalls = Effect.fn("LSP.outgoingCalls")(function* (input: LocInput) {
      return yield* callHierarchyRequest(input, "callHierarchy/outgoingCalls")
    })

    return Service.of({
      init,
      status,
      catalog,
      install,
      hasClients,
      touchFile,
      diagnostics,
      hover,
      definition,
      references,
      implementation,
      documentSymbol,
      workspaceSymbol,
      prepareCallHierarchy,
      incomingCalls,
      outgoingCalls,
    })
  }),
)

export * as Diagnostic from "./diagnostic"

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Config.node, RuntimeFlags.node, FSUtil.node, EventV2Bridge.node],
})

export * as LSP from "./lsp"

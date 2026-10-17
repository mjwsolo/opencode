/**
 * The localcode launcher's supervisor: a local control API (LOCALCODE_CONTROL_URL) that owns the
 * model server, downloads, voice and vision. Every request carries the session token.
 */
import { createSignal } from "solid-js"
import { ModelChangeQueue } from "./model-change-queue"

export const LOCALCODE_PROVIDER_ID = "localcode"

export type Status = {
  state: "idle" | "downloading" | "loading" | "ready" | "error"
  model?: string
  current?: string | null
  detail?: string
  pct?: number | null
  vision?: boolean
  vision_available?: boolean
  vision_size_gb?: number
  ctx?: number
  budget?: number
}

export const controlUrl = () => (process.env.LOCALCODE_CONTROL_URL ?? "").replace(/\/$/, "")

export function controlFetch(path: string, init: RequestInit = {}) {
  const token = process.env.LOCALCODE_CONTROL_TOKEN
  if (!token) throw new Error("LocalCode control credential is missing")
  return fetch(controlUrl() + path, {
    ...init,
    headers: { ...Object.fromEntries(new Headers(init.headers).entries()), "x-localcode-token": token },
  })
}

export async function getJSON<T>(path: string): Promise<T> {
  // Short: a dead supervisor must surface as an error, not a picker stuck on "loading…".
  const r = await controlFetch(path, { signal: AbortSignal.timeout(path === "/status" ? 1_500 : 5_000) })
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return (await r.json()) as T
}

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const r = await controlFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  const res = (await r.json()) as T & { error?: string }
  if (!r.ok || res.error) throw new Error(res.error ?? `HTTP ${r.status}`)
  return res
}

export const modelChangeQueue = new ModelChangeQueue()
const [queuedModel, setQueuedModelSignal] = createSignal<string>()
export const queuedModelName = queuedModel
export const setQueuedModel = (value: string | undefined) => setQueuedModelSignal(value)

// Supervisor readiness, cached so synchronous render and submit paths can read it.
// Without a control URL (plain config setups) the answer is always "loaded".
const [status, setStatus] = createSignal<Status>()
export const lastStatus = status
export const setLastStatus = (value: Status | undefined) => setStatus(value)

let watching = false
export function watchSupervisor() {
  if (watching || !controlUrl()) return
  watching = true
  const tick = () =>
    getJSON<Status>("/status")
      .then(setStatus)
      .catch(() => setStatus(undefined))
  void tick()
  setInterval(tick, 2000).unref?.()
}

export const modelChanging = () =>
  !!controlUrl() && (status()?.state === "loading" || status()?.state === "downloading")
export const modelLoaded = () => !controlUrl() || (!!status()?.current && status()?.state === "ready")
export const supervisorKnown = () => !controlUrl() || status() !== undefined

/** One line for the status row under the prompt; undefined when nothing needs saying. */
export function supervisorLine() {
  if (!controlUrl()) return undefined
  const st = status()
  if (!st) return "Model service not running"
  const queued = queuedModel()
  if (queued) return `Queued: ${queued}`
  if (st.state === "downloading") return `Downloading ${st.model ?? "model"}${st.pct != null ? ` ${Math.round(st.pct)}%` : "…"}`
  if (st.state === "loading") return `Loading ${st.model ?? "model"}…`
  if (st.state === "error") return `Model error: ${st.detail ?? "unknown"}`
  if (!st.current) return "No model loaded · /models"
  return undefined
}

export async function refreshSupervisor() {
  if (!controlUrl()) return
  await getJSON<Status>("/status")
    .then(setStatus)
    .catch(() => setStatus(undefined))
}

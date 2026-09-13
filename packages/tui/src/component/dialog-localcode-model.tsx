/**
 * localcode's model picker: model first, then quant. Same two levels, same
 * data, same rules as localcode's own TUI (tui/screens/model_picker.py):
 *   level 1: every catalog model (display name · maker), ★ = recommend(RAM)
 *   level 2: every quant the HF repo ships — size, fit badge (✓ ≤55% RAM,
 *            ~ tight ≤65%, ✗ too big), est. tok/s, downloaded marker, ★
 * Selecting a quant asks the supervisor to download (if needed) and reload the
 * server on the same port; progress is shown as toasts and the session's model
 * is switched once the server reports ready. Curation is families-only; quants
 * are never curated.
 */
import { createResource, createSignal, onCleanup, onMount, Show } from "solid-js"
import { DialogSelect } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useDialog } from "../ui/dialog"
import { useLocal } from "../context/local"
import { useToast } from "../ui/toast"
import { selectedForeground, useTheme } from "../context/theme"
import { useTerminalDimensions } from "@opentui/solid"

export const LOCALCODE_PROVIDER_ID = "localcode"
export const controlUrl = () => (process.env.LOCALCODE_CONTROL_URL ?? "").replace(/\/$/, "")

type Group = {
  key: string
  display_name: string
  maker: string
  license: string
  hf_repo: string
  recommended: boolean
  current: boolean
  installed_count?: number
  downloading?: boolean
  pct?: number | null
}
type Quant = {
  filename: string
  alias: string
  label: string
  size_gb: number
  fit: "fits" | "tight" | "too big"
  tok_s: number | null
  recommended: boolean
  downloaded: boolean
  current: boolean
  downloading?: boolean
  pct?: number | null
}
type Status = { state: "idle" | "downloading" | "loading" | "ready" | "error"; model?: string; detail?: string; pct?: number | null }

const FIT_GLYPH: Record<Quant["fit"], string> = { fits: "✓", tight: "~", "too big": "✗" }

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(controlUrl() + path, { signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return (await r.json()) as T
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(controlUrl() + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  const res = (await r.json()) as T & { error?: string }
  if (!r.ok || res.error) throw new Error(res.error ?? `HTTP ${r.status}`)
  return res
}

// Supervisor readiness, cached so the synchronous prompt-submit path can read it.
// Without a control URL (plain opencode.json setups) the answer is always "loaded".
const [lastStatus, setLastStatus] = createSignal<Status & { current?: string | null }>()
let watching = false
export function watchSupervisor() {
  if (watching || !controlUrl()) return
  watching = true
  const tick = async () => {
    try {
      setLastStatus(await getJSON<Status & { current?: string | null }>("/status"))
    } catch { setLastStatus(undefined) }
  }
  void tick()
  setInterval(tick, 2000)
}
export const modelLoaded = () => !controlUrl() || (!!lastStatus()?.current && lastStatus()?.state !== "loading")
export const supervisorKnown = () => !controlUrl() || lastStatus() !== undefined
export async function refreshSupervisor() {
  if (!controlUrl()) return
  try {
    setLastStatus(await getJSON<Status & { current?: string | null }>("/status"))
  } catch { setLastStatus(undefined) }
}

// Esc on the quant list steps back to the model list. The dialog's onClose also
// fires when we replace/clear it ourselves, so a flag says whether to step back.
let escapeStepsBack = true

const pctLabel = (pct: number | null | undefined) => (pct != null ? `${Math.round(pct)}%` : "…")

/** Re-fetch a resource every second while a download runs, so rows show live progress. */
function pollWhileDownloading(refetch: () => void) {
  onMount(() => {
    let active = false
    const timer = setInterval(async () => {
      try {
        const st = await getJSON<Status>("/status")
        const next = st.state === "downloading" || st.state === "loading"
        if (next || active) refetch()
        active = next
      } catch {}
    }, 1000)
    onCleanup(() => clearInterval(timer))
  })
}

export function DialogModelsDir(props: { current: string; onDone: () => void }) {
  const dialog = useDialog()
  const toast = useToast()
  return (
    <DialogPrompt
      title="Models folder"
      description={() => <text>Where downloaded GGUFs live. Existing files are not moved.</text>}
      value={props.current}
      placeholder="~/.local/share/localcode/models"
      onConfirm={async (value) => {
        try {
          const res = await postJSON<{ path: string; free_gb: number | null }>("/models_dir", { path: value })
          toast.show({ variant: "success", title: "Models folder", message: `${res.path}${res.free_gb != null ? `  (${res.free_gb} GB free)` : ""}` })
        } catch (e) {
          toast.show({ variant: "error", title: "Models folder", message: String(e) })
        }
        props.onDone()
      }}
      onCancel={() => props.onDone()}
    />
  )
}

export function DialogLocalcodeModel() {
  const dialog = useDialog()
  const toast = useToast()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()
  onMount(() => dialog.setSize("large"))
  const [catalog, { refetch }] = createResource(() =>
    getJSON<{ ram_gb: number; current: string | null; groups: Group[]; models_dir?: string }>("/catalog"),
  )
  pollWhileDownloading(() => void refetch())

  const options = () => [
    ...[...(catalog()?.groups ?? [])].sort((a, b) => Number(!!(b.installed_count || b.current)) - Number(!!(a.installed_count || a.current))).map((g) => ({
      value: g.key,
      title: `${g.display_name}${g.recommended ? " ★" : ""}`,
      titleView: (
        <span>
          {`${g.display_name}${g.recommended ? " ★" : ""}`.padEnd(dimensions().width >= 80 ? 38 : 32)}
          {dimensions().width >= 80 ? g.maker.padEnd(12) : ""}
          {g.downloading ? `⇣ ${pctLabel(g.pct)}` : g.current ? "Loaded" : g.installed_count ? `${g.installed_count} on disk` : "Download"}
        </span>
      ),
      category: g.installed_count || g.current ? "On this Mac" : "Available to download",
      categoryView: <text fg={theme.primary}>{g.installed_count || g.current ? "On this Mac" : "Available to download"}</text>,
      onSelect: () => {
        escapeStepsBack = true
        dialog.replace(
          () => <DialogLocalcodeQuant group={g} />,
          () => {
            // the stack pops after this callback, so reopen on the next tick
            if (escapeStepsBack) setTimeout(() => dialog.replace(() => <DialogLocalcodeModel />), 0)
          },
        )
      },
    })),
    {
      value: "__models_dir__",
      title: "Models folder",
      description: catalog()?.models_dir ?? "",
      category: "Settings",
      categoryView: <text fg={theme.primary}>Settings</text>,
      onSelect: () =>
        dialog.replace(() => (
          <DialogModelsDir current={catalog()?.models_dir ?? ""} onDone={() => dialog.replace(() => <DialogLocalcodeModel />)} />
        )),
    },
  ]

  return (
    <Show
      when={!catalog.error}
      fallback={<DialogSelect title="Select model" options={[]} emptyView={<text>Could not reach the localcode model supervisor: {String(catalog.error)}</text>} />}
    >
      <DialogSelect<string>
        title={catalog.loading ? "localcode models — loading…" : "localcode models"}
        placeholder="Search models…"
        footer={<text fg={theme.textMuted}>★ Recommended for your {catalog()?.ram_gb ?? "?"} GB Mac</text>}
        options={options()}
        footerHints={[{ title: "enter", label: "choose quant" }]}
        current={(catalog()?.groups ?? []).find((g) => g.current)?.key}
      />
    </Show>
  )
}

export function DialogLocalcodeQuant(props: { group: Group }) {
  const dialog = useDialog()
  onMount(() => dialog.setSize("large"))
  const toast = useToast()
  const local = useLocal()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()
  const [selected, setSelected] = createSignal<string>()
  const nameWidth = () => dimensions().width >= 80 ? 24 : 18
  const [data, { refetch }] = createResource(() =>
    getJSON<{ group: string; display_name: string; maker: string; ram_gb: number; quants: Quant[]; vision_size_gb?: number; error?: string }>(
      `/quants?group=${encodeURIComponent(props.group.key)}`,
    ),
  )
  pollWhileDownloading(() => void refetch())

  async function cancel(q: Quant) {
    try {
      await postJSON("/cancel", {})
      toast.show({ variant: "info", title: `${props.group.display_name} · ${q.label}`, message: "Download cancelled" })
    } catch (e) {
      toast.show({ variant: "error", title: "Cancel failed", message: String(e) })
    }
  }

  const ordered = () => [...(data()?.quants ?? [])].sort((a, b) => Number(b.downloaded || b.current) - Number(a.downloaded || a.current))
  const active = () => selected() ?? ordered().find((q) => q.current)?.alias ?? ordered()[0]?.alias
  const options = () => ordered().map((q) => ({
    value: q.alias,
    title: `${q.label}${q.recommended ? " ★" : ""}`,
    titleView: (
      <span>
        {`${q.label}${q.recommended ? " ★" : ""}`.padEnd(nameWidth())}
        {`${q.size_gb.toFixed(1)} GB`.padEnd(10)}
        {`${FIT_GLYPH[q.fit]} ${q.fit}`.padEnd(12)}
        <span style={{ fg: active() === q.alias ? selectedForeground(theme) : q.current ? theme.primary : q.downloaded ? theme.success : theme.textMuted }}>
          {q.downloading ? `⇣ ${pctLabel(q.pct)}` : q.current ? "Loaded" : q.downloaded ? "Ready" : "Download"}
        </span>
      </span>
    ),
    disabled: q.fit === "too big" && !q.downloading,
    category: q.downloaded || q.current ? "On this Mac" : "Available to download",
    categoryView: (
      <text fg={theme.textMuted}>
        <span style={{ fg: theme.primary }}>{(q.downloaded || q.current ? "On this Mac" : dimensions().width >= 80 ? "Available to download" : "Download").padEnd(nameWidth())}</span>
        {"Size".padEnd(10)}{"Memory".padEnd(12)}State
      </text>
    ),
    onSelect: () => void (q.downloading ? cancel(q) : select(q)),
  }))

  async function select(q: Quant) {
    escapeStepsBack = false
    dialog.clear()
    try {
      const r = await fetch(controlUrl() + "/select", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ group: props.group.key, filename: q.filename }),
      })
      const res = (await r.json()) as { ok?: boolean; error?: string; model?: string }
      if (!r.ok || res.error) throw new Error(res.error ?? `HTTP ${r.status}`)
    } catch (e) {
      toast.show({ variant: "error", title: "Model switch failed", message: String(e) })
      return
    }
    const label = `${props.group.display_name} · ${q.label}`
    toast.show({ variant: "info", title: label, message: q.downloaded ? "Loading…" : `Downloading from huggingface.co/${props.group.hf_repo}…` })
    // Poll the supervisor until the server is serving the new gguf.
    let last = ""
    const started = Date.now()
    const timer = setInterval(async () => {
      let st: Status
      try {
        st = await getJSON<Status>("/status")
      } catch {
        return
      }
      const line =
        st.state === "downloading"
          ? `Downloading… ${st.pct != null ? Math.round(st.pct) + "%" : ""}`
          : st.state === "loading"
            ? "Loading into memory…"
            : st.state
      if (st.state === "ready") {
        clearInterval(timer)
        if (st.model !== q.alias) return
        local.model.set({ providerID: LOCALCODE_PROVIDER_ID, modelID: q.alias }, { recent: true })
        toast.show({ variant: "success", title: "Model changed", message: label })
        void import("./localcode-vision").then((m) => m.visionHint(toast))
        return
      }
      if (st.state === "error") {
        clearInterval(timer)
        toast.show({ variant: "error", title: "Model switch failed", message: st.detail ?? "unknown error" })
        return
      }
      if (st.state === "idle") {
        clearInterval(timer)
        return
      }
      if (line !== last && Date.now() - started > 1500) {
        last = line
        toast.show({ variant: "info", title: label, message: line })
      }
    }, 1000)
    onCleanup(() => clearInterval(timer))
  }

  return (
    <Show
      when={!data.error && !data()?.error}
      fallback={<DialogSelect title={props.group.display_name} options={[]} emptyView={<text>Could not list quants: {String(data.error ?? data()?.error)}</text>} />}
    >
      <DialogSelect<string>
        title={data.loading ? `${props.group.display_name} — loading…` : props.group.display_name}
        placeholder="Search versions…"
        onMove={(option) => setSelected(option.value)}
        onFilter={() => setSelected(undefined)}
        footer={
          <box gap={1}>
            <text fg={theme.textMuted}>★ Recommended · {props.group.hf_repo}</text>
            <text fg={theme.textMuted}>
              <span style={{ fg: theme.text, bold: true }}>enter</span> load / download / cancel ⇣
              {"   "}<span style={{ fg: theme.text, bold: true }}>esc</span> back
            </text>
          </box>
        }
        options={options()}
        current={(data()?.quants ?? []).find((q) => q.current)?.alias}
      />
    </Show>
  )
}

/**
 * localcode's model picker: model first, then quant. Same two levels, same data, same rules as
 * localcode's own picker:
 *   level 1: every catalog model (display name · maker), ★ = recommended for this Mac's RAM
 *   level 2: every quant the source repo ships: size, fit (✓ fits, ~ tight, ✗ too big),
 *            downloaded marker, ★
 * Selecting a quant asks the supervisor to download (if needed) and reload the server on the same
 * port; progress is shown as toasts and the session's model is switched once the server reports
 * ready and the runtime lists the alias.
 */
import { createResource, createSignal, onCleanup, onMount, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { DialogSelect } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { useLocal } from "../context/local"
import { useData } from "../context/data"
import { useLocation } from "../context/location"
import { useTheme } from "../context/theme"
import {
  controlFetch,
  getJSON,
  modelChangeQueue,
  postJSON,
  setLastStatus,
  lastStatus,
  setQueuedModel,
  LOCALCODE_PROVIDER_ID,
  type Status,
} from "../util/localcode"

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
  fit: "fits" | "tight" | "too_big" | "too big"
  tok_s: number | null
  recommended: boolean
  downloaded: boolean
  current: boolean
  downloading?: boolean
  pct?: number | null
}

const FIT_GLYPH: Record<string, string> = { fits: "✓", tight: "~", too_big: "✗", "too big": "✗" }
/** The supervisor sends "too_big"; the row shows "too big". */
const fitLabel = (fit: string) => (fit === "too_big" ? "too big" : fit)
const tooBig = (fit: string) => fit === "too_big" || fit === "too big"
const pctLabel = (pct: number | null | undefined) => (pct != null ? `${Math.round(pct)}%` : "…")

// Esc on the quant list steps back to the model list. The dialog's onClose also fires when we
// replace or clear it ourselves, so a flag says whether to step back.
let escapeStepsBack = true

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
          toast.show({
            variant: "success",
            title: "Models folder",
            message: `${res.path}${res.free_gb != null ? `  (${res.free_gb} GB free)` : ""}`,
          })
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
  const theme = useTheme()
  const dimensions = useTerminalDimensions()
  onMount(() => dialog.setSize("large"))
  const [catalog, { refetch }] = createResource(() =>
    getJSON<{ ram_gb: number; current: string | null; groups: Group[]; models_dir?: string }>("/catalog"),
  )
  pollWhileDownloading(() => void refetch())

  const options = () => [
    ...[...(catalog()?.groups ?? [])]
      .sort((a, b) => Number(!!(b.installed_count || b.current)) - Number(!!(a.installed_count || a.current)))
      .map((g) => ({
        value: g.key,
        title: `${g.display_name}${g.recommended ? " ★" : ""}`,
        titleView: (
          <span>
            {`${g.display_name}${g.recommended ? " ★" : ""}`.padEnd(dimensions().width >= 80 ? 38 : 32)}
            {dimensions().width >= 80 ? g.maker.padEnd(12) : ""}
            {g.downloading
              ? `⇣ ${pctLabel(g.pct)}`
              : g.current
                ? "Loaded"
                : g.installed_count
                  ? `${g.installed_count} on disk`
                  : "Download"}
          </span>
        ),
        category: "Models",
        onSelect: () => {
          escapeStepsBack = true
          dialog.replace(
            () => <DialogLocalcodeQuant group={g} />,
            () => {
              // The stack pops after this callback, so reopen on the next tick.
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
      onSelect: () =>
        dialog.replace(() => (
          <DialogModelsDir
            current={catalog()?.models_dir ?? ""}
            onDone={() => dialog.replace(() => <DialogLocalcodeModel />)}
          />
        )),
    },
  ]

  return (
    <Show
      when={!catalog.error}
      fallback={
        <DialogSelect
          title="Model service not running"
          options={[]}
          emptyView={
            <text>
              The localcode model service is not answering ({String(catalog.error)}). Press esc, then exit and run
              localcode again.
            </text>
          }
        />
      }
    >
      <DialogSelect<string>
        title={catalog.loading ? "Select a model — loading…" : "Select a model"}
        placeholder="Search models…"
        footer={<text fg={theme.text.muted}>★ Recommended for your {catalog()?.ram_gb ?? "?"} GB Mac</text>}
        options={options()}
        footerHints={[{ title: "enter", label: "choose quant" }]}
        current={(catalog()?.groups ?? []).find((g) => g.current)?.key}
      />
    </Show>
  )
}

export function DialogLocalcodeQuant(props: { group: Group }) {
  const data = useData()
  const location = useLocation()
  const dialog = useDialog()
  onMount(() => dialog.setSize("large"))
  const toast = useToast()
  const local = useLocal()
  const theme = useTheme()
  const dimensions = useTerminalDimensions()
  const [selected, setSelected] = createSignal<string>()
  const nameWidth = () => (dimensions().width >= 80 ? 24 : 18)
  const [quants, { refetch }] = createResource(() =>
    getJSON<{
      group: string
      display_name: string
      maker: string
      ram_gb: number
      quants: Quant[]
      vision_size_gb?: number
      error?: string
    }>(`/quants?group=${encodeURIComponent(props.group.key)}`),
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

  const ordered = () =>
    [...(quants()?.quants ?? [])].sort((a, b) => Number(b.downloaded || b.current) - Number(a.downloaded || a.current))
  const active = () => selected() ?? ordered().find((q) => q.current)?.alias ?? ordered()[0]?.alias
  const options = () =>
    ordered().map((q) => ({
      value: q.alias,
      title: `${q.label}${q.recommended ? " ★" : ""}`,
      titleView: (
        <span>
          {`${q.label}${q.recommended ? " ★" : ""}`.padEnd(nameWidth())}
          {`${q.size_gb.toFixed(1)} GB`.padEnd(10)}
          {`${FIT_GLYPH[q.fit] ?? "✗"} ${fitLabel(q.fit)}`.padEnd(12)}
          <span
            style={{
              fg:
                active() === q.alias
                  ? theme.text.formfield.selected
                  : q.current
                    ? theme.hue.interactive[200]
                    : q.downloaded
                      ? theme.text.feedback.success.base
                      : theme.text.muted,
            }}
          >
            {q.downloading ? `⇣ ${pctLabel(q.pct)}` : q.current ? "Loaded" : q.downloaded ? "Ready" : "Download"}
          </span>
        </span>
      ),
      disabled: tooBig(q.fit) && !q.downloading,
      category: q.downloaded || q.current ? "Downloaded" : "Available to download",
      onSelect: () => void (q.downloading ? cancel(q) : select(q)),
    }))

  // Model switches wait for the current reply, tools and retries to finish.
  const busy = () => data.session.active().length > 0

  function select(q: Quant) {
    escapeStepsBack = false
    dialog.clear()
    const label = `${props.group.display_name} · ${q.label}`
    setQueuedModel(undefined)
    const queued = modelChangeQueue.request(busy, () => {
      setQueuedModel(undefined)
      void load(q)
    })
    if (queued) {
      setQueuedModel(label)
      toast.show({
        variant: "info",
        title: "Model change queued",
        message: `${label} will load after the current reply and tools finish.`,
        duration: 60_000,
      })
    }
  }

  // The runtime lists the alias once its provider has polled the supervisor; select it then.
  function listed(alias: string) {
    return (data.location.model.list(location.ref) ?? []).some(
      (model) => model.providerID === LOCALCODE_PROVIDER_ID && model.id === alias,
    )
  }

  async function load(q: Quant) {
    try {
      const r = await controlFetch("/select", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ group: props.group.key, filename: q.filename }),
      })
      const res = (await r.json()) as { ok?: boolean; error?: string; model?: string }
      if (!r.ok || res.error) throw new Error(res.error ?? `HTTP ${r.status}`)
      setLastStatus({ ...lastStatus(), state: q.downloaded ? "loading" : "downloading", model: q.alias })
    } catch (e) {
      toast.show({ variant: "error", title: "Model switch failed", message: String(e) })
      return
    }
    const label = `${props.group.display_name} · ${q.label}`
    toast.show({
      variant: "info",
      title: label,
      message: q.downloaded ? "Loading…" : `Downloading from huggingface.co/${props.group.hf_repo}…`,
      duration: 60_000,
    })
    let last = ""
    const started = Date.now()
    let shown = started
    let ready = 0
    const timer = setInterval(async () => {
      if (ready) {
        // Up to 10 s for the runtime to list the new alias.
        if (!listed(q.alias) && Date.now() - ready < 10_000) return
        clearInterval(timer)
        local.model.set({ providerID: LOCALCODE_PROVIDER_ID, modelID: q.alias }, { recent: true })
        toast.show({ variant: "success", title: "Model loaded", message: label })
        void import("./localcode-vision").then((m) => m.visionHint(toast))
        return
      }
      let st: Status
      try {
        st = await getJSON<Status>("/status")
      } catch {
        return
      }
      setLastStatus(st)
      const line =
        st.state === "downloading"
          ? `Downloading… ${st.pct != null ? Math.round(st.pct) + "%" : ""}`
          : st.state === "loading"
            ? "Loading into memory…"
            : st.state
      if (st.state === "ready") {
        if (st.model !== q.alias) {
          clearInterval(timer)
          return
        }
        ready = Date.now()
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
      if ((line !== last || Date.now() - shown > 45_000) && Date.now() - started > 1500) {
        last = line
        shown = Date.now()
        toast.show({ variant: "info", title: label, message: line, duration: 60_000 })
      }
    }, 1000)
  }

  return (
    <Show
      when={!quants.error && !quants()?.error}
      fallback={
        <DialogSelect
          title={props.group.display_name}
          options={[]}
          emptyView={<text>Could not list quants: {String(quants.error ?? quants()?.error)}</text>}
        />
      }
    >
      <DialogSelect<string>
        title={quants.loading ? `${props.group.display_name} — loading…` : props.group.display_name}
        placeholder="Search versions…"
        onMove={(option) => setSelected(option.value)}
        onFilter={() => setSelected(undefined)}
        footer={
          <box gap={1}>
            <text fg={theme.text.muted}>★ Recommended · {props.group.hf_repo}</text>
            <text fg={theme.text.muted}>
              {"Size".padEnd(10)}
              {"Memory".padEnd(12)}State {"   "}enter load / download / cancel ⇣{"   "}esc back
            </text>
          </box>
        }
        options={options()}
        current={(quants()?.quants ?? []).find((q) => q.current)?.alias}
      />
    </Show>
  )
}

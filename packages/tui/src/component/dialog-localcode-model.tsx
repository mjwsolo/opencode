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
import { createResource, createSignal, onCleanup, Show } from "solid-js"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useLocal } from "../context/local"
import { useToast } from "../ui/toast"

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
}
type Status = { state: "idle" | "downloading" | "loading" | "ready" | "error"; model?: string; detail?: string; pct?: number | null }

const FIT_GLYPH: Record<Quant["fit"], string> = { fits: "✓", tight: "~", "too big": "✗" }

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(controlUrl() + path, { signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return (await r.json()) as T
}

export function DialogLocalcodeModel() {
  const dialog = useDialog()
  const toast = useToast()
  const [catalog] = createResource(() => getJSON<{ ram_gb: number; current: string | null; groups: Group[] }>("/catalog"))

  const options = () =>
    (catalog()?.groups ?? []).map((g) => ({
      value: g.key,
      title: `${g.display_name} · ${g.maker}${g.recommended ? "  ★" : ""}`,
      description: g.current ? "current" : undefined,
      details: [g.license],
      onSelect: () => dialog.replace(() => <DialogLocalcodeQuant group={g} />),
    }))

  return (
    <Show
      when={!catalog.error}
      fallback={<DialogSelect title="Select model" options={[]} emptyView={<text>Could not reach the localcode model supervisor: {String(catalog.error)}</text>} />}
    >
      <DialogSelect<string>
        title={catalog.loading ? "Select model — loading catalog…" : `Select model  (★ recommended for ${catalog()?.ram_gb ?? "?"} GB)`}
        options={options()}
        footerHints={[{ title: "enter", label: "choose quant" }]}
        current={(catalog()?.groups ?? []).find((g) => g.current)?.key}
      />
    </Show>
  )
}

export function DialogLocalcodeQuant(props: { group: Group }) {
  const dialog = useDialog()
  const toast = useToast()
  const local = useLocal()
  const [data] = createResource(() =>
    getJSON<{ group: string; display_name: string; maker: string; ram_gb: number; quants: Quant[]; error?: string }>(
      `/quants?group=${encodeURIComponent(props.group.key)}`,
    ),
  )

  const options = () =>
    (data()?.quants ?? []).map((q) => ({
      value: q.alias,
      title: `${q.label}${q.recommended ? "  ★" : ""}`,
      description: [
        `${q.size_gb} GB`,
        `${FIT_GLYPH[q.fit]} ${q.fit}`,
        q.tok_s ? `~${q.tok_s} tok/s` : "",
        q.current ? "current" : q.downloaded ? "downloaded" : "download",
      ]
        .filter(Boolean)
        .join("   "),
      disabled: q.fit === "too big",
      onSelect: () => void select(q),
    }))

  async function select(q: Quant) {
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
    toast.show({ variant: "info", title: label, message: q.downloaded ? "Loading…" : "Downloading…" })
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
        local.model.set({ providerID: LOCALCODE_PROVIDER_ID, modelID: q.alias }, { recent: true })
        toast.show({ variant: "success", title: "Model changed", message: label })
        return
      }
      if (st.state === "error") {
        clearInterval(timer)
        toast.show({ variant: "error", title: "Model switch failed", message: st.detail ?? "unknown error" })
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
        title={data.loading ? `${props.group.display_name} — fetching quants…` : `${props.group.display_name} · ${props.group.maker}  (✓ fits  ~ tight  ✗ too big)`}
        options={options()}
        footerHints={[{ title: "enter", label: "download / switch" }, { title: "esc", label: "back" }]}
        current={(data()?.quants ?? []).find((q) => q.current)?.alias}
      />
    </Show>
  )
}

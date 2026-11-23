/**
 * /bench: measure the model that is already loaded, over the running server. The
 * supervisor runs it (POST /bench, GET /bench to poll); nothing is loaded or closed.
 * Comparing several models stays in the terminal: `localcode bench --compare`.
 */
import { createSignal, For, onCleanup } from "solid-js"
import { DialogAlert } from "../ui/dialog-alert"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DialogHeader, DialogLayout, useDialog } from "../ui/dialog"
import { useTheme } from "../context/theme"
import { controlFetch } from "../util/localcode"
import { Keymap } from "../context/keymap"
import type { DialogContext } from "../ui/dialog"

type Size = {
  prompt_tokens: number
  ttft_s: number | null
  prefill_tps: number | null
  gen_tps: number | null
}
export type BenchReport = {
  model: string
  status: string
  reason: string
  context: number
  sizes: Record<string, Size>
  skipped_sizes: number[]
  peak_memory_mb: number | null
  warnings: string[]
}
type BenchStatus = { state: string; progress?: string; report?: BenchReport; error?: string; power?: string | null }

const num = (v: number | null | undefined, digits: number) => (v == null ? "-" : v.toFixed(digits))

/** Table rows for the dialog: one per prompt size. */
export function benchRows(report: BenchReport) {
  return Object.entries(report.sizes)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([size, s]) => ({
      size: `${Math.round(Number(size) / 1024)}K`,
      ttft: num(s.ttft_s, 2),
      prefill: num(s.prefill_tps, 0),
      gen: num(s.gen_tps, 1),
    }))
}

export function benchMemory(report: BenchReport) {
  return report.peak_memory_mb ? `${(report.peak_memory_mb / 1024).toFixed(1)} GB` : "-"
}

function BenchRunning(props: { model: string; onDone: (s: BenchStatus) => void }) {
  const theme = useTheme().surface("dialog")
  const [progress, setProgress] = createSignal("starting")
  const timer = setInterval(async () => {
    try {
      const st = (await (await controlFetch("/bench", { signal: AbortSignal.timeout(5000) })).json()) as BenchStatus
      if (st.progress) setProgress(st.progress)
      if (st.state === "done" || st.state === "error") {
        clearInterval(timer)
        props.onDone(st)
      }
    } catch {
      // the supervisor may be busy for a moment; keep polling
    }
  }, 1500)
  onCleanup(() => clearInterval(timer))
  return (
    <DialogLayout
      header={<DialogHeader title={`Benchmarking ${props.model}`} closeLabel="esc: hide" />}
      footer={{ actions: { secondary: [] } }}
      legacyFooter={<box />}
    >
      <text fg={theme.text.muted} wrapMode="word">
        {progress()}
      </text>
      <text fg={theme.text.muted} wrapMode="word">
        This runs on the loaded model and keeps it busy for a minute or two. Nothing is closed or reloaded.
      </text>
    </DialogLayout>
  )
}

function BenchResult(props: { report: BenchReport; power?: string | null }) {
  const theme = useTheme().surface("dialog")
  const dialog = useDialog()
  Keymap.createLayer(() => ({
    mode: "modal",
    commands: [{ bind: "return", title: "Close", group: "Dialog", run: () => dialog.clear() }],
  }))
  const head = ["Prompt", "First token", "Prompt tok/s", "Gen tok/s"]
  const rows = () => benchRows(props.report)
  const cell = (v: string, w: number) => v.padEnd(w)
  return (
    <DialogLayout
      header={<DialogHeader title={`${props.report.model}`} />}
      footer={{ actions: { primary: [{ title: "close", key: "enter", onTrigger: () => dialog.clear() }] } }}
      legacyFooter={<box />}
    >
      <text fg={theme.text.muted}>{head.map((h) => cell(h, 14)).join("")}</text>
      <For each={rows()}>
        {(r) => (
          <text fg={theme.text.base}>
            {cell(r.size, 14)}
            {cell(`${r.ttft} s`, 14)}
            {cell(r.prefill, 14)}
            {cell(r.gen, 14)}
          </text>
        )}
      </For>
      <text fg={theme.text.muted}>
        Memory about {benchMemory(props.report)} Context {props.report.context.toLocaleString("en-US")}
      </text>
      <For each={[...props.report.warnings, ...(props.power ? [props.power] : [])]}>
        {(w) => (
          <text fg={theme.text.muted} wrapMode="word">
            Note: {w}
          </text>
        )}
      </For>
      <text fg={theme.text.muted} wrapMode="word">
        Compare several models in a terminal: localcode bench --compare
      </text>
    </DialogLayout>
  )
}

export async function runBench(dialog: DialogContext, model?: string) {
  const confirmed = await new Promise<boolean>((resolve) => {
    dialog.replace(
      () => (
        <DialogConfirm
          title="Benchmark this model?"
          message="Measures speed on the model that is loaded now: first token, prompt reading and generation at 1K and 8K tokens. It takes a minute or two and the model is busy meanwhile."
          label={{ confirm: "Start" }}
          onConfirm={() => resolve(true)}
          onCancel={() => resolve(false)}
        />
      ),
      () => resolve(false),
    )
  })
  if (!confirmed) {
    dialog.clear()
    return
  }
  try {
    const r = await controlFetch("/bench", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runs: 2, sizes: [1024, 8192] }),
    })
    const res = (await r.json()) as { error?: string }
    if (res.error) throw new Error(res.error)
  } catch (e) {
    dialog.replace(() => <DialogAlert title="Benchmark" message={e instanceof Error ? e.message : String(e)} />)
    return
  }
  const done = (st: BenchStatus) => {
    if (st.state === "done" && st.report?.status === "ok")
      dialog.replace(() => <BenchResult report={st.report!} power={st.power} />)
    else
      dialog.replace(() => (
        <DialogAlert title="Benchmark" message={st.error ?? st.report?.reason ?? "The benchmark did not finish."} />
      ))
  }
  dialog.replace(() => <BenchRunning model={model ?? "model"} onDone={done} />)
}

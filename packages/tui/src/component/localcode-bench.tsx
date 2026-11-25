/**
 * /bench: measure the model that is already loaded, over the running server. The
 * supervisor runs it (POST /bench, GET /bench to poll); nothing is loaded or closed.
 * Comparing several models stays in the terminal: `localcode bench --compare`.
 */
import { createSignal, For, onCleanup, Show } from "solid-js"
import { DialogAlert } from "../ui/dialog-alert"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DialogSelect } from "../ui/dialog-select"
import {
  compareLine,
  estimateRemaining,
  formatElapsed,
  historyLine,
  progressBar,
  remainingText,
  sortHistory,
  stepLine,
  type CompareRow,
  type HistoryRun,
} from "./localcode-bench-math"
import { DialogHeader, DialogLayout, useDialog } from "../ui/dialog"
import { useTheme } from "../context/theme"
import { controlFetch, getJSON, postJSON } from "../util/localcode"
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
  load_s?: number | null
  warnings: string[]
}
type BenchStatus = {
  state: string
  progress?: string
  report?: BenchReport
  error?: string
  power?: string | null
  elapsed_s?: number
}

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

/** "Loaded in 12.3 s" when the session recorded how long the model took to start. */
export function benchLoad(report: BenchReport) {
  return report.load_s == null ? "" : `Loaded in ${report.load_s.toFixed(1)} s  `
}

export function benchMemory(report: BenchReport) {
  return report.peak_memory_mb ? `${(report.peak_memory_mb / 1024).toFixed(1)} GB` : "-"
}

type Toast = { show: (t: { variant: "info" | "success" | "error" | "warning"; title?: string; message: string; duration?: number }) => void }
type Running = BenchStatus & { step?: number; total?: number; started_at?: number; compare?: CompareRow[]; current?: HistoryRun }

function BenchRunning(props: { model: string; onEnd: (s: Running) => void; ended: { value: boolean } }) {
  const theme = useTheme().surface("dialog")
  const [st, setSt] = createSignal<Running>({ state: "running" })
  const [now, setNow] = createSignal(Date.now() / 1000)
  const clock = setInterval(() => setNow(Date.now() / 1000), 1000)
  const timer = setInterval(async () => {
    try {
      const next = (await (await controlFetch("/bench", { signal: AbortSignal.timeout(5000) })).json()) as Running
      if (next.state === "running") setSt(next)
      else if (!props.ended.value) {
        props.ended.value = true
        clearInterval(timer)
        props.onEnd(next)
      }
    } catch {
      // the supervisor may be busy for a moment; keep polling
    }
  }, 1000)
  onCleanup(() => {
    clearInterval(timer)
    clearInterval(clock)
  })
  const elapsed = () => (st().started_at ? now() - st().started_at! : (st().elapsed_s ?? 0))
  const step = () => st().step ?? 0
  const total = () => st().total ?? 0
  return (
    <DialogLayout
      header={<DialogHeader title={`Benchmarking ${props.model}`} closeLabel="esc: cancel" />}
      footer={{ actions: { secondary: [] } }}
      legacyFooter={<box />}
    >
      <text fg={theme.text.base}>
        {progressBar(step(), total())} {stepLine(step(), total())}
      </text>
      <text fg={theme.text.muted}>
        Elapsed {formatElapsed(elapsed())} · {remainingText(estimateRemaining(step(), total(), elapsed()))}
      </text>
      <text fg={theme.text.muted} wrapMode="word">
        {st().progress ?? "starting"}
      </text>
      <text fg={theme.text.muted} wrapMode="word">
        This runs on the loaded model and keeps it busy. Chat is paused until it ends. Nothing is closed or reloaded.
      </text>
    </DialogLayout>
  )
}

function BenchResult(props: { report: BenchReport; power?: string | null; compare?: CompareRow[] }) {
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
        {benchLoad(props.report)}Memory about {benchMemory(props.report)} Context {props.report.context.toLocaleString("en-US")}
      </text>
      <For each={[...props.report.warnings, ...(props.power ? [props.power] : [])]}>
        {(w) => (
          <text fg={theme.text.muted} wrapMode="word">
            Note: {w}
          </text>
        )}
      </For>
      <Show when={props.compare?.length}>
        <text fg={theme.text.base}>Compare (+ means this run is faster)</text>
        <For each={props.compare}>
          {(r) => (
            <text fg={r.mismatch.length ? theme.text.muted : theme.text.base} wrapMode="word">
              {compareLine(r)}
            </text>
          )}
        </For>
      </Show>
      <text fg={theme.text.muted} wrapMode="word">
        Compare several models in a terminal: localcode bench --compare
      </text>
    </DialogLayout>
  )
}

function BenchHistory(props: { runs: HistoryRun[]; sort: "date" | "gen"; toast: Toast; model?: string }) {
  const dialog = useDialog()
  const reopen = (sort: "date" | "gen" = props.sort) => void showHistory(dialog, props.toast, sort, props.model)
  const rows = () => sortHistory(props.runs, props.sort)
  return (
    <DialogSelect
      title="Past benchmarks"
      options={rows().map((r) => ({
        value: r.id,
        title: historyLine(r),
        description: r.machine ? `${r.machine} · LocalCode ${r.version}` : `LocalCode ${r.version}`,
      }))}
      emptyView={<text>No saved results yet.</text>}
      actions={[
        {
          title: props.sort === "date" ? "sort by speed" : "sort by date",
          command: "dialog.bench.sort",
          bind: "ctrl+s",
          selection: "none",
          onTrigger: () => reopen(props.sort === "date" ? "gen" : "date"),
        },
        {
          title: "delete",
          command: "dialog.bench.delete",
          bind: "ctrl+d",
          onTrigger: (option) =>
            dialog.replace(() => (
              <DialogConfirm
                title="Delete this result?"
                message={option.title}
                label={{ confirm: "Delete" }}
                onConfirm={() =>
                  void postJSON("/bench/history/delete", { id: option.value })
                    .catch((e) => props.toast.show({ variant: "error", message: e instanceof Error ? e.message : String(e) }))
                    .finally(() => reopen())
                }
                onCancel={() => queueMicrotask(() => reopen())}
              />
            )),
        },
      ]}
    />
  )
}

async function showHistory(dialog: DialogContext, toast: Toast, sort: "date" | "gen" = "date", model?: string) {
  try {
    const res = await getJSON<{ runs: HistoryRun[] }>("/bench/history")
    dialog.replace(() => <BenchHistory runs={res.runs} sort={sort} toast={toast} model={model} />)
  } catch (e) {
    dialog.replace(() => <DialogAlert title="Benchmark" message={e instanceof Error ? e.message : String(e)} />)
  }
}

function watch(dialog: DialogContext, toast: Toast, model: string) {
  const ended = { value: false }
  const onEnd = (st: Running) => {
    if (st.state === "cancelled") {
      dialog.clear()
      toast.show({ variant: "info", message: "Benchmark cancelled", duration: 4000 })
    } else if (st.state === "done" && st.report?.status === "ok")
      dialog.replace(() => <BenchResult report={st.report!} power={st.power} compare={st.compare} />)
    else
      dialog.replace(() => (
        <DialogAlert title="Benchmark" message={st.error ?? st.report?.reason ?? "The benchmark did not finish."} />
      ))
  }
  // Esc (or any close) while it runs cancels the run; the dialog never just hides it.
  dialog.replace(
    () => <BenchRunning model={model} onEnd={onEnd} ended={ended} />,
    () => {
      if (ended.value) return
      ended.value = true
      void controlFetch("/bench/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then(() =>
        toast.show({ variant: "info", message: "Benchmark cancelled", duration: 4000 }),
      )
    },
  )
}

async function startBench(dialog: DialogContext, toast: Toast, model: string) {
  const confirmed = await new Promise<boolean>((resolve) => {
    dialog.replace(
      () => (
        <DialogConfirm
          title="Benchmark this model?"
          message="Measures speed on the model that is loaded now: first token, prompt reading and generation at 1K and 8K tokens. It takes a minute or two, the model is busy meanwhile and chat is paused."
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
    // 409 with a run in progress: show that run instead of starting another.
    if (res.error && r.status !== 409) throw new Error(res.error)
    if (res.error && !String(res.error).includes("already running")) throw new Error(res.error)
  } catch (e) {
    dialog.replace(() => <DialogAlert title="Benchmark" message={e instanceof Error ? e.message : String(e)} />)
    return
  }
  watch(dialog, toast, model)
}

export async function runBench(dialog: DialogContext, toast: Toast, model?: string) {
  const name = model ?? "model"
  const st = await controlFetch("/bench", { signal: AbortSignal.timeout(5000) })
    .then((r) => r.json() as Promise<BenchStatus>)
    .catch(() => undefined)
  // Only one at a time: with a run in progress, show its progress instead of starting another.
  if (st?.state === "running") return watch(dialog, toast, name)
  const history = await getJSON<{ runs: HistoryRun[] }>("/bench/history").catch(() => ({ runs: [] as HistoryRun[] }))
  if (!history.runs.length) return startBench(dialog, toast, name)
  dialog.replace(() => (
    <DialogSelect
      title="Benchmark"
      options={[
        { value: "run", title: `Run benchmark on ${name}` },
        { value: "history", title: "View past results", description: `${history.runs.length} saved` },
      ]}
      onSelect={(o) => (o.value === "run" ? void startBench(dialog, toast, name) : void showHistory(dialog, toast, "date", name))}
    />
  ))
}

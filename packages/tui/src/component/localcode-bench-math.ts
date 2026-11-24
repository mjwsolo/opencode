/** Pure helpers for the /bench dialogs: progress, time and comparison text. */

export function formatElapsed(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}

export function progressBar(step: number, total: number, width = 24) {
  const done = total > 0 ? Math.min(width, Math.round((Math.max(0, step) / total) * width)) : 0
  return "█".repeat(done) + "░".repeat(width - done)
}

/** Seconds left, judged from the steps done so far; undefined until one step has finished. */
export function estimateRemaining(step: number, total: number, elapsed: number) {
  if (step < 1 || total <= step || elapsed <= 0) return undefined
  return Math.round((elapsed / step) * (total - step))
}

export function stepLine(step: number, total: number) {
  return total > 0 ? `step ${Math.min(total, step + 1)} of ${total}` : "starting"
}

export function remainingText(seconds: number | undefined) {
  if (seconds === undefined) return "estimating"
  if (seconds < 10) return "a few seconds left"
  return `about ${formatElapsed(seconds)} left`
}

export function formatDelta(pct: number | null | undefined) {
  if (pct == null) return "-"
  return `${pct > 0 ? "+" : ""}${pct}%`
}

export type Delta = { gen_pct: number | null; prefill_pct: number | null; ttft_pct: number | null }
export type HistoryRun = {
  id: string
  date: string
  version: string
  model: string
  display: string
  quant: string
  machine: string
  ttft_s: number | null
  prefill_1k: number | null
  prefill_8k: number | null
  gen_1k: number | null
  gen_8k: number | null
  peak_memory_mb: number | null
  warnings: string[]
  throttled: boolean
  on_battery: boolean
}
export type CompareRow = HistoryRun & { relation: string; delta: Delta; mismatch: string[] }

const n = (v: number | null | undefined, d: number) => (v == null ? "-" : v.toFixed(d))

export function compareLine(r: CompareRow) {
  const label = r.relation === "previous run" ? `${r.model} (previous)` : r.model
  const flag = r.mismatch.length ? `  differs: ${r.mismatch.join(", ")}` : ""
  return `${label}: gen ${n(r.gen_1k, 1)} (${formatDelta(r.delta.gen_pct)}), prompt ${n(r.prefill_1k, 0)} (${formatDelta(r.delta.prefill_pct)}), first token ${n(r.ttft_s, 2)} s (${formatDelta(r.delta.ttft_pct)})${flag}`
}

export function historyLine(r: HistoryRun) {
  const when = r.date.slice(0, 16).replace("T", " ")
  const notes = [r.throttled ? "throttled" : "", r.on_battery ? "battery" : ""].filter(Boolean).join(", ")
  return `${when}  ${r.model}  gen ${n(r.gen_1k, 1)}/${n(r.gen_8k, 1)}  prompt ${n(r.prefill_1k, 0)}/${n(r.prefill_8k, 0)}  first ${n(r.ttft_s, 2)} s  ${r.peak_memory_mb ? (r.peak_memory_mb / 1024).toFixed(1) + " GB" : "-"}${notes ? "  " + notes : ""}`
}

export function sortHistory(runs: HistoryRun[], by: "date" | "gen") {
  return [...runs].sort((a, b) => (by === "gen" ? (b.gen_1k ?? 0) - (a.gen_1k ?? 0) : b.date.localeCompare(a.date)))
}

/** Chat is held while a benchmark runs: it would skew the numbers and compete for the GPU. */
export const benchBlocksChat = (st: { bench_running?: boolean } | undefined) => !!st?.bench_running
export const BENCH_BLOCK_NOTE = "Benchmark running (esc in /bench to cancel)"

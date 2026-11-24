import { expect, test } from "bun:test"
import {
  benchBlocksChat,
  compareLine,
  estimateRemaining,
  formatDelta,
  formatElapsed,
  progressBar,
  remainingText,
  sortHistory,
  stepLine,
  type CompareRow,
  type HistoryRun,
} from "../src/component/localcode-bench-math"

test("elapsed time is mm:ss", () => {
  expect(formatElapsed(0)).toBe("00:00")
  expect(formatElapsed(65.9)).toBe("01:05")
  expect(formatElapsed(-3)).toBe("00:00")
})

test("progress bar fills in proportion and never overflows", () => {
  expect(progressBar(0, 6, 6)).toBe("░░░░░░")
  expect(progressBar(3, 6, 6)).toBe("███░░░")
  expect(progressBar(9, 6, 6)).toBe("██████")
  expect(progressBar(1, 0, 4)).toBe("░░░░")
})

test("the estimate needs a finished step and shrinks as steps complete", () => {
  expect(estimateRemaining(0, 6, 30)).toBeUndefined()
  expect(estimateRemaining(2, 6, 40)).toBe(80)
  expect(estimateRemaining(6, 6, 100)).toBeUndefined()
  expect(remainingText(undefined)).toBe("estimating")
  expect(remainingText(80)).toBe("about 01:20 left")
  expect(remainingText(4)).toBe("a few seconds left")
})

test("the step line counts the step in progress", () => {
  expect(stepLine(0, 6)).toBe("step 1 of 6")
  expect(stepLine(5, 6)).toBe("step 6 of 6")
  expect(stepLine(6, 6)).toBe("step 6 of 6")
  expect(stepLine(0, 0)).toBe("starting")
})

const run = (over: Partial<HistoryRun>): HistoryRun => ({
  id: "a#0", date: "2026-01-01T10:00:00", version: "0.5.0", model: "m", display: "m", quant: "", machine: "",
  ttft_s: 1, prefill_1k: 500, prefill_8k: 450, gen_1k: 40, gen_8k: 38, peak_memory_mb: 20480, warnings: [],
  throttled: false, on_battery: false, ...over,
})

test("deltas carry a sign and comparison rows say why they may differ", () => {
  expect(formatDelta(12)).toBe("+12%")
  expect(formatDelta(-5)).toBe("-5%")
  expect(formatDelta(null)).toBe("-")
  const row: CompareRow = { ...run({ model: "other" }), relation: "best run", delta: { gen_pct: 12, prefill_pct: null, ttft_pct: -3 }, mismatch: ["LocalCode 0.4.0", "on battery"] }
  const line = compareLine(row)
  expect(line).toContain("gen 40.0 (+12%)")
  expect(line).toContain("differs: LocalCode 0.4.0, on battery")
})

test("history sorts by date or by generation speed", () => {
  const runs = [run({ id: "1", date: "2026-01-01", gen_1k: 50 }), run({ id: "2", date: "2026-01-03", gen_1k: 30 })]
  expect(sortHistory(runs, "date").map((r) => r.id)).toEqual(["2", "1"])
  expect(sortHistory(runs, "gen").map((r) => r.id)).toEqual(["1", "2"])
})

test("chat is blocked only while the supervisor reports a running benchmark", () => {
  expect(benchBlocksChat({ bench_running: true })).toBe(true)
  expect(benchBlocksChat({ bench_running: false })).toBe(false)
  expect(benchBlocksChat(undefined)).toBe(false)
})

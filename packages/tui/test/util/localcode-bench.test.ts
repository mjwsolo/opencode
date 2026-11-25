import { expect, test } from "bun:test"
import { benchLoad, benchMemory, benchRows, type BenchReport } from "../../src/component/localcode-bench"
import { LOCALCODE_MENU } from "../../src/util/localcode-menu"

const report: BenchReport = {
  model: "m",
  status: "ok",
  reason: "",
  context: 16384,
  sizes: {
    "8192": { prompt_tokens: 8000, ttft_s: 12.345, prefill_tps: 650.4, gen_tps: 31.04 },
    "1024": { prompt_tokens: 1000, ttft_s: 1.5, prefill_tps: 700, gen_tps: null },
  },
  skipped_sizes: [],
  peak_memory_mb: 10240,
  warnings: [],
}

test("bench rows are ordered by prompt size and rounded", () => {
  expect(benchRows(report)).toEqual([
    { size: "1K", ttft: "1.50", prefill: "700", gen: "-" },
    { size: "8K", ttft: "12.35", prefill: "650", gen: "31.0" },
  ])
  expect(benchMemory(report)).toBe("10.0 GB")
})

test("load time shows only when the session recorded it", () => {
  expect(benchLoad(report)).toBe("")
  expect(benchLoad({ ...report, load_s: 27.04 })).toBe("Loaded in 27.0 s  ")
})

test("/bench is in the menu allowlist", () => {
  expect(LOCALCODE_MENU.has("bench")).toBe(true)
})

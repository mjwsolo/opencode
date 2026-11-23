import { expect, test } from "bun:test"
import { formatStepSpeed, stepSpeed } from "../../src/util/localcode-speed"

const tokens = (input: number, output: number) => ({ input, output, reasoning: 0, cache: { read: 0, write: 0 } })

test("speed from the step's timestamps and token counts", () => {
  const speed = stepSpeed({ time: { created: 1000, firstToken: 2200, streamed: 12200 }, tokens: tokens(4800, 381) })
  expect(speed?.ttftS).toBeCloseTo(1.2)
  expect(speed?.genTps).toBeCloseTo(38)
  expect(speed?.promptTps).toBeCloseTo(4000)
  expect(formatStepSpeed(speed)).toBe("38.0 tok/s · 1.2 s to first token · 4,000 tok/s prompt")
})

test("short replies and small prompts leave the noisy numbers out", () => {
  const speed = stepSpeed({ time: { created: 0, firstToken: 500, streamed: 600 }, tokens: tokens(50, 5) })
  expect(speed).toEqual({ ttftS: 0.5 })
  expect(formatStepSpeed(speed)).toBeUndefined()
})

test("no first-token time means no line", () => {
  expect(stepSpeed({ time: { created: 0 }, tokens: tokens(10, 100) })).toBeUndefined()
  expect(formatStepSpeed(undefined)).toBeUndefined()
})

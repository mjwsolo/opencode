import { expect, test } from "bun:test"
import { formatContextGauge, stepContextTokens } from "../src/util/session"

test("gauge shows tokens, served context size and percent", () => {
  expect(formatContextGauge(12400, 131072)).toBe("ctx 12.4K/131K (9%)")
  expect(formatContextGauge(900, 8192)).toBe("ctx 900/8.2K (11%)")
  expect(formatContextGauge(131000, 131072)).toBe("ctx 131K/131K (100%)")
})

test("gauge drops the denominator without a limit and hides when empty", () => {
  expect(formatContextGauge(5000, undefined)).toBe("ctx 5K")
  expect(formatContextGauge(0, 4096)).toBeUndefined()
})

test("a step's context tokens add prompt, cache and generated tokens", () => {
  expect(stepContextTokens({ input: 100, output: 20, reasoning: 5, cache: { read: 50, write: 25 } })).toBe(200)
})

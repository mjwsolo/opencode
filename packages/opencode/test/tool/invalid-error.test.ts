import { expect, test } from "bun:test"
import { invalidToolError } from "../../src/tool/invalid-error"

test("keeps a short validation error actionable", () => {
  const error = "filePath: expected string, received number"
  expect(invalidToolError(error)).toBe(error)
})

test("omits runaway tool arguments while preserving the parser diagnosis", () => {
  const error = `Invalid input for tool write: JSON parsing failed: Text: ${"repeated todo ".repeat(10000)}\nError message: JSON Parse error: Unterminated string`
  const result = invalidToolError(error)
  expect(result.length).toBeLessThan(2000)
  expect(result).toContain("Unterminated string")
  expect(result).toContain("The tool did not run")
  expect(result).toContain("Split large writes")
})

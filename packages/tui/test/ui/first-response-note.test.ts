import { expect, test } from "bun:test"
import { firstResponseNote } from "../../src/ui/first-response-note"

test("explains real cold prefill and warm-up, never cached or later turns", () => {
  const cold = { phase: "reading", request_id: "0:2", todo: 4000, context_ready: false }
  expect(firstResponseNote(cold)).toContain("instructions and tools")
  expect(firstResponseNote({ ...cold, warmup: true })).toContain("usually start faster")
  expect(firstResponseNote({ ...cold, context_ready: true })).toBe("")
  expect(firstResponseNote({ ...cold, todo: 3 })).toBe("")
  expect(firstResponseNote({ ...cold, request_id: "3:4" })).toBe("")
  expect(firstResponseNote({ ...cold, context_ready: undefined })).toBe("")
  expect(firstResponseNote({ ...cold, phase: "generating" })).toBe("")
  expect(firstResponseNote({ phase: "unknown" })).toBe("")
  expect(firstResponseNote({ phase: "idle" })).toBe("")
  // A switch to another cold server can show the explanation again.
  expect(firstResponseNote({ ...cold, request_id: "0:1" })).not.toBe("")
})

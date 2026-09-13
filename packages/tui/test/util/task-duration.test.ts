import { expect, test } from "bun:test"
import { taskDuration } from "../../src/util/task-duration"

test("hidden continuations count from the real request, not the last nudge", () => {
  const messages = [
    { id: "old", role: "user", time: { created: 0 } },
    { id: "request", role: "user", time: { created: 1000 } },
    { id: "reply", role: "assistant", time: { created: 2000 } },
    { id: "nudge", role: "user", time: { created: 10000 } },
    { id: "later", role: "user", time: { created: 30000 } },
  ]
  const parts = { nudge: [{ type: "text", synthetic: true }] }
  expect(taskDuration(messages, parts, "nudge", 11000)).toBe(10000)
  expect(taskDuration(messages, parts, "request", 5000)).toBe(4000)
  expect(taskDuration(messages, parts, "missing", 5000)).toBe(0)
})

test("a request with a file is a real task boundary even alongside synthetic text", () => {
  const messages = [{ id: "file", role: "user", time: { created: 1000 } }]
  const parts = { file: [{ type: "text", synthetic: true }, { type: "file" }] }
  expect(taskDuration(messages, parts, "file", 3000)).toBe(2000)
})

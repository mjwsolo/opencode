import { expect, test } from "bun:test"
import { todoLines } from "../../../src/routes/session/index"

test("todo lines mark each status and skip malformed items", () => {
  expect(
    todoLines({
      todos: [
        { content: "plan", status: "completed" },
        { content: "build", status: "in_progress" },
        { content: "test", status: "pending" },
        { content: "drop", status: "cancelled" },
        { status: "pending" },
        "junk",
      ],
    }),
  ).toEqual([
    { text: "[x] plan", open: false },
    { text: "[>] build", open: true },
    { text: "[ ] test", open: true },
    { text: "[-] drop", open: false },
  ])
  expect(todoLines({})).toEqual([])
})

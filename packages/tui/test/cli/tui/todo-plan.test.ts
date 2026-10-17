import { expect, test } from "bun:test"
import { currentPlan, parseTodos } from "../../../src/util/todo"

test("plan entries keep their status and skip malformed items", () => {
  expect(
    parseTodos([
      { content: "plan", status: "completed" },
      { content: "build", status: "in_progress" },
      { content: "test" },
      { status: "pending" },
      "junk",
    ]),
  ).toEqual([
    { content: "plan", status: "completed" },
    { content: "build", status: "in_progress" },
    { content: "test", status: "pending" },
  ])
  expect(parseTodos(undefined)).toEqual([])
})

test("the current plan is the last completed checklist update", () => {
  const update = (status: string, todos: unknown) => ({ type: "tool", name: "todowrite", state: { status, input: { todos } } })
  const messages = [
    { type: "assistant", content: [update("completed", [{ content: "old", status: "pending" }])] },
    { type: "user", content: [{ type: "text", text: "go" }] },
    {
      type: "assistant",
      content: [
        update("completed", [{ content: "new", status: "in_progress" }]),
        { type: "tool", name: "read", state: { status: "completed", input: {} } },
        update("error", [{ content: "failed", status: "pending" }]),
      ],
    },
  ]
  expect(currentPlan(messages)).toEqual([{ content: "new", status: "in_progress" }])
  expect(currentPlan([])).toEqual([])
})

/** LocalCode's checklist tool (`todowrite`, registered by its plugin): plan entries from its input. */
export type Todo = { readonly content: string; readonly status: string }

export function parseTodos(value: unknown): Todo[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((todo) => {
    if (!todo || typeof todo !== "object") return []
    const content = "content" in todo && typeof todo.content === "string" ? todo.content : undefined
    if (!content) return []
    const status = "status" in todo && typeof todo.status === "string" ? todo.status : "pending"
    return [{ content, status }]
  })
}

type ToolPart = { readonly type: string; readonly name?: string; readonly state?: { readonly status?: string; readonly input?: unknown } }

/** The plan as of the last completed checklist update in these messages. */
export function currentPlan(messages: readonly { readonly type?: string; readonly content?: unknown }[]): Todo[] {
  for (let index = messages.length - 1; index >= 0; index--) {
    const content = messages[index]?.content
    if (!Array.isArray(content)) continue
    for (let part = content.length - 1; part >= 0; part--) {
      const item = content[part] as ToolPart | undefined
      if (item?.type !== "tool" || item.name !== "todowrite" || item.state?.status !== "completed") continue
      const input = item.state.input
      return parseTodos(input && typeof input === "object" && "todos" in input ? input.todos : undefined)
    }
  }
  return []
}

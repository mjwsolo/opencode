export function taskDuration(
  messages: { id: string; role: string; time: { created: number } }[],
  parts: Record<string, { type: string; synthetic?: boolean }[] | undefined>,
  parentID: string,
  completed: number,
) {
  const parent = messages.findIndex((message) => message.id === parentID)
  if (parent < 0) return 0
  const user = messages.slice(0, parent + 1).findLast((message) => {
    if (message.role !== "user") return false
    const content = parts[message.id]
    return !content?.length || !content.every((part) => part.type === "text" && part.synthetic)
  })
  return user ? Math.max(0, completed - user.time.created) : 0
}

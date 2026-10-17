type Colors = { readonly text: { readonly muted: unknown; readonly feedback: { readonly warning: { readonly base: unknown } } } }

/** One plan entry: [✓] completed, [•] in progress (highlighted), [ ] pending or cancelled. */
export function TodoItem(props: { theme: Colors; status: string; content: string }) {
  const color = () =>
    (props.status === "in_progress" ? props.theme.text.feedback.warning.base : props.theme.text.muted) as never
  return (
    <box flexDirection="row" gap={0}>
      <text flexShrink={0} fg={color()}>
        [{props.status === "completed" ? "✓" : props.status === "in_progress" ? "•" : " "}]{" "}
      </text>
      <text flexGrow={1} wrapMode="word" fg={color()}>
        {props.content}
      </text>
    </box>
  )
}

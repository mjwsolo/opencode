import { Plugin } from "@opencode/plugin/tui"
import { createMemo, createSignal, For, Show } from "solid-js"
import { TodoItem } from "../../component/todo-item"
import { currentPlan } from "../../util/todo"

/** The current plan (LocalCode's checklist tool) while any item is still open. */
export function SidebarPlan(props: { context: Plugin.Context; sessionID: string }) {
  const theme = props.context.theme
  const [open, setOpen] = createSignal(true)
  const list = createMemo(() => currentPlan(props.context.data.session.message.list(props.sessionID)))
  const show = createMemo(() => list().some((item) => item.status !== "completed" && item.status !== "cancelled"))
  return (
    <Show when={show()}>
      <box>
        <box flexDirection="row" gap={1} onMouseDown={() => list().length > 2 && setOpen((value) => !value)}>
          <Show when={list().length > 2}>
            <text fg={theme.text.base}>{open() ? "▼" : "▶"}</text>
          </Show>
          <text fg={theme.text.base}>
            <b>Current plan</b>
          </text>
        </box>
        <Show when={list().length <= 2 || open()}>
          <For each={list()}>{(item) => <TodoItem theme={theme} status={item.status} content={item.content} />}</For>
        </Show>
      </box>
    </Show>
  )
}

export default Plugin.define({
  id: "opencode.sidebar.plan",
  setup(context) {
    context.ui.slot({
      append: "sidebar.content",
      render: (props) => <SidebarPlan context={context} sessionID={props.sessionID} />,
    })
  },
})

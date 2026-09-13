import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo, Show } from "solid-js"

const id = "internal:sidebar-footer"

function View(props: { api: TuiPluginApi; sessionID: string }) {
  const theme = () => props.api.theme.current
  const has = createMemo(() => props.api.state.provider.length > 0)
  const done = createMemo(() => props.api.kv.get("dismissed_getting_started", false))
  const show = createMemo(() => !has() && !done())


  return (
    <box gap={1}>
      <Show when={show()}>
        <box
          backgroundColor={theme().backgroundElement}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          paddingRight={2}
          flexDirection="row"
          gap={1}
        >
          <text flexShrink={0} fg={theme().text}>
            ⬖
          </text>
          <box flexGrow={1} gap={1}>
            <box flexDirection="row" justifyContent="space-between">
              <text fg={theme().text}>
                <b>Getting started</b>
              </text>
              <text fg={theme().textMuted} onMouseDown={() => props.api.kv.set("dismissed_getting_started", true)}>
                ✕
              </text>
            </box>
            <text fg={theme().textMuted}>localcode runs models on this machine. Nothing leaves your computer.</text>
            <text fg={theme().textMuted}>Pick a model, then the quant that fits your RAM; it downloads and loads locally.</text>
            <box flexDirection="row" gap={1} justifyContent="space-between">
              <text fg={theme().text}>Choose a model</text>
              <text fg={theme().textMuted}>/models</text>
            </box>
          </box>
        </box>
      </Show>
      <text fg={theme().textMuted}>{props.api.app.version}</text>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_footer(_ctx, props) {
        return <View api={api} sessionID={props.session_id} />
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin

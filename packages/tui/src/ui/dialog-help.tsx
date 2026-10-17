import { Keymap } from "../context/keymap"
import { useTheme } from "../context/theme"
import { DialogHeader, DialogLayout, useDialog } from "./dialog"

export function DialogHelp() {
  const dialog = useDialog()
  const theme = useTheme().surface("dialog")
  const shortcuts = Keymap.useShortcuts()
  const shortcut = (id: string) => {
    const key = shortcuts.get(id)
    return key ? ` or ${key}` : ""
  }

  Keymap.createLayer(() => ({
    mode: "modal",
    commands: [
      { bind: "return", title: "Close help", group: "Dialog", run: () => dialog.clear() },
      { bind: "escape", title: "Close help", group: "Dialog", run: () => dialog.clear() },
    ],
  }))

  return (
    <DialogLayout
      header={<DialogHeader title="localcode help" closeLabel="esc/enter" />}
      footer={{ actions: { primary: [{ title: "ok", key: "enter", onTrigger: () => dialog.clear() }] } }}
      legacyFooter={
        <box flexDirection="row" justifyContent="flex-end">
          <box
            paddingLeft={3}
            paddingRight={3}
            backgroundColor={theme.background.action.primary.focused}
            onMouseUp={() => dialog.clear()}
          >
            <text fg={theme.text.action.primary.focused}>ok</text>
          </box>
        </box>
      }
    >
      <box gap={1}>
        <text fg={theme.text.muted}>
          Models run on this machine. Model downloads and web tools contact external services when you request them.
        </text>
        <box>
          <text fg={theme.text.muted}>
            <span style={{ fg: theme.text.base }}>/models</span>
            {shortcut("model.list")} picks a model, then the quant to download and load
          </text>
          <text fg={theme.text.muted}>
            <span style={{ fg: theme.text.base }}>/status</span>
            {shortcut("opencode.status")} shows the loaded model and MCP servers
          </text>
          <text fg={theme.text.muted}>
            <span style={{ fg: theme.text.base }}>/sessions</span>
            {shortcut("session.list")} lists sessions; resume one later with{" "}
            <span style={{ fg: theme.text.base }}>localcode --resume &lt;id&gt;</span>
          </text>
          <text fg={theme.text.muted}>
            <span style={{ fg: theme.text.base }}>{shortcuts.get("command.palette.show") || "/"}</span> lists every
            action available in the current context
          </text>
        </box>
        <text fg={theme.text.muted}>
          Configure the agent in <span style={{ fg: theme.text.base }}>localcode.json</span> and the interface in{" "}
          <span style={{ fg: theme.text.base }}>cli.json</span>; project-local settings live in{" "}
          <span style={{ fg: theme.text.base }}>.localcode-agent/</span>.
        </text>
      </box>
    </DialogLayout>
  )
}

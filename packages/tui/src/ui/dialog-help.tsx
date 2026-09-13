import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "./dialog"
import { useBindings, useCommandShortcut } from "../keymap"

export function DialogHelp() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const commandShortcut = useCommandShortcut("command.palette.show")
  const modelShortcut = useCommandShortcut("model.list")
  const statusShortcut = useCommandShortcut("localcode.status")
  const sessionShortcut = useCommandShortcut("session.list")

  useBindings(() => ({
    bindings: [
      { key: "return", desc: "Close help", group: "Dialog", cmd: () => dialog.clear() },
      { key: "escape", desc: "Close help", group: "Dialog", cmd: () => dialog.clear() },
    ],
  }))

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          localcode help
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc/enter
        </text>
      </box>
      <box paddingBottom={1} gap={1}>
        <text fg={theme.textMuted}>
          Models run on this machine. Model downloads and web tools contact external services when you request them.
        </text>
        <box>
          <text fg={theme.textMuted}>
            <span style={{ fg: theme.text }}>/models</span>
            {modelShortcut() ? ` or ${modelShortcut()}` : ""} picks a model, then the quant to download and load
          </text>
          <text fg={theme.textMuted}>
            <span style={{ fg: theme.text }}>/status</span>
            {statusShortcut() ? ` or ${statusShortcut()}` : ""} shows the loaded model, MCP servers, and LSPs
          </text>
          <text fg={theme.textMuted}>
            <span style={{ fg: theme.text }}>/sessions</span>
            {sessionShortcut() ? ` or ${sessionShortcut()}` : ""} lists sessions; resume one later with{" "}
            <span style={{ fg: theme.text }}>localcode -s &lt;id&gt;</span>
          </text>
          <text fg={theme.textMuted}>
            <span style={{ fg: theme.text }}>{commandShortcut() || "/"}</span> lists every action
            available in the current context
          </text>
        </box>
        <text fg={theme.textMuted}>
          Configure the agent in <span style={{ fg: theme.text }}>localcode.json</span> and the TUI in{" "}
          <span style={{ fg: theme.text }}>tui.json</span>; project-local settings live in{" "}
          <span style={{ fg: theme.text }}>.localcode-agent/</span>.
        </text>
      </box>
      <box flexDirection="row" justifyContent="flex-end" paddingBottom={1}>
        <box paddingLeft={3} paddingRight={3} backgroundColor={theme.primary} onMouseUp={() => dialog.clear()}>
          <text fg={theme.selectedListItemText}>ok</text>
        </box>
      </box>
    </box>
  )
}

import { DialogSelect } from "../ui/dialog-select"
import { useKeymapSelector, useOpencodeKeymap } from "../keymap"

const preferences = new Set([
  "terminal.title.toggle", "app.toggle.animations", "app.toggle.file_context",
  "app.toggle.diffwrap", "app.toggle.paste_summary", "app.toggle.session_directory_filter",
  "permission.mode", "session.toggle.conceal",
])

export function DialogSettings(props: { permissionsOnly?: boolean }) {
  const keymap = useOpencodeKeymap()
  const entries = useKeymapSelector((keymap) => keymap.getCommandEntries({
    namespace: "palette",
    visibility: "reachable",
    filter: (command) => props.permissionsOnly ? command.name === "permission.mode" : preferences.has(command.name),
  }))
  return <DialogSelect
    title={props.permissionsOnly ? "Permissions" : "Settings"}
    placeholder="Search settings"
    footerHints={[{ title: "toggle", label: "enter" }, { title: "close", label: "esc" }]}
    options={entries().map(({ command }) => {
      const title = String(command.title)
      const label = title.replace(/^(Enable|Disable) /, "")
      return {
        title: label.charAt(0).toUpperCase() + label.slice(1),
        value: command.name,
        footer: title.startsWith("Disable ") ? "On" : "Off",
        onSelect: () => { keymap.dispatchCommand(command.name) },
      }
    })}
  />
}

import { TextAttributes } from "@opentui/core"
import { For } from "solid-js"
import { useTheme } from "../context/theme"
import { logo } from "../logo"

export function Logo() {
  const { theme } = useTheme()
  return (
    <box>
      <For each={logo.left}>
        {(line, index) => (
          <box flexDirection="row" gap={2}>
            <text fg={theme.primary} attributes={TextAttributes.BOLD} selectable={false}>
              {line}
            </text>
            <text
              fg={index() === 1 ? theme.text : theme.textMuted}
              attributes={index() === 1 ? TextAttributes.BOLD : undefined}
              selectable={false}
            >
              {logo.right[index()]}
            </text>
          </box>
        )}
      </For>
    </box>
  )
}

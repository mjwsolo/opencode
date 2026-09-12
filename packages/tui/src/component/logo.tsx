import { TextAttributes } from "@opentui/core"
import { For } from "solid-js"
import { useTheme } from "../context/theme"
import { logo } from "../logo"

export function Logo() {
  const { theme } = useTheme()
  const mark = (line: string) => {
    const i = line.indexOf("▪")
    if (i === -1) return <text fg={theme.text} attributes={TextAttributes.BOLD} selectable={false}>{line}</text>
    return (
      <text fg={theme.text} attributes={TextAttributes.BOLD} selectable={false}>
        {line.slice(0, i)}
        <span style={{ fg: theme.primary }}>▪</span>
        {line.slice(i + 1)}
      </text>
    )
  }
  return (
    <box>
      <For each={logo.left}>
        {(line, index) => (
          <box flexDirection="row" gap={2}>
            {mark(line)}
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

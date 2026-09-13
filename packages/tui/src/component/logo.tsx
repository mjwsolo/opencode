import { TextAttributes } from "@opentui/core"
import { For } from "solid-js"
import { useTheme } from "../context/theme"
import { logoImage } from "../logo-image"
import { logo } from "../logo"

/**
 * The docs' house icon rendered from its real pixels: every cell is a half-block
 * whose top and bottom colours come from the PNG (see logo-image.ts), with the
 * wordmark and slogan beside it.
 */
export function Logo() {
  const { theme } = useTheme()
  const rows = logoImage
  const mid = Math.floor(rows.length / 2)
  return (
    <box>
      <For each={rows}>
        {(row, index) => (
          <box flexDirection="row" gap={2}>
            <text selectable={false}>
              <For each={row}>
                {([top, bottom]) =>
                  top && bottom ? (
                    <span style={{ fg: top, bg: bottom }}>▀</span>
                  ) : top ? (
                    <span style={{ fg: top }}>▀</span>
                  ) : bottom ? (
                    <span style={{ fg: bottom }}>▄</span>
                  ) : (
                    <span> </span>
                  )
                }
              </For>
            </text>
            <text
              fg={index() === mid - 1 ? theme.text : theme.textMuted}
              attributes={index() === mid - 1 ? TextAttributes.BOLD : undefined}
              selectable={false}
            >
              {index() === mid - 1 ? logo.right[1] : index() === mid ? logo.right[2] : ""}
            </text>
          </box>
        )}
      </For>
    </box>
  )
}

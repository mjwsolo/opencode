import { TextAttributes } from "@opentui/core"
import { For, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { tint } from "../theme/color"
import { logo, logoSmall, slogan } from "../logo"

export function Logo() {
  const theme = useTheme()
  const dimensions = useTerminalDimensions()
  const rowsOf = (mark: typeof logo) => mark.left.map((line, index) => `${line} ${mark.right[index]}`)
  const fullWidth = rowsOf(logo)[0]!.length + 3
  const smallWidth = rowsOf(logoSmall)[0]!.length + 3
  const rows = () => rowsOf(dimensions().width >= Math.max(54, fullWidth) ? logo : logoSmall)
  // The wordmark is the brand blue in every theme mode.
  const brand = () => theme.hue.interactive[200]

  return (
    <Show when={dimensions().height >= 12}>
      <box alignItems="center" gap={1}>
        <Show
          when={dimensions().width >= smallWidth + 2}
          fallback={
            <text fg={brand()} attributes={TextAttributes.BOLD} selectable={false}>
              localcode
            </text>
          }
        >
          <box flexDirection="row" gap={2}>
            <box>
              <For each={rows()}>
                {(line) => (
                  <text selectable={false}>
                    <For each={Array.from(line)}>
                      {(char) => {
                        const shadow = () => tint(theme.background.base, brand(), 0.2)
                        return (
                          <span
                            style={{
                              fg: "~,".includes(char) ? shadow() : brand(),
                              bg: "_^".includes(char) ? shadow() : undefined,
                            }}
                          >
                            {char === "_" ? " " : char === "^" || char === "~" ? "▀" : char === "," ? "▄" : char}
                          </span>
                        )
                      }}
                    </For>
                  </text>
                )}
              </For>
            </box>
            <text fg={brand()} selectable={false}>
              ✦
            </text>
          </box>
        </Show>
        <text fg={theme.text.muted}>{slogan}</text>
      </box>
    </Show>
  )
}

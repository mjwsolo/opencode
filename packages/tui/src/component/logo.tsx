import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js"
import { tint, useTheme } from "../context/theme"
import { useKV } from "../context/kv"
import { logo } from "../logo"

export function Logo() {
  const { theme } = useTheme()
  const kv = useKV()
  const dimensions = useTerminalDimensions()
  const [frame, setFrame] = createSignal(0)
  const animated = () => kv.get("animations_enabled", true)
  const rows = logo.left.map((line, index) => `${line} ${logo.right[index]}`)

  createEffect(() => {
    if (!animated()) return
    const timer = setInterval(() => setFrame((value) => (value + 1) % 64), 140)
    onCleanup(() => clearInterval(timer))
  })

  return (
    <box alignItems="center" gap={1}>
      <Show
        when={dimensions().width >= 54}
        fallback={<text fg={theme.primary} attributes={TextAttributes.BOLD}>localcode</text>}
      >
        <box flexDirection="row" gap={2}>
          <box>
            <For each={rows}>
              {(line) => (
                <text selectable={false}>
                  <For each={Array.from(line)}>
                    {(char, column) => {
                      const color = () =>
                        animated() && Math.abs(column() - frame()) < 2
                          ? tint(theme.primary, theme.text, 0.4)
                          : theme.primary
                      const shadow = () => tint(theme.background, color(), 0.2)
                      return (
                        <span style={{ fg: "~,".includes(char) ? shadow() : color(), bg: "_^".includes(char) ? shadow() : undefined }}>
                          {char === "_" ? " " : char === "^" || char === "~" ? "▀" : char === "," ? "▄" : char}
                        </span>
                      )
                    }}
                  </For>
                </text>
              )}
            </For>
          </box>
          <text fg={theme.primary} selectable={false}>
            {animated() ? ["·", "✧", "✦", "✧"][Math.floor(frame() / 4) % 4] : "✦"}
          </text>
        </box>
      </Show>
      <text fg={theme.textMuted}>Agentic coding. Local models. On your Mac.</text>
    </box>
  )
}

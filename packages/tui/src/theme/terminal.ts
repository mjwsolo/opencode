import { RGBA, type TerminalColors } from "@opentui/core"
import { generateGrayScale } from "./system"

type Mode = "dark" | "light"
type Source = Record<string, any>

const cache = new WeakMap<object, Map<string, Source>>()

function hex(color: RGBA, alpha = 255) {
  const part = (value: number) => Math.round(value * 255).toString(16).padStart(2, "0")
  return `#${part(color.r)}${part(color.g)}${part(color.b)}${alpha.toString(16).padStart(2, "0")}`.replace(/ff$/, "")
}

/** The terminal's own background colour, or undefined when it did not report one. */
export function terminalBackground(colors: TerminalColors | undefined) {
  const value = colors?.defaultBackground ?? colors?.palette?.[0]
  if (!value) return
  try {
    return RGBA.fromHex(value)
  } catch {
    return
  }
}

/**
 * Adapt a v2 theme document so its base background is the terminal's own colour.
 * The base background becomes transparent (the terminal shows through) while its RGB is kept so
 * tints derived from it stay right. Raised surfaces and the neutral steps they use are derived from
 * the detected colour the same way the system theme does. Without a detected background the source
 * is returned unchanged, so the theme's built-in neutral values are the fallback.
 */
export function adaptThemeToTerminal(source: Source, colors: TerminalColors | undefined): Source {
  const bg = terminalBackground(colors)
  if (!bg) return source
  const key = hex(bg)
  const cached = cache.get(source)?.get(key)
  if (cached) return cached

  const next: Source = structuredClone(source)
  for (const mode of ["dark", "light"] as Mode[]) {
    const grays = generateGrayScale(bg, mode === "dark")
    const section = (next[mode] ??= {})
    const gray = ((section.hue ??= {}).gray ??= {})
    // 800 is the base surface (also used as text on filled controls), so it stays opaque.
    gray["800"] = hex(bg)
    gray["700"] = hex(grays[2]!)
    gray["600"] = hex(grays[3]!)
    gray["500"] = hex(grays[6]!)
    ;((section.background ??= {}) as Source).base = hex(bg, 0)
  }

  const entries = cache.get(source) ?? new Map<string, Source>()
  entries.set(key, next)
  cache.set(source, entries)
  return next
}

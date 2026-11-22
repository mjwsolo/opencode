import { expect, test } from "bun:test"
import { RGBA, type TerminalColors } from "@opentui/core"
import { resolveThemeDocument } from "@opencode/theme/tui"
import { getLocalCodeTheme, getLocalCodeThemeFor } from "../../src/theme"

const colors = (bg?: string): TerminalColors =>
  ({ palette: Array(16).fill(undefined), defaultBackground: bg, defaultForeground: "#dddddd" }) as unknown as TerminalColors

test("uses the detected terminal background as a transparent base", () => {
  const bg = RGBA.fromHex("#1e2a4a")
  for (const mode of ["dark", "light"] as const) {
    const theme = resolveThemeDocument(getLocalCodeThemeFor(colors("#1e2a4a")), mode)
    expect(theme.background.base.a).toBe(0)
    expect(theme.background.base.r).toBeCloseTo(bg.r, 2)
    expect(theme.background.base.g).toBeCloseTo(bg.g, 2)
    expect(theme.background.base.b).toBeCloseTo(bg.b, 2)
    // raised surfaces are painted and derived from the detected colour, not the stock neutral
    const stock = resolveThemeDocument(getLocalCodeTheme(), mode)
    expect(theme.background.raised.base.a).toBe(1)
    expect(theme.background.raised.base.equals(stock.background.raised.base)).toBeFalse()
  }
  const dark = resolveThemeDocument(getLocalCodeThemeFor(colors("#1e2a4a")), "dark")
  expect(dark.background.raised.base.b).toBeGreaterThan(dark.background.raised.base.r)
})

test("falls back to the stock theme when the terminal background is unknown", () => {
  expect(getLocalCodeThemeFor(undefined)).toBe(getLocalCodeTheme())
  expect(getLocalCodeThemeFor(colors(undefined))).toBe(getLocalCodeTheme())
  const stock = resolveThemeDocument(getLocalCodeTheme(), "dark")
  expect(stock.background.base.a).toBe(1)
})

test("keeps accent colours unchanged", () => {
  const stock = resolveThemeDocument(getLocalCodeTheme(), "dark")
  const adapted = resolveThemeDocument(getLocalCodeThemeFor(colors("#202020")), "dark")
  expect(adapted.text.base.equals(stock.text.base)).toBeTrue()
})

import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

// Dialogs render in DialogProvider's layer, so any context a dialog reads must be
// provided above it. The model picker's quant list reads the prompt ref; with
// PromptRefProvider nested inside DialogProvider, opening it crashed the app.
test("dialog-visible contexts are provided above the dialog layer", () => {
  const source = readFileSync(path.join(import.meta.dir, "../src/app.tsx"), "utf8")
  const dialog = source.indexOf("<DialogProvider>")
  expect(dialog).toBeGreaterThan(-1)
  for (const provider of ["<PromptRefProvider>", "<LocalProvider>", "<DataProvider", "<ThemeProvider"]) {
    const index = source.indexOf(provider)
    expect(index, provider).toBeGreaterThan(-1)
    expect(index, `${provider} must wrap DialogProvider`).toBeLessThan(dialog)
  }
  const dialogs = readFileSync(path.join(import.meta.dir, "../src/component/dialog-localcode-model.tsx"), "utf8")
  expect(dialogs).toContain("usePromptRef()")
})

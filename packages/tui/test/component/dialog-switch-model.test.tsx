/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onCleanup } from "solid-js"
import { emptyThemeSource, tmpdir } from "../fixture/fixture"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"

// A mid-session model switch asks "new chat or continue". Keys typed after picking a quant
// used to land in that step's search box, filter both rows away and leave Enter doing
// nothing: the picker looked closed and the switch never started.
async function renderSwitch(root: string, onChoose: (keepHistory: boolean) => void) {
  const state = path.join(root, "state")
  await mkdir(state, { recursive: true })
  const config = createTuiResolvedConfig()
  const [{ ConfigProvider }, { ThemeProvider }, { Keymap }, { DialogProvider }, { ToastProvider }, { DialogSwitchModel }] =
    await Promise.all([
      import("../../src/config"),
      import("../../src/context/theme"),
      import("../../src/context/keymap"),
      import("../../src/ui/dialog"),
      import("../../src/ui/toast"),
      import("../../src/component/dialog-localcode-model"),
    ])

  function Switch() {
    onCleanup(Keymap.use().mode.push("modal"))
    return <DialogSwitchModel model="Gemma 4 26B-A4B" quant="UD-IQ3_S" onChoose={onChoose} />
  }

  const app = await testRender(
    () => (
      <TestTuiContexts directory={root} paths={{ home: root, state, worktree: root }}>
        <ConfigProvider config={config}>
          <Keymap.Provider>
            <ThemeProvider mode="dark" source={emptyThemeSource}>
              <ToastProvider>
                <DialogProvider>
                  <Switch />
                </DialogProvider>
              </ToastProvider>
            </ThemeProvider>
          </Keymap.Provider>
        </ConfigProvider>
      </TestTuiContexts>
    ),
    { width: 100, height: 30, kittyKeyboard: true },
  )
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("Start a new chat"))
  return app
}

test("the switch step names the target model and Enter starts the switch", async () => {
  await using tmp = await tmpdir()
  const chosen: boolean[] = []
  const app = await renderSwitch(tmp.path, (keep) => chosen.push(keep))
  try {
    expect(app.captureCharFrame()).toContain("Switch to Gemma 4 26B-A4B · UD-IQ3_S")
    app.mockInput.pressEnter()
    await app.waitFor(() => chosen.length > 0)
    expect(chosen).toEqual([false])
  } finally {
    app.renderer.destroy()
  }
})

test("typed text cannot filter the switch step into a dead end", async () => {
  await using tmp = await tmpdir()
  const chosen: boolean[] = []
  const app = await renderSwitch(tmp.path, (keep) => chosen.push(keep))
  try {
    await app.mockInput.typeText("In one sentence")
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("Start a new chat")
    expect(app.captureCharFrame()).toContain("Continue this chat")
    app.mockInput.pressEnter()
    await app.waitFor(() => chosen.length > 0)
    expect(chosen).toEqual([false])
  } finally {
    app.renderer.destroy()
  }
})

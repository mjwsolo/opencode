/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { downloadSize, lspOptions } from "../../../src/feature-plugins/sidebar/lsp"
import { emptyThemeSource, tmpdir } from "../../fixture/fixture"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"

const catalog = [
  {
    id: "typescript",
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
    installed: false,
    status: "idle" as const,
    download: "npm: typescript-language-server (~2 MB); needs `typescript` in the project",
  },
  {
    id: "kotlin-ls",
    extensions: [".kt", ".kts"],
    installed: false,
    status: "idle" as const,
    download: "JetBrains release: kotlin-lsp (~150 MB)",
  },
  { id: "clangd", extensions: [".c", ".cpp", ".h"], installed: true, status: "connected" as const, download: "GitHub release: clangd (~30 MB)" },
  { id: "deno", extensions: [".ts"], installed: false, status: "idle" as const, download: "needs Deno on PATH; nothing downloaded" },
]

test("the download size comes from what a server fetches", () => {
  expect(downloadSize("npm: pyright (~15 MB)")).toBe("≈ 15 MB")
  expect(downloadSize("needs Deno on PATH; nothing downloaded")).toBe("no download")
  expect(downloadSize("downloaded on install")).toBe("size varies")
})

for (const width of [80, 120])
  test(`/lsp rows keep each not-installed server's download size visible at ${width} columns`, async () => {
    await using tmp = await tmpdir()
    const root = tmp.path
    const state = path.join(root, "state")
    await mkdir(state, { recursive: true })
    const [{ ConfigProvider }, { ThemeProvider }, { Keymap }, { DialogProvider }, { DialogSelect }, { ToastProvider }] =
      await Promise.all([
        import("../../../src/config"),
        import("../../../src/context/theme"),
        import("../../../src/context/keymap"),
        import("../../../src/ui/dialog"),
        import("../../../src/ui/dialog-select"),
        import("../../../src/ui/toast"),
      ])
    const app = await testRender(
      () => (
        <TestTuiContexts directory={root} paths={{ home: root, state, worktree: root }}>
          <ConfigProvider config={createTuiResolvedConfig()}>
            <Keymap.Provider>
              <ThemeProvider mode="dark" source={emptyThemeSource}>
                <ToastProvider>
                  <DialogProvider>
                    <DialogSelect title="Language servers" options={lspOptions(catalog)} />
                  </DialogProvider>
                </ToastProvider>
              </ThemeProvider>
            </Keymap.Provider>
          </ConfigProvider>
        </TestTuiContexts>
      ),
      { width, height: 20 },
    )
    try {
      app.renderer.start()
      const frame = await app.waitForFrame((frame) => frame.includes("Language servers") && frame.includes("kotlin-ls"))
      expect(frame).toContain("not installed · ≈ 2 MB")
      expect(frame).toContain("not installed · ≈ 150 MB")
      expect(frame).toContain("not installed · no download")
      expect(frame).toContain("running")
    } finally {
      app.renderer.destroy()
    }
  })

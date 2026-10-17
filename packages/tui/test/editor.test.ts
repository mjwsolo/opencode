import { afterEach, expect, test } from "bun:test"
import { editorCommand, normalizePromptContent, openEditor } from "../src/editor"

const editor = process.env.EDITOR
const visual = process.env.VISUAL

afterEach(() => {
  process.env.EDITOR = editor
  process.env.VISUAL = visual
})

test("rejects when the external editor cannot start", async () => {
  delete process.env.VISUAL
  process.env.EDITOR = "opencode-editor-that-does-not-exist"
  const renderer = {
    suspend() {},
    resume() {},
    requestRender() {},
    currentRenderBuffer: { clear() {} },
  }

  await expect(openEditor({ value: "original", renderer: renderer as never })).rejects.toThrow()
})

test("falls back to nano, then vi, when no external editor is configured", () => {
  expect(editorCommand({ VISUAL: "code -w", EDITOR: "vim" }, () => true)).toBe("code -w")
  expect(editorCommand({ EDITOR: "vim" }, () => true)).toBe("vim")
  expect(editorCommand({}, (file) => file === "/opt/homebrew/bin/nano")).toBe("/opt/homebrew/bin/nano")
  expect(editorCommand({}, () => false)).toBe("vi")
})

test("normalizes a single trailing editor newline for one-line prompts", () => {
  expect(normalizePromptContent("hello\n")).toBe("hello")
  expect(normalizePromptContent("hello\r\n")).toBe("hello")
})

test("preserves multiline prompts that end with a newline", () => {
  expect(normalizePromptContent("hello\nworld\n")).toBe("hello\nworld\n")
})

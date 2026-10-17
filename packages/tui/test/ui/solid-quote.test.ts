import { expect, test } from "bun:test"
import { MarkdownRenderable, RGBA, SyntaxStyle } from "@opentui/core"
import { createTestRenderer, MockTreeSitterClient } from "@opentui/core/testing"
import { solidQuoteBorder } from "../../src/ui/solid-quote"

for (const streaming of [false, true]) test(`quote background stays continuous (streaming=${streaming})`, async () => {
  const setup = await createTestRenderer({ width: 24, height: 20, useThread: false })
  const background = RGBA.fromHex("#101010")
  const purple = RGBA.fromHex("#bb9af7")
  const parser = new MockTreeSitterClient()
  parser.setMockResult({ highlights: [] })
  const markdown = new MarkdownRenderable(setup.renderer, {
    content: "> First\n>\n> A longer quote that wraps across several lines.\n>\n> Last",
    syntaxStyle: SyntaxStyle.fromStyles({ default: { fg: "#ffffff" }, conceal: { fg: purple }, "markup.quote": { fg: "#ffffff" } }),
    bg: background,
    treeSitterClient: parser,
    streaming,
    internalBlockMode: "top-level",
    renderNode: (token, context) => token.type === "blockquote" ? solidQuoteBorder(context.defaultRender()) : undefined,
  })
  try {
    setup.renderer.root.add(markdown)
    await setup.flush()
    parser.resolveAllHighlightOnce()
    await setup.waitForFrame((frame) => frame.includes("First"), { maxPasses: 500 })
    const frame = setup.captureSpans()
    expect(markdown.height).toBeGreaterThan(4)
    for (const line of frame.lines.slice(0, markdown.height)) {
      expect(line.spans[0].text).toBe(" ")
      expect(line.spans[0].width).toBe(1)
      expect(line.spans[0].bg.toInts()).toEqual(purple.toInts())
      expect(line.spans[1].bg.toInts()).not.toEqual(purple.toInts())
    }
    expect(setup.captureCharFrame().split("\n")[0].indexOf("First")).toBe(2)
    expect(setup.captureCharFrame()).toContain("Last")
    expect(setup.captureCharFrame()).not.toContain("│")
    markdown.content = "> Updated\n>\n> Still continuous"
    await setup.flush()
    parser.resolveAllHighlightOnce()
    await setup.waitForFrame((frame) => frame.includes("Updated"), { maxPasses: 500 })
    expect(setup.captureCharFrame().split("\n")[0].indexOf("Updated")).toBe(2)
    setup.resize(12, 20)
    await setup.flush()
    for (const line of setup.captureSpans().lines.slice(0, markdown.height)) {
      expect(line.spans[0].bg.toInts()).toEqual(purple.toInts())
    }
  } finally {
    setup.renderer.destroy()
  }
})

import { expect, test } from "bun:test"
import { BoxRenderable, RGBA, TextRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { messagePanelStyle, SENT_MESSAGE_BACKGROUND } from "../../src/ui/message-panel"

for (const [name, background] of [["sent", SENT_MESSAGE_BACKGROUND], ["input", RGBA.fromHex("#171717")]] as const) {
  test(`${name} panel has a uniform background without an accent stripe`, async () => {
    const setup = await createTestRenderer({ width: 24, height: 8, useThread: false })
    const panel = new BoxRenderable(setup.renderer, { width: "100%", ...messagePanelStyle(background) })
    const body = new BoxRenderable(setup.renderer, { paddingLeft: 2, paddingTop: 1, paddingBottom: 1, backgroundColor: background })
    body.add(new TextRenderable(setup.renderer, { content: "Message", fg: "#ffffff" }))
    panel.add(body)
    try {
      setup.renderer.root.add(panel)
      await setup.flush()
      const frame = setup.captureSpans()
      for (const line of frame.lines.slice(0, panel.height)) {
        expect(line.spans[0].bg.toInts()).toEqual(background.toInts())
      }
      expect(setup.captureCharFrame().split("\n")[1].indexOf("Message")).toBe(3)
      if (name === "sent") expect(frame.lines[0].spans[0].bg.toInts()).toEqual([61, 62, 63, 255])
    } finally {
      setup.renderer.destroy()
    }
  })
}

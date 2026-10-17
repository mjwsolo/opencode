import { BoxRenderable, type MarkdownOptions, type Renderable } from "@opentui/core"
import { SplitBorder } from "./border"

export function solidQuoteBorder(node: Renderable | null) {
  if (!(node instanceof BoxRenderable)) return node
  node.customBorderChars = { ...SplitBorder.customBorderChars, vertical: " " }
  const after = node.renderAfter
  node.renderAfter = function (buffer, deltaTime) {
    after?.call(this, buffer, deltaTime)
    // Paint cells rather than glyphs: font leading and blank rows stay filled.
    buffer.fillRect(node.x, node.y, 1, node.height, node.borderColor)
  }
  return node
}

type RenderNode = NonNullable<MarkdownOptions["renderNode"]>

/** Block quotes get a solid painted bar; every other node goes to the plugins' renderer. */
export function withSolidQuotes(render: MarkdownOptions["renderNode"]): RenderNode {
  return (token, context) =>
    token.type === "blockquote" ? solidQuoteBorder(context.defaultRender()) : render?.(token, context)
}

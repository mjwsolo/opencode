import { RGBA } from "@opentui/core"

export const SENT_MESSAGE_BACKGROUND = RGBA.fromHex("#3d3e3f")

export function messagePanelStyle(background: RGBA) {
  return { border: false, paddingLeft: 1, backgroundColor: background } as const
}

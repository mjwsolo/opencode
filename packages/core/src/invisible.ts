/**
 * LocalCode: hidden Unicode in text that reaches the model.
 *
 * Invisible characters can carry instructions a human reviewer never sees (the
 * "Rules File Backdoor": zero-width characters, Unicode tag characters
 * U+E0000-U+E007F that spell out ASCII, and bidi overrides that reorder what is
 * displayed, as in Trojan Source). Tool output, project instructions, skills
 * and tool (MCP) descriptions pass through `clean`, which removes them and adds
 * a visible one-line note, so nothing is blocked but nothing stays hidden.
 *
 * ZWJ and ZWNJ are kept between two non-ASCII characters, where emoji sequences
 * and Indic, Persian and Arabic text legitimately use them.
 */
export * as Invisible from "./invisible.js"

import type { Tool } from "@opencode/schema/tool"

const ALWAYS = /[\u{E0000}-\u{E007F}\u202A-\u202E\u2066-\u2069\u200B\u2060-\u2064\uFEFF\u180E]/u
const JOINERS = /[\u200C\u200D]/u
const ANY = /[\u{E0000}-\u{E007F}\u202A-\u202E\u2066-\u2069\u200B-\u200D\u2060-\u2064\uFEFF\u180E]/u

const visible = (char: string | undefined) =>
  char !== undefined && !ANY.test(char) && char.codePointAt(0)! > 0x7f && !/\s/u.test(char)

/** Remove hidden characters; `removed` counts them (a leading byte-order mark is not counted). */
export function strip(text: string): { readonly text: string; readonly removed: number } {
  if (!ANY.test(text)) return { text, removed: 0 }
  const chars = Array.from(text)
  let removed = 0
  const kept: string[] = []
  chars.forEach((char, index) => {
    if (ALWAYS.test(char)) {
      if (!(index === 0 && char === "\uFEFF")) removed++
      return
    }
    if (JOINERS.test(char) && !(visible(chars[index - 1]) && visible(chars[index + 1]))) {
      removed++
      return
    }
    kept.push(char)
  })
  return { text: kept.join(""), removed }
}

export const note = (removed: number) =>
  `[localcode removed ${removed} hidden Unicode character${removed === 1 ? "" : "s"} (zero-width, bidi-override or tag characters) from this text]`

/** The text without hidden characters, with a visible note when any were removed. */
export function clean(text: string): string {
  const result = strip(text)
  return result.removed === 0 ? text : `${result.text}\n\n${note(result.removed)}`
}

/** A tool result with hidden characters removed from its text content (and a note on each cleaned part). */
export function result<R extends { readonly content: ReadonlyArray<Tool.Content> }>(value: R): R {
  if (!value.content.some((item) => item.type === "text" && ANY.test(item.text))) return value
  return {
    ...value,
    content: value.content.map((item) => (item.type === "text" ? { ...item, text: clean(item.text) } : item)),
  }
}

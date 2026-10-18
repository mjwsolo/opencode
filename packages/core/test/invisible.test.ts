import { describe, expect, test } from "bun:test"
import { Invisible } from "@opencode/core/invisible"

describe("Invisible", () => {
  test("removes tag characters, bidi overrides and zero-width spaces", () => {
    // "hi" spelled in Unicode tag characters, invisible in most renderers.
    const tags = "\u{E0068}\u{E0069}"
    expect(Invisible.strip(`a${tags}b\u202Ec\u2066d\u2069\u200Be\u2060f`)).toEqual({ text: "abcdef", removed: 7 })
  })

  test("keeps joiners inside emoji and non-Latin scripts, removes them between ASCII", () => {
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}"
    const persian = "می\u200Cخواهم"
    expect(Invisible.strip(family)).toEqual({ text: family, removed: 0 })
    expect(Invisible.strip(persian)).toEqual({ text: persian, removed: 0 })
    expect(Invisible.strip("ign\u200Dore\u200C")).toEqual({ text: "ignore", removed: 2 })
  })

  test("a leading byte-order mark is not reported", () => {
    // Nothing hidden was removed, so clean leaves the text as it was.
    expect(Invisible.clean("\uFEFFhello")).toBe("\uFEFFhello")
    expect(Invisible.strip("\uFEFFhello")).toEqual({ text: "hello", removed: 0 })
  })

  test("clean adds a visible note only when something was removed", () => {
    expect(Invisible.clean("plain text")).toBe("plain text")
    expect(Invisible.clean("x\u200By")).toBe(`xy\n\n${Invisible.note(1)}`)
  })

  test("tool results: text parts are cleaned, other parts and clean results are untouched", () => {
    const file = { type: "file" as const, uri: "file:///a.png", mime: "image/png" }
    const clean = { content: [{ type: "text" as const, text: "ok" }] }
    expect(Invisible.result(clean)).toBe(clean)
    const dirty = Invisible.result({ content: [{ type: "text" as const, text: "a\u{E0041}b" }, file as never], metadata: { x: 1 } })
    expect(dirty.content[0]).toEqual({ type: "text", text: `ab\n\n${Invisible.note(1)}` })
    expect(dirty.content[1]).toBe(file as never)
    expect(dirty.metadata).toEqual({ x: 1 })
  })
})

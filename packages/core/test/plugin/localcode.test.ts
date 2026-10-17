import { describe, expect, test } from "bun:test"
import { WebSearchDuckDuckGo } from "../../src/plugin/websearch/duckduckgo"
import { loaded, localTitle, pinSideRequest, variants } from "../../src/plugin/provider/localcode"

describe("localcode provider", () => {
  test("only a ready supervisor reports a loaded model", () => {
    expect(loaded(undefined)).toBeUndefined()
    expect(loaded({ current: "qwen", state: "loading" })).toBeUndefined()
    expect(loaded({ current: "qwen", state: "ready", ctx: 32768, budget: 40000, vision: true })).toEqual({
      alias: "qwen",
      vision: true,
      context: 32768,
      budget: 32768,
    })
    expect(loaded({ current: "qwen", state: "ready" })).toEqual({
      alias: "qwen",
      vision: false,
      context: undefined,
      budget: undefined,
    })
  })

  test("thinking variants switch the chat template, except for Muse Glimmer", () => {
    expect(variants("qwen3").map((item) => String(item.id))).toEqual(["none", "thinking"])
    expect(variants("muse-glimmer-q4")).toEqual([])
  })

  test("titles come from the user's first message without a model request", () => {
    expect(localTitle("  hello\nworld  ")).toBe("hello world")
    expect(localTitle("x".repeat(150))).toBe("x".repeat(97) + "...")
    expect(localTitle("Original request:\nfix the bug\n\nRecent conversation:\nUser: more")).toBe("fix the bug")
    expect(localTitle("   ")).toBeUndefined()
  })

  test("side requests go to the last slot", () => {
    const body = JSON.stringify({ messages: [] })
    expect(JSON.parse(pinSideRequest(body, 4)).id_slot).toBe(3)
    expect(pinSideRequest(body, 1)).toBe(body)
    expect(pinSideRequest(JSON.stringify({ id_slot: 0 }), 4)).toBe(JSON.stringify({ id_slot: 0 }))
    expect(pinSideRequest("not json", 4)).toBe("not json")
  })
})

describe("duckduckgo web search", () => {
  test("parses result titles, redirect URLs and snippets", () => {
    const html = `
      <div class="result"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&amp;rut=x">Example <b>A</b></a>
      <a class="result__snippet" href="#">First &amp; best</a></div>
      <div class="result"><a class="result__a" href="https://example.org/b">B</a>
      <a class="result__snippet" href="#">Second</a></div>`
    expect(WebSearchDuckDuckGo.parse(html)).toEqual([
      { url: "https://example.com/a", title: "Example A", content: "First & best", time: {} },
      { url: "https://example.org/b", title: "B", content: "Second", time: {} },
    ])
    expect(WebSearchDuckDuckGo.parse(html, 1)).toHaveLength(1)
  })
})

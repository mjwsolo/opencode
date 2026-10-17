import { describe, expect, test } from "bun:test"
import { WebSearchDuckDuckGo } from "../../src/plugin/websearch/duckduckgo"
import { inputs, loaded, localTitle, localToolSchema, pinSideRequest, variants } from "../../src/plugin/provider/localcode"
import { LocalContext } from "../../src/session/local-context"

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

  test("only the ready loaded model with a projector accepts images", () => {
    const ready = loaded({ current: "gemma", state: "ready", vision: true })
    expect(inputs("gemma", ready)).toEqual(["text", "image"])
    expect(inputs("qwen", ready)).toEqual(["text"])
    expect(inputs("gemma", loaded({ current: "gemma", state: "loading", vision: true }))).toEqual(["text"])
    expect(inputs("gemma", loaded({ current: "gemma", state: "ready", vision: false }))).toEqual(["text"])
    expect(inputs("gemma", undefined)).toEqual(["text"])
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

describe("local tool schemas", () => {
  const schema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "Edit",
    type: "object",
    properties: {
      path: { type: "string", description: "d".repeat(200), default: "x", examples: ["a"] },
      mode: { anyOf: [{ type: "string", enum: ["a", "b"], title: "Mode" }, { type: "null" }] },
      title: { type: "string" },
    },
    required: ["path"],
  }

  test("documentation keywords go and long descriptions are capped", () => {
    const out = LocalContext.compactToolSchema(schema) as any
    expect(out.$schema).toBeUndefined()
    expect(out.title).toBeUndefined()
    expect(out.properties.path).toEqual({ type: "string", description: "d".repeat(157) + "…" })
    expect(out.properties.mode.anyOf[0]).toEqual({ type: "string", enum: ["a", "b"] })
    // A property that happens to be named "title" is part of the argument surface.
    expect(out.properties.title).toEqual({ type: "string" })
    expect(out.required).toEqual(["path"])
    expect(schema.properties.path.default).toBe("x")
  })

  test("full context keeps documentation; the size budget always applies", () => {
    expect(localToolSchema(schema as any, true)).toBe(schema as any)
    expect((localToolSchema(schema as any, false) as any).properties.path.default).toBeUndefined()
    const big = {
      type: "object",
      properties: Object.fromEntries(
        Array.from({ length: 30 }, (_, i) => [`arg${i}`, { type: "string", description: "x".repeat(100) }]),
      ),
    }
    expect(JSON.stringify(localToolSchema(big as any, true)).length).toBeLessThanOrEqual(2000)
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

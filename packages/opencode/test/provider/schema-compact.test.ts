import { describe, expect, test } from "bun:test"
import { compactToolSchema, stripDescriptions } from "../../src/provider/schema-compact"

const small = {
  type: "object",
  properties: { filePath: { type: "string", description: "The absolute path" } },
  required: ["filePath"],
} as const

describe("compactToolSchema", () => {
  test("a small schema is returned untouched, descriptions included", () => {
    const out = compactToolSchema(small as any, 2000)
    expect(out).toBe(small as any)
  })

  test("an oversized schema loses nested descriptions first and keeps its argument surface", () => {
    const big = {
      type: "object",
      properties: Object.fromEntries(
        Array.from({ length: 30 }, (_, i) => [`arg${i}`, { type: "string", description: "x".repeat(120) }]),
      ),
      required: ["arg0"],
    }
    const out = compactToolSchema(big as any, 2000) as any
    expect(Object.keys(out.properties)).toHaveLength(30)
    expect(out.required).toEqual(["arg0"])
    expect(out.properties.arg0.description).toBeUndefined()
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(2000)
    expect((big as any).properties.arg0.description).toBeDefined() // input not mutated
  })

  test("deep objects collapse and refs to dropped definitions become untyped", () => {
    const deep: any = { type: "object", properties: { a: { type: "object", properties: { b: { type: "object", properties: { c: { type: "object", properties: { d: { $ref: "#/$defs/D" } } } } } } } }, $defs: { D: { type: "string", description: "y".repeat(3000) } } }
    // Passes stop as soon as the budget is met: stripping the description is
    // enough here, so definitions may survive; the size bound is the contract.
    const out = compactToolSchema(deep, 500) as any
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(500)
    expect(out.properties.a.type).toBe("object")
    const tiny = compactToolSchema(deep, 120) as any
    expect(tiny.$defs).toBeUndefined()
    expect(tiny.properties.a.properties.b.properties.c.properties).toBeUndefined()
  })

  test("stripDescriptions keeps the root description", () => {
    const s: any = { description: "root", type: "object", properties: { a: { type: "string", description: "gone" } } }
    stripDescriptions(s)
    expect(s.description).toBe("root")
    expect(s.properties.a.description).toBeUndefined()
  })
})

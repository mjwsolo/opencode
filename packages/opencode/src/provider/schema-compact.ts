import type { JSONSchema7 } from "@ai-sdk/provider"

/**
 * Lossy tool-schema compaction for small local models, after the pattern in
 * Codex (codex-rs/tools/src/json_schema/compaction.rs): a per-tool byte budget
 * and increasingly lossy passes that run only while the schema is still over
 * it. The top-level argument surface (property names, required, types) is
 * always preserved. Small schemas keep their parameter descriptions; a huge
 * MCP tool schema gets trimmed instead of costing thousands of prompt tokens.
 */
export const LOCAL_TOOL_SCHEMA_BUDGET_BYTES = 2_000
const MAX_DEPTH = 3

type Json = Record<string, unknown>
const isRecord = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v)

const CHILD_KEYS = ["properties", "items", "additionalProperties", "anyOf", "oneOf", "allOf", "$defs", "definitions", "not", "prefixItems"]

function size(schema: unknown): number {
  return JSON.stringify(schema).length
}

function walk(value: unknown, fn: (node: Json, depth: number) => void, depth = 0): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, fn, depth)
    return
  }
  if (!isRecord(value)) return
  fn(value, depth)
  for (const key of CHILD_KEYS) {
    const child = value[key]
    if (key === "properties" || key === "$defs" || key === "definitions") {
      if (isRecord(child)) for (const sub of Object.values(child)) walk(sub, fn, depth + 1)
      continue
    }
    walk(child, fn, depth + 1)
  }
}

export function stripDescriptions(schema: Json): Json {
  walk(schema, (node, depth) => {
    if (depth > 0) {
      delete node.description
      delete node.examples
      delete node.title
    }
  })
  return schema
}

export function dropDefinitions(schema: Json): Json {
  // Definitions are only reachable through $ref; a ref to a dropped definition
  // becomes an untyped value, which is what the budget is buying.
  walk(schema, (node) => {
    delete node.$defs
    delete node.definitions
    if (typeof node.$ref === "string") {
      delete node.$ref
      if (!("type" in node)) node.type = "object"
    }
  })
  return schema
}

export function collapseDeepObjects(schema: Json): Json {
  walk(schema, (node, depth) => {
    if (depth >= MAX_DEPTH && node.type === "object" && isRecord(node.properties)) {
      delete node.properties
      delete node.required
      node.additionalProperties = true
    }
  })
  return schema
}

export function pruneCompositions(schema: Json): Json {
  walk(schema, (node) => {
    for (const key of ["anyOf", "oneOf", "allOf"] as const) {
      const options = node[key]
      if (!Array.isArray(options) || options.length === 0) continue
      // Keep the first non-null option's shape; the model only needs a type.
      const first = options.find((o) => isRecord(o) && o.type !== "null") ?? options[0]
      delete node[key]
      if (isRecord(first)) for (const [k, v] of Object.entries(first)) if (!(k in node)) node[k] = v
    }
    delete node.not
  })
  return schema
}

const PASSES: Array<(s: Json) => Json> = [stripDescriptions, dropDefinitions, collapseDeepObjects, pruneCompositions]

export function compactToolSchema(schema: JSONSchema7, budget = LOCAL_TOOL_SCHEMA_BUDGET_BYTES): JSONSchema7 {
  if (size(schema) <= budget) return schema
  let out = JSON.parse(JSON.stringify(schema)) as Json
  for (const pass of PASSES) {
    out = pass(out)
    if (size(out) <= budget) break
  }
  return out as JSONSchema7
}

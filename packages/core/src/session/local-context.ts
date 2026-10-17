export * as LocalContext from "./local-context.js"

/**
 * LocalCode keeps a local model's startup prompt small: project instructions, skills and the
 * workspace workflow are an explicit launch choice (LOCALCODE_CONTEXT=full). Other providers are
 * unaffected.
 */
export function fullContext(providerID: string | undefined, mode = process.env.LOCALCODE_CONTEXT) {
  return providerID !== "localcode" || mode === "full"
}

/** In minimal mode only explicitly enabled MCP servers connect at startup. */
export function mcpStartupEnabled(enabled?: boolean, mode = process.env.LOCALCODE_CONTEXT) {
  return enabled !== false && (mode !== "minimal" || enabled === true)
}

const DROPPED_SCHEMA_KEYS = new Set(["$schema", "title", "examples", "default"])
const SCHEMA_MAPS = new Set(["properties", "$defs", "definitions", "patternProperties", "dependentSchemas"])
const SCHEMA_CHILDREN = new Set([
  "items",
  "additionalProperties",
  "anyOf",
  "oneOf",
  "allOf",
  "not",
  "if",
  "then",
  "else",
  "prefixItems",
  "contains",
])
const DESCRIPTION_LIMIT = 160

/**
 * Tool schemas are re-read on every local request. Drop documentation-only keywords and cap long
 * descriptions; the argument surface (names, types, required, enums) is untouched.
 */
export function compactToolSchema<T>(value: T): T {
  return compact(value) as T
}

function compact(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value
  if (Array.isArray(value)) return value.map(compact)
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (DROPPED_SCHEMA_KEYS.has(key)) continue
    if (SCHEMA_MAPS.has(key)) {
      result[key] =
        typeof item === "object" && item !== null && !Array.isArray(item)
          ? Object.fromEntries(Object.entries(item).map(([name, schema]) => [name, compact(schema)]))
          : item
    } else if (SCHEMA_CHILDREN.has(key)) {
      result[key] = compact(item)
    } else if (key === "description" && typeof item === "string" && item.length > DESCRIPTION_LIMIT) {
      result[key] = item.slice(0, DESCRIPTION_LIMIT - 3) + "…"
    } else {
      result[key] = item
    }
  }
  return result
}

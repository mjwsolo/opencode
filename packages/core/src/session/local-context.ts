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

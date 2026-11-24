/** Grouping and summary text for /import (pure, unit tested). */

export type ImportItem = {
  id: string
  kind: "mcp" | "skill"
  source: string
  label: string
  name: string
  status: "new" | "exists" | "clash"
  final_name: string
  suggestion?: string
  warnings: string[]
  transport?: string
  command?: string
  env_names?: string[]
  url?: string
  header_names?: string[]
  size?: string
  tokens?: number
  has_scripts?: boolean
}

/** Items grouped by source in a stable order (Claude Code, Codex, Cursor), MCP servers before skills. */
export function groupImportItems(items: ImportItem[]) {
  const order = ["claude", "codex", "cursor"]
  const sources = [...new Set(items.map((i) => i.source))].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return sources.map((source) => {
    const mine = items.filter((i) => i.source === source)
    return {
      source,
      label: mine[0]?.label ?? source,
      items: [...mine.filter((i) => i.kind === "mcp"), ...mine.filter((i) => i.kind === "skill")],
    }
  })
}

export function truncateEnd(text: string, width: number) {
  return text.length <= width ? text : text.slice(0, Math.max(1, width - 1)) + "…"
}

export function importSummary(chosen: ImportItem[]) {
  const mcp = chosen.filter((i) => i.kind === "mcp")
  const skills = chosen.filter((i) => i.kind === "skill")
  return [
    ...(mcp.length ? [`${mcp.length} MCP server${mcp.length === 1 ? "" : "s"}: ${mcp.map((i) => i.name).join(", ")}`] : []),
    ...(skills.length ? [`${skills.length} skill${skills.length === 1 ? "" : "s"}: ${skills.map((i) => i.name).join(", ")}`] : []),
  ]
}

import { expect, test } from "bun:test"
import { groupImportItems, importSummary, truncateEnd, type ImportItem } from "../src/component/localcode-import-model"

const it = (over: Partial<ImportItem>): ImportItem => ({
  id: "0", kind: "mcp", source: "claude", label: "Claude Code", name: "x", status: "new", final_name: "x", warnings: [], ...over,
})

test("items group by source, MCP servers first", () => {
  const g = groupImportItems([
    it({ id: "1", source: "cursor", label: "Cursor", name: "c" }),
    it({ id: "2", kind: "skill", name: "s" }),
    it({ id: "3", name: "m" }),
    it({ id: "4", source: "codex", label: "Codex", name: "d" }),
  ])
  expect(g.map((x) => x.label)).toEqual(["Claude Code", "Codex", "Cursor"])
  expect(g[0]!.items.map((x) => x.name)).toEqual(["m", "s"])
})

test("long commands are cut, short ones kept", () => {
  expect(truncateEnd("npx -y srv", 44)).toBe("npx -y srv")
  expect(truncateEnd("a".repeat(60), 10)).toBe("aaaaaaaaa…")
})

test("the confirm summary counts servers and skills", () => {
  expect(importSummary([it({ name: "a" }), it({ name: "b" }), it({ kind: "skill", name: "s" })])).toEqual([
    "2 MCP servers: a, b",
    "1 skill: s",
  ])
  expect(importSummary([])).toEqual([])
})

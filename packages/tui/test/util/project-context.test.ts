import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { loadProjectContext, saveProjectContext } from "../../src/util/project-context"

test("project context uses LOCALCODE.md and saves multiline text without reading AGENTS.md", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "context-"))
  try {
    await writeFile(path.join(directory, "AGENTS.md"), "old guidance")
    const doc = await loadProjectContext(directory)
    expect(doc.exists).toBe(false)
    expect(doc.content).toBe("")
    expect(path.basename(doc.file)).toBe("LOCALCODE.md")
    await saveProjectContext(doc, "# Project\nUse the existing tests.\n")
    expect((await loadProjectContext(directory)).content).toBe("# Project\nUse the existing tests.\n")
    expect(await readFile(path.join(directory, "AGENTS.md"), "utf8")).toBe("old guidance")
    await expect(saveProjectContext(doc, "stale edit")).rejects.toThrow("changed on disk")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

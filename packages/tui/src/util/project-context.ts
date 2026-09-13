import { readFile, rename, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"

export async function loadProjectContext(directory: string) {
  const file = path.resolve(directory, "LOCALCODE.md")
  try {
    return { file, content: await readFile(file, "utf8"), exists: true }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    return { file, content: "", exists: false }
  }
}

export async function saveProjectContext(original: Awaited<ReturnType<typeof loadProjectContext>>, content: string) {
  const current = await readFile(original.file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (current !== (original.exists ? original.content : undefined))
    throw new Error(
      "Project context changed on disk. Reopen the editor before saving to avoid overwriting those changes.",
    )
  const temporary = `${original.file}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, content, { flag: "wx" })
    await rename(temporary, original.file)
  } finally {
    await unlink(temporary).catch(() => {})
  }
}

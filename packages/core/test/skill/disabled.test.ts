import { describe, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { SkillDisabled } from "@opencode/core/skill/disabled"

const withConfig = (text: string | undefined, check: (dir: string) => void) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skd-"))
  try {
    if (text !== undefined) fs.writeFileSync(path.join(dir, "cli.json"), text)
    check(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe("SkillDisabled.read", () => {
  test("nothing is off without a config file", () => withConfig(undefined, (dir) => expect(SkillDisabled.read(dir).size).toBe(0)))
  test("reads the names that are off", () =>
    withConfig('{ "session": { "disabled_skills": ["a", "b", 3] }, }', (dir) =>
      expect([...SkillDisabled.read(dir)]).toEqual(["a", "b"]),
    ))
  test("a broken or mistyped file turns nothing off", () => {
    withConfig("{ nope", (dir) => expect(SkillDisabled.read(dir).size).toBe(0))
    withConfig('{ "session": { "disabled_skills": "a" } }', (dir) => expect(SkillDisabled.read(dir).size).toBe(0))
  })
})

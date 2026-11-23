import { expect, test } from "bun:test"
import { skillSource } from "../../src/component/dialog-skill"

test("skill source is derived from the folder", () => {
  expect(skillSource("/p/proj/.localcode-agent/skills/a/SKILL.md")).toBe("project")
  expect(skillSource("/h/.config/localcode-agent/skills/a/SKILL.md")).toBe("user")
  expect(skillSource("/h/.agents/skills/a/SKILL.md")).toBe("shared (~/.agents)")
  expect(skillSource("/elsewhere/a/SKILL.md")).toBe("other")
})

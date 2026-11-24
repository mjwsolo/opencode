import { expect, test } from "bun:test"
import { skillSource } from "../../src/component/dialog-skill"

test("skill source is derived from the folder", () => {
  expect(skillSource("/p/proj/.localcode-agent/skills/a/SKILL.md")).toBe("project")
  expect(skillSource("/h/.config/localcode-agent/skills/a/SKILL.md")).toBe("user")
  expect(skillSource("/h/.agents/skills/a/SKILL.md")).toBe("shared (~/.agents)")
  expect(skillSource("/elsewhere/a/SKILL.md")).toBe("other")
})

import { skillTokens, toggleDisabled } from "../../src/component/dialog-skill"

test("token cost is the description length over four, rounded up", () => {
  expect(skillTokens(undefined)).toBe(0)
  expect(skillTokens("abcd")).toBe(1)
  expect(skillTokens("abcde")).toBe(2)
  expect(skillTokens("  a   b\n c  ")).toBe(2)
})

test("toggling adds a skill to the off list and removes it again", () => {
  expect(toggleDisabled([], "a")).toEqual(["a"])
  expect(toggleDisabled(["a", "b"], "a")).toEqual(["b"])
})

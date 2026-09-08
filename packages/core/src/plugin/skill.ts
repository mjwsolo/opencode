/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill"

import { define } from "./internal"
import { Effect } from "effect"
import { AbsolutePath } from "../schema"
import { SkillV2 } from "../skill"
import customizeLocalcodeContent from "./skill/customize-localcode.md" with { type: "text" }

export const CustomizeLocalcodeContent = customizeLocalcodeContent

export const Plugin = define({
  id: "skill",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.skill.transform((draft) => {
      draft.source(
        SkillV2.EmbeddedSource.make({
          type: "embedded",
          skill: SkillV2.Info.make({
            name: "customize-localcode",
            description:
              "Use ONLY when the user is editing or creating localcode's own configuration: localcode.json, localcode.jsonc (or legacy opencode.json), files under .localcode-agent/ (or legacy .opencode/), or files under ~/.config/localcode-agent/. Also use when creating or fixing localcode agents, subagents, commands, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring localcode itself.",
            location: AbsolutePath.make("/builtin/customize-localcode.md"),
            content: CustomizeLocalcodeContent,
          }),
        }),
      )
    })
  }),
})

export * as SkillDisabled from "./disabled.js"

import { readFileSync } from "fs"
import path from "path"
import { parse } from "jsonc-parser"

/**
 * The skills the user switched off in /skills, kept in the same user config file as the other session
 * switches (`session.disabled_skills` in cli.json). A skill that is off is neither offered to the model nor
 * loadable by the skill tool. Read on every use, so a toggle takes effect on the next turn.
 */
export function read(configDir: string): ReadonlySet<string> {
  try {
    const text = readFileSync(path.join(configDir, "cli.json"), "utf8")
    const list = (parse(text, [], { allowTrailingComma: true }) as { session?: { disabled_skills?: unknown } } | undefined)
      ?.session?.disabled_skills
    return new Set(Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [])
  } catch {
    return new Set()
  }
}

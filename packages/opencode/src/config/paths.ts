export * as ConfigPaths from "./paths"

import path from "path"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Global } from "@opencode-ai/core/global"
import { unique } from "remeda"
import * as Effect from "effect/Effect"
import { FSUtil } from "@opencode-ai/core/fs-util"

/**
 * Config file base names, in load order (later entries win when merged).
 * `localcode.json[c]` is the canonical name; `opencode.json[c]` is read for
 * compatibility with existing setups.
 */
export const CONFIG_NAMES = ["opencode", "localcode"] as const

/**
 * Project config directory names, in search order. `.localcode-agent` is the
 * canonical name; `.opencode` is read for compatibility.
 */
export const PROJECT_DIRS = [".localcode-agent", ".opencode"] as const

/** Canonical schema URLs (placeholder domain, kept consistent across the CLI). */
export const CONFIG_SCHEMA_URL = "https://localcode.dev/schema/config.json"
export const TUI_SCHEMA_URL = "https://localcode.dev/schema/tui.json"

export const files = Effect.fn("ConfigPaths.projectFiles")(function* (
  name: string | readonly string[],
  directory: string,
  worktree?: string,
) {
  const afs = yield* FSUtil.Service
  const names = typeof name === "string" ? [name] : name
  // `up` walks nearest-first and records targets in order per directory; reversing yields
  // root-first with, inside each directory, the *last* target winning on merge.
  return (yield* afs.up({
    targets: names.toReversed().flatMap((item) => [`${item}.jsonc`, `${item}.json`]),
    start: directory,
    stop: worktree,
  })).toReversed()
})

/** The main config files (`opencode.json[c]` then `localcode.json[c]`) for a directory, in load order. */
export function configFiles(dir: string) {
  return CONFIG_NAMES.flatMap((name) => fileInDirectory(dir, name))
}

/** Whether `dir` is one of the project config directories (`.localcode-agent` / `.opencode`). */
export function isProjectDir(dir: string) {
  return PROJECT_DIRS.some((name) => dir.endsWith(name))
}

export const directories = Effect.fn("ConfigPaths.directories")(function* (directory: string, worktree?: string) {
  const afs = yield* FSUtil.Service
  return unique([
    Global.Path.config,
    ...(!Flag.OPENCODE_DISABLE_PROJECT_CONFIG
      ? yield* afs.up({
          targets: [...PROJECT_DIRS],
          start: directory,
          stop: worktree,
        })
      : []),
    ...(yield* afs.up({
      targets: [...PROJECT_DIRS],
      start: Global.Path.home,
      stop: Global.Path.home,
    })),
    ...(Flag.OPENCODE_CONFIG_DIR ? [Flag.OPENCODE_CONFIG_DIR] : []),
  ])
})

export function fileInDirectory(dir: string, name: string) {
  return [path.join(dir, `${name}.json`), path.join(dir, `${name}.jsonc`)]
}

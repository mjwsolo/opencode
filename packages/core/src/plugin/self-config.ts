export * as SelfConfigNoticePlugin from "./self-config.js"

import path from "path"
import { define } from "@opencode/plugin/effect/plugin"
import { TuiEvent } from "@opencode/schema/tui-event"
import { Global } from "@opencode/util/global"
import { Effect } from "effect"
import { Bus } from "../bus.js"
import { Location } from "../location.js"
import { Sandbox } from "../sandbox.js"

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []

/** Files a completed write, edit, patch or shell call changed, as absolute paths. */
export function touched(tool: string, output: unknown, directory: string): string[] {
  const value = record(output)
  if (!value) return []
  const files =
    tool === "write"
      ? typeof value.target === "string"
        ? [value.target]
        : []
      : tool === "edit" || tool === "patch"
        ? (Array.isArray(value.files) ? value.files : []).flatMap((item) => {
            const file = record(item)?.file
            return typeof file === "string" ? [file] : []
          })
        : tool === "shell"
          ? strings(value.selfConfig)
          : []
  return [...new Set(files.map((file) => path.resolve(directory, file)))]
}

/** The notice text for changed agent config files. */
export function notice(files: readonly string[], home: string) {
  const shown = files.slice(0, 3).map((file) => (file.startsWith(home + path.sep) ? "~" + file.slice(home.length) : file))
  return `The agent changed localcode's own configuration: ${shown.join(", ")}${files.length > 3 ? ` and ${files.length - 3} more` : ""}. Review it if you did not ask for this.`
}

/**
 * LocalCode: when the agent edits its own config or guards (config files, .localcode-agent/,
 * plugins, hooks, MCP settings), show a non-blocking notice after the fact. Agents rewriting
 * their own approval settings is the CVE-2025-53773 / CurXecute pattern; nothing is blocked,
 * but the user always sees it.
 */
export const Plugin = define({
  id: "localcode.self-config-notice",
  effect: Effect.fn(function* (ctx) {
    const bus = yield* Bus.Service
    const global = yield* Global.Service
    const location = yield* Location.Service
    const guarded = Sandbox.guardedPaths({ home: global.home, config: global.config, cache: global.cache })
    yield* ctx.tool.hook("execute.after", (event) =>
      Effect.gen(function* () {
        if (event.status !== "completed") return
        const files = touched(event.tool, event.result.output, location.directory).filter((file) =>
          Sandbox.selfConfig(file, { home: global.home, guarded }),
        )
        if (files.length === 0) return
        yield* bus.publish(TuiEvent.ToastShow, {
          title: "Agent config changed",
          message: notice(files, global.home),
          variant: "warning",
          duration: 10_000,
        })
      }).pipe(Effect.catchCause((cause) => Effect.logWarning("self-config notice failed", { cause }))),
    )
  }),
})

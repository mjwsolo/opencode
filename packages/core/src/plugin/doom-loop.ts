export * as DoomLoopPlugin from "./doom-loop.js"

import { define } from "@opencode/plugin/effect/plugin"
import { Tool } from "@opencode/schema/tool"
import { Effect } from "effect"
import { Permission } from "../permission.js"

/** Identical calls in one model step after which the user is asked whether to continue (opencode v1). */
export const THRESHOLD = 3
const MAX_STEPS = 64

const stable = (value: unknown): string =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  ) ?? ""

/**
 * A model that repeats the same tool call with the same input within one step is stuck. As in
 * opencode v1, the third identical call asks the `doom_loop` permission before it runs.
 */
export const Plugin = define({
  id: "opencode.doom-loop",
  effect: Effect.fn(function* (ctx) {
    const permission = yield* Permission.Service
    const steps = new Map<string, string[]>()
    yield* ctx.tool.hook("execute.before", (event) =>
      Effect.gen(function* () {
        const key = `${event.tool}\0${stable(event.input)}`
        const calls = steps.get(event.messageID) ?? []
        steps.delete(event.messageID)
        steps.set(event.messageID, [...calls, key].slice(-THRESHOLD))
        while (steps.size > MAX_STEPS) steps.delete(steps.keys().next().value!)
        const recent = steps.get(event.messageID)!
        if (recent.length < THRESHOLD || recent.some((item) => item !== key)) return
        yield* permission
          .assert({
            action: "doom_loop",
            resources: [event.tool],
            save: [event.tool],
            metadata: { tool: event.tool, input: event.input as never },
            sessionID: event.sessionID,
            agent: event.agent,
            source: { type: "tool", messageID: event.messageID, id: event.id },
          })
          .pipe(
            Effect.mapError(
              (error) =>
                new Tool.Error({
                  message: `The same ${event.tool} call was repeated ${THRESHOLD} times and was not approved again.`,
                  error,
                }),
            ),
          )
      }),
    )
  }),
})

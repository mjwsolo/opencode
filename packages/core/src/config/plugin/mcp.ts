export * as ConfigMcpPlugin from "./mcp.js"

import { define } from "@opencode/plugin/effect/plugin"
import { Document, type Entry } from "@opencode/schema/config"
import type { ServerConfig } from "@opencode/schema/mcp"
import { Effect, Stream } from "effect"
import { Config } from "../../config.js"
import { Mcp } from "../../mcp/index.js"
import { LocalContext } from "../../session/local-context.js"

/**
 * localcode: in minimal context mode a configured server connects at startup only when it is
 * explicitly enabled (`disabled: false`, or v1 `enabled: true`); it can still be connected from
 * /mcps. `disabled: true` never connects at startup.
 */
export function startupConfig(server: ServerConfig, mode?: string): ServerConfig {
  const enabled = server.disabled === undefined ? undefined : !server.disabled
  if (server.disabled === true || LocalContext.mcpStartupEnabled(enabled, mode)) return server
  return { ...server, disabled: true }
}

export const Plugin = define({
  id: "opencode.config.mcp",
  effect: Effect.fn(function* (ctx) {
    yield* register(ctx.event.subscribe())
  }),
})

export const register = Effect.fn("ConfigMCPPlugin.register")(function* (
  events: Stream.Stream<{ readonly type: string }, unknown>,
) {
  const config = yield* Config.Service
  const mcp = yield* Mcp.Service
  const loaded = { entries: [] as Entry[] }

  yield* events.pipe(
    Stream.filter((event) => event.type === "config.updated"),
    Stream.runForEach(() =>
      config.entries().pipe(
        Effect.tap((entries) => Effect.sync(() => (loaded.entries = entries))),
        Effect.andThen(mcp.reload()),
        Effect.catchCause((cause) => Effect.logError("failed to reload MCP config", { cause })),
      ),
    ),
    Effect.ignore,
    Effect.forkScoped({ startImmediately: true }),
  )

  // Subscribe before the initial load so updates racing it trigger a rebuild.
  loaded.entries = yield* config.entries()
  yield* mcp.transform((editor) => {
    const documents = loaded.entries.filter((entry): entry is Document => entry.type === "document")
    // Global timeout defaults merge in config order; each server can override them.
    const timeout = Object.assign(
      {},
      ...documents.flatMap((entry) => (entry.info.mcp?.timeout ? [entry.info.mcp.timeout] : [])),
    )
    const servers = new Map<string, ServerConfig>()
    for (const document of documents) {
      for (const [name, server] of Object.entries(document.info.mcp?.servers ?? {})) {
        servers.set(name, server)
      }
    }
    for (const [name, server] of servers) {
      if (editor.get(name)) continue
      editor.set(name, { ...startupConfig(server), timeout: { ...timeout, ...server.timeout } })
    }
  })
})

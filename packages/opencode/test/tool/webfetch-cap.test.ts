import { expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { httpClient } from "@opencode-ai/core/effect/app-node-platform"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"
import { Agent } from "../../src/agent/agent"
import { MessageID, SessionID } from "../../src/session/schema"
import { Truncate } from "../../src/tool/truncate"
import { WebFetchTool } from "../../src/tool/webfetch"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([httpClient, Truncate.node, Agent.node]), [
  [httpClient, FetchHttpClient.layer as Layer.Layer<HttpClient.HttpClient>],
]))

for (const format of ["text", "html", "markdown"] as const) {
  it.instance(`webfetch ${format} includes its truncation notice within 20,000 characters`, () =>
    Effect.gen(function* () {
      const server = yield* Effect.acquireRelease(
        Effect.sync(() => Bun.serve({
          hostname: "127.0.0.1", port: 0,
          fetch: () => new Response("<p>" + "sample content ".repeat(2500) + "</p>", {
            headers: { "content-type": "text/html" },
          }),
        })),
        (server) => Effect.sync(() => server.stop(true)),
      )
      const info = yield* WebFetchTool
      const tool = yield* info.init()
      const result = yield* tool.execute({ url: server.url.toString(), format }, {
        sessionID: SessionID.make("ses_cap"),
        messageID: MessageID.make("msg_cap"),
        callID: "cap", agent: "build", abort: AbortSignal.any([]), messages: [],
        metadata: () => Effect.void, ask: () => Effect.void,
      })
      expect(result.output.length).toBeLessThanOrEqual(20_000)
      expect(result.output).toContain("[truncated from ")
      expect(result.output).toContain("sample content")
    }),
  )
}

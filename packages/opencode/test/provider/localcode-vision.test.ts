import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Effect } from "effect"
import path from "path"
import { Env } from "../../src/env"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([Provider.node, Env.node, Plugin.node, FSUtil.node])))
const previous = process.env.LOCALCODE_CONTROL_URL
afterEach(async () => {
  if (previous === undefined) delete process.env.LOCALCODE_CONTROL_URL
  else process.env.LOCALCODE_CONTROL_URL = previous
  await disposeAllInstances()
})

it.instance("discovered aliases have independent vision capabilities across immediate switches", () =>
  Effect.gen(function* () {
    const directory = (yield* TestInstance).directory
    const fs = yield* FSUtil.Service
    yield* fs.writeFileString(path.join(directory, "localcode.json"), JSON.stringify({
      provider: { localcode: {
        npm: "@ai-sdk/openai-compatible",
        models: { template: { name: "template", modalities: { input: ["text"], output: ["text"] } } },
      } },
      enabled_providers: ["localcode"],
    }))
    let status = { current: "vision-model", state: "ready", vision: true }
    const server = yield* Effect.acquireRelease(
      Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json(status) })),
      (server) => Effect.sync(() => server.stop(true)),
    )
    process.env.LOCALCODE_CONTROL_URL = server.url.toString()
    const provider = yield* Provider.Service
    const first = yield* provider.getModel(ProviderV2.ID.make("localcode"), ModelV2.ID.make("vision-model"))
    expect(first.capabilities.input.image).toBe(true)
    status = { current: "text-model", state: "ready", vision: false }
    const second = yield* provider.getModel(ProviderV2.ID.make("localcode"), ModelV2.ID.make("text-model"))
    expect(second.capabilities.input.image).toBe(false)
    expect(second.capabilities.attachment).toBe(false)
    expect(first.capabilities.input.image).toBe(true)
    status = { current: "text-model", state: "ready", vision: true }
    const enabled = yield* provider.getModel(ProviderV2.ID.make("localcode"), ModelV2.ID.make("text-model"))
    expect(enabled.capabilities.input.image).toBe(true)
    expect(second.capabilities.input.image).toBe(false)
    server.stop(true)
    const unavailable = yield* provider.getModel(ProviderV2.ID.make("localcode"), ModelV2.ID.make("text-model"))
    expect(unavailable.capabilities.input.image).toBe(false)
  }),
)

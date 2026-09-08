import { afterEach, describe, expect, test } from "bun:test"
import { Config, ConfigProvider, Effect } from "effect"
import { Flag, alias, config, env, truthy } from "@opencode-ai/core/flag/flag"

const keys = ["LOCALCODE_FLAG_TEST", "OPENCODE_FLAG_TEST"]

afterEach(() => {
  for (const key of keys) delete process.env[key]
})

describe("Flag env aliases", () => {
  test("alias maps OPENCODE_ names to LOCALCODE_ names", () => {
    expect(alias("OPENCODE_CONFIG_DIR")).toBe("LOCALCODE_CONFIG_DIR")
    expect(alias("OTEL_EXPORTER_OTLP_ENDPOINT")).toBe("OTEL_EXPORTER_OTLP_ENDPOINT")
  })

  test("env reads the LOCALCODE_ name first and falls back to OPENCODE_", () => {
    process.env.OPENCODE_FLAG_TEST = "legacy"
    expect(env("OPENCODE_FLAG_TEST")).toBe("legacy")
    process.env.LOCALCODE_FLAG_TEST = "new"
    expect(env("OPENCODE_FLAG_TEST")).toBe("new")
    expect(truthy("OPENCODE_FLAG_TEST")).toBe(false)
    process.env.LOCALCODE_FLAG_TEST = "1"
    expect(truthy("OPENCODE_FLAG_TEST")).toBe(true)
  })

  test("getter flags honour LOCALCODE_ at access time", () => {
    process.env.OPENCODE_CONFIG_DIR = "/legacy"
    process.env.LOCALCODE_CONFIG_DIR = "/new"
    expect(Flag.OPENCODE_CONFIG_DIR).toBe("/new")
    delete process.env.LOCALCODE_CONFIG_DIR
    expect(Flag.OPENCODE_CONFIG_DIR).toBe("/legacy")
    delete process.env.OPENCODE_CONFIG_DIR
  })

  test("config reads LOCALCODE_ first through the Effect ConfigProvider", async () => {
    const read = (map: Record<string, string>) =>
      Effect.runPromise(
        config(Config.boolean, "OPENCODE_FLAG_TEST").pipe(
          Config.withDefault(false),
          Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(map)),
        ),
      )
    expect(await read({})).toBe(false)
    expect(await read({ OPENCODE_FLAG_TEST: "true" })).toBe(true)
    expect(await read({ LOCALCODE_FLAG_TEST: "false", OPENCODE_FLAG_TEST: "true" })).toBe(false)
  })
})

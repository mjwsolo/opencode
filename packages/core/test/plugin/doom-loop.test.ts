import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { DoomLoopPlugin } from "../../src/plugin/doom-loop"
import { Permission } from "../../src/permission"

type Hook = (event: any) => Effect.Effect<void, any>

async function setup(deny = false) {
  const asserted: any[] = []
  let hook: Hook | undefined
  const ctx = { tool: { hook: (_: string, fn: Hook) => Effect.sync(() => void (hook = fn)) } }
  const permission = Layer.succeed(Permission.Service, {
    assert: (input: any) =>
      Effect.suspend(() => {
        asserted.push(input)
        return deny ? Effect.fail(new Error("declined") as any) : Effect.void
      }),
  } as any)
  const effect = (DoomLoopPlugin.Plugin.effect(ctx as any) as Effect.Effect<void, never, Permission.Service>).pipe(
    Effect.provide(permission),
  )
  await Effect.runPromise(effect)
  const call = (input: unknown, messageID = "msg_1", tool = "read") =>
    Effect.runPromiseExit(hook!({ tool, input, messageID, sessionID: "ses_1", agent: "build", id: "call" }))
  return { asserted, call }
}

describe("doom loop", () => {
  test("the third identical call in one step asks doom_loop, whatever the key order", async () => {
    const { asserted, call } = await setup()
    await call({ path: "a", limit: 2 })
    await call({ limit: 2, path: "a" })
    expect(asserted).toEqual([])
    await call({ path: "a", limit: 2 })
    expect(asserted).toMatchObject([
      { action: "doom_loop", resources: ["read"], save: ["read"], metadata: { tool: "read" }, sessionID: "ses_1" },
    ])
  })

  test("different input, another tool or another step resets the count", async () => {
    const { asserted, call } = await setup()
    await call({ path: "a" })
    await call({ path: "a" })
    await call({ path: "b" })
    await call({ path: "a" }, "msg_2")
    await call({ path: "a" }, "msg_2", "glob")
    await call({ path: "a" }, "msg_2")
    expect(asserted).toEqual([])
  })

  test("a declined repeat fails the call before it runs", async () => {
    const { call } = await setup(true)
    await call({})
    await call({})
    const exit = await call({})
    expect(exit._tag).toBe("Failure")
    expect(JSON.stringify(exit)).toContain("repeated 3 times")
  })
})

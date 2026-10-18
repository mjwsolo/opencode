import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Global } from "@opencode/util/global"
import { SelfConfigNoticePlugin } from "../../src/plugin/self-config"
import { Bus } from "../../src/bus"
import { Location } from "../../src/location"

type Hook = (event: any) => Effect.Effect<void, any>

const home = "/u/someone"
const directory = "/work/app"

async function setup() {
  const published: any[] = []
  let hook: Hook | undefined
  const ctx = { tool: { hook: (_: string, fn: Hook) => Effect.sync(() => void (hook = fn)) } }
  const layer = Layer.mergeAll(
    Layer.succeed(Bus.Service, {
      publish: (definition: any, data: any) => Effect.sync(() => void published.push({ type: definition.type, data })),
    } as any),
    Layer.succeed(Global.Service, Global.make({ home, config: `${home}/.config/localcode-agent`, cache: `${home}/.cache/localcode-agent` })),
    Layer.succeed(Location.Service, { directory, project: { directory } } as any),
  )
  const effect = (
    SelfConfigNoticePlugin.Plugin.effect(ctx as any) as Effect.Effect<void, never, Bus.Service | Global.Service | Location.Service>
  ).pipe(Effect.provide(layer))
  await Effect.runPromise(effect)
  const call = (tool: string, output: unknown, status = "completed") =>
    Effect.runPromise(
      hook!({
        tool,
        status,
        result: { output },
        error: undefined,
        input: {},
        messageID: "msg_1",
        sessionID: "ses_1",
        agent: "build",
        id: "call",
      }),
    )
  return { published, call }
}

describe("self-config notice", () => {
  test("an edit of the agent's own config shows a warning toast, without blocking", async () => {
    const { published, call } = await setup()
    await call("edit", { files: [{ file: ".localcode-agent/localcode.json" }], replacements: 1 })
    expect(published).toMatchObject([
      {
        type: "tui.toast.show",
        data: {
          variant: "warning",
          message: expect.stringContaining("/work/app/.localcode-agent/localcode.json"),
        },
      },
    ])
  })

  test("write, patch and shell results are checked; ordinary files and failures are quiet", async () => {
    const { published, call } = await setup()
    await call("write", { target: "/work/app/src/a.ts" })
    await call("patch", { applied: [], files: [{ file: "src/b.ts" }] })
    await call("shell", { output: "", truncated: false })
    await call("write", { target: "/work/app/opencode.json" }, "error")
    expect(published).toEqual([])
    await call("write", { target: `${home}/.config/localcode-agent/tui.json` })
    await call("patch", { applied: [], files: [{ file: ".opencode/plugins/x.ts" }] })
    await call("shell", { output: "", truncated: false, selfConfig: ["/work/app/localcode.json"] })
    expect(published.map((item) => item.data.message)).toEqual([
      expect.stringContaining("~/.config/localcode-agent/tui.json"),
      expect.stringContaining("/work/app/.opencode/plugins/x.ts"),
      expect.stringContaining("/work/app/localcode.json"),
    ])
  })

  test("touched() resolves relative paths and notice() abbreviates long lists", () => {
    expect(SelfConfigNoticePlugin.touched("edit", { files: [{ file: "a" }, { file: "/b" }] }, directory)).toEqual([
      "/work/app/a",
      "/b",
    ])
    expect(SelfConfigNoticePlugin.touched("read", { target: "/x" }, directory)).toEqual([])
    expect(SelfConfigNoticePlugin.notice(["/a", "/b", "/c", "/d", "/e"], home)).toContain("/a, /b, /c and 2 more")
  })
})

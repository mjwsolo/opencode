import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect, Layer, Stream } from "effect"
import { Bus } from "../../src/bus"
import { FileAccess } from "../../src/file-access"
import { Location } from "../../src/location"
import { LSP } from "../../src/lsp/lsp"
import { Permission } from "../../src/permission"
import { LspPlugin } from "../../src/plugin/lsp"
import { tmpdir } from "../fixture/tmpdir"

const error = (line: number, message: string) => ({
  range: { start: { line, character: 0 }, end: { line, character: 1 } },
  message,
  severity: 1,
})

async function setup(options: { enabled?: boolean; diagnostics?: Record<string, unknown[]>; tool?: boolean } = {}) {
  const tmp = await tmpdir()
  const touched: string[] = []
  const queries: string[] = []
  const asserted: any[] = []
  const tools: any[] = []
  const hooks = new Map<string, (event: any) => Effect.Effect<void>>()
  let handlers: any
  const lsp = {
    enabled: () => Effect.succeed(options.enabled ?? true),
    status: () => Effect.succeed([{ id: "typescript", name: "typescript", root: "", status: "connected" }]),
    catalog: () => Effect.succeed([]),
    install: (id: string) => Effect.succeed({ ok: id === "pyright" }),
    touchFile: (file: string) => Effect.sync(() => void touched.push(file)),
    diagnostics: () => Effect.succeed(options.diagnostics ?? {}),
    hasClients: () => Effect.succeed(true),
    definition: () => Effect.succeed([{ uri: "file:///x" }]),
    references: () => Effect.succeed([]),
    hover: () => Effect.succeed([]),
    implementation: () => Effect.succeed([]),
    documentSymbol: () => Effect.succeed([]),
    workspaceSymbol: (query: string) => Effect.sync(() => (queries.push(query), [])),
    prepareCallHierarchy: () => Effect.succeed([]),
    incomingCalls: () => Effect.succeed([]),
    outgoingCalls: () => Effect.succeed([]),
  }
  const ctx = {
    rpc: {
      register: (_: unknown, value: unknown) =>
        Effect.sync(() => ((handlers = value), { events: { emit: () => Effect.void } })),
    },
    tool: {
      hook: (name: string, fn: any) => Effect.sync(() => void hooks.set(name, fn)),
      transform: (fn: any) => Effect.sync(() => fn({ add: (tool: any) => tools.push(tool) })),
    },
  }
  const services = Layer.mergeAll(
    Layer.succeed(LSP.Service, lsp as unknown as LSP.Interface),
    Layer.succeed(Location.Service, { directory: tmp.path, project: { directory: tmp.path } } as any),
    Layer.succeed(FileAccess.Service, {
      resolve: (input: { path: string }) =>
        Effect.succeed({ absolute: FileAccess.resolvePath(tmp.path, input.path), resource: input.path }),
      authorizeExternal: () => Effect.void,
    } as any),
    Layer.succeed(Permission.Service, { assert: (input: any) => Effect.sync(() => void asserted.push(input)) } as any),
    Layer.succeed(Bus.Service, { subscribe: () => Stream.empty } as any),
  )
  const previous = process.env.OPENCODE_EXPERIMENTAL_LSP_TOOL
  if (options.tool) process.env.OPENCODE_EXPERIMENTAL_LSP_TOOL = "1"
  else delete process.env.OPENCODE_EXPERIMENTAL_LSP_TOOL
  await Effect.runPromise(
    Effect.scoped(
      (LspPlugin.Plugin.effect(ctx as any) as Effect.Effect<void, never, any>).pipe(Effect.provide(services)),
    ) as Effect.Effect<void>,
  )
  if (previous === undefined) delete process.env.OPENCODE_EXPERIMENTAL_LSP_TOOL
  else process.env.OPENCODE_EXPERIMENTAL_LSP_TOOL = previous
  const after = async (event: any) => {
    event.status ??= "completed"
    await Effect.runPromise(hooks.get("execute.after")!(event))
    await new Promise((resolve) => setTimeout(resolve, 10))
    return event
  }
  return { tmp, touched, queries, asserted, tools, handlers: () => handlers, after }
}

const text = (event: any) => (event.result.content ?? []).map((item: any) => item.text).join("\n")

describe("LSP plugin", () => {
  test("an edit reports the file's errors, as opencode v1 did", async () => {
    const file = "/w/a.ts"
    const { tmp, touched, after } = await setup({ diagnostics: { [file]: [error(2, "Bad type")] } })
    await using _ = tmp
    const event = await after({ tool: "edit", input: { path: file }, result: { content: [{ type: "text", text: "Edited" }] } })
    expect(touched).toEqual([file])
    expect(text(event)).toBe(`Edited\nLSP errors detected in this file, please fix:\n<diagnostics file="${file}">\nERROR [3:1] Bad type\n</diagnostics>`)
    expect(event.result.metadata.diagnostics[file]).toHaveLength(1)
  })

  test("a write also reports up to five other files with errors; warnings are not reported", async () => {
    const diagnostics: Record<string, unknown[]> = { "/w/a.ts": [{ ...error(0, "warn"), severity: 2 }] }
    for (let index = 0; index < 7; index++) diagnostics[`/w/other${index}.ts`] = [error(0, `e${index}`)]
    const { tmp, after } = await setup({ diagnostics })
    await using _ = tmp
    const event = await after({ tool: "write", input: { path: "/w/a.ts" }, result: { content: "Wrote" } })
    expect(text(event).match(/LSP errors detected in other files/g)).toHaveLength(5)
    expect(text(event)).not.toContain("in this file")
  })

  test("a patch reports each changed file that has errors, skipping deleted ones", async () => {
    const { tmp, touched, after } = await setup({ diagnostics: { [path.join("/w", "b.ts")]: [error(4, "Missing")] } })
    await using _ = tmp
    const event = await after({
      tool: "patch",
      input: {},
      result: {
        output: { applied: [{ type: "update", target: "/w/b.ts" }, { type: "delete", target: "/w/c.ts" }] },
        content: "Success",
      },
    })
    expect(touched).toEqual(["/w/b.ts"])
    expect(text(event)).toContain("please fix:\n<diagnostics file=\"/w/b.ts\">\nERROR [5:1] Missing")
  })

  test("nothing changes without errors or with language servers off; reads warm the file's server", async () => {
    const quiet = await setup()
    await using _a = quiet.tmp
    const event = await quiet.after({ tool: "edit", input: { path: "a.ts" }, result: { content: "Edited" } })
    expect(event.result.content).toBe("Edited")
    await quiet.after({ tool: "read", input: { path: "src/x.ts" }, result: {} })
    expect(quiet.touched).toEqual([path.join(quiet.tmp.path, "a.ts"), path.join(quiet.tmp.path, "src/x.ts")])
    const off = await setup({ enabled: false, diagnostics: { "/w/a.ts": [error(0, "x")] } })
    await using _b = off.tmp
    await off.after({ tool: "edit", input: { path: "/w/a.ts" }, result: { content: "Edited" } })
    expect(off.touched).toEqual([])
  })

  test("the terminal UI reads status and installs only the server it names", async () => {
    const { tmp, handlers } = await setup()
    await using _ = tmp
    expect(await Effect.runPromise(handlers().status({}, {}) as Effect.Effect<unknown>)).toEqual({
      enabled: true,
      servers: [{ id: "typescript", name: "typescript", root: "", status: "connected" }],
    })
    expect(await Effect.runPromise(handlers().install({ id: "pyright" }, {}) as Effect.Effect<unknown>)).toEqual({ ok: true })
  })

  test("the lsp tool exists only when the experimental flag is set, and asks the lsp permission", async () => {
    const off = await setup()
    await using _a = off.tmp
    expect(off.tools).toEqual([])
    const on = await setup({ tool: true })
    await using _b = on.tmp
    expect(on.tools.map((tool) => tool.name)).toEqual(["lsp"])
    await fs.writeFile(path.join(on.tmp.path, "test.ts"), "export const x = 1\n")
    const context = { sessionID: "s", agent: "build", messageID: "m", id: "c" }
    const result: any = await Effect.runPromise(
      on.tools[0].execute({ operation: "goToDefinition", path: "test.ts", line: 3, character: 7 }, context),
    )
    expect(on.asserted[0]).toMatchObject({
      action: "lsp",
      metadata: { operation: "goToDefinition", path: path.join(on.tmp.path, "test.ts"), line: 3, character: 7 },
    })
    expect(result.content).toContain("file:///x")
    await Effect.runPromise(on.tools[0].execute({ operation: "workspaceSymbol", path: "test.ts", line: 1, character: 1, query: "TestSymbol" }, context))
    await Effect.runPromise(on.tools[0].execute({ operation: "workspaceSymbol", path: "test.ts", line: 1, character: 1 }, context))
    expect(on.queries).toEqual(["TestSymbol", ""])
    expect(on.asserted[1].metadata).toEqual({ operation: "workspaceSymbol" })
  })
})

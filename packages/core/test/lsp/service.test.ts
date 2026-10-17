import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import path from "path"
import { Effect, Layer } from "effect"
import { Bus } from "../../src/bus"
import { Config } from "../../src/config"
import { Location } from "../../src/location"
import { LSP } from "../../src/lsp/lsp"
import * as LSPServer from "../../src/lsp/server"
import { tmpdir } from "./fixture"

const fakeServerPath = path.join(__dirname, "../fixture/lsp/fake-lsp-server.js")

/** The LSP service for one directory, with the configuration and event bus it reads (opencode v1's test instance). */
async function withLsp<A>(
  options: { lsp?: unknown; env?: Record<string, string> },
  fn: (input: { lsp: LSP.Interface; directory: string; events: string[] }) => Effect.Effect<A>,
) {
  await using tmp = await tmpdir()
  const events: string[] = []
  const previous = Object.fromEntries(Object.keys(options.env ?? {}).map((key) => [key, process.env[key]]))
  Object.assign(process.env, options.env)
  const services = Layer.mergeAll(
    Layer.succeed(Config.Service, {
      entries: () =>
        Effect.succeed(options.lsp === undefined ? [] : [{ type: "document", info: { lsp: options.lsp } }]),
    } as unknown as Config.Interface),
    Layer.succeed(Location.Service, {
      directory: tmp.path,
      project: { id: "project", directory: tmp.path },
    } as unknown as Location.Interface),
    Layer.succeed(Bus.Service, {
      publish: (definition: { type: string }) => Effect.sync(() => void events.push(definition.type)),
    } as unknown as Bus.Interface),
  )
  try {
    return await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const lsp = yield* LSP.Service
          return yield* fn({ lsp, directory: tmp.path, events })
        }).pipe(Effect.provide(LSP.layer.pipe(Layer.provide(services)))),
      ),
    )
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

describe("lsp.spawn", () => {
  test("does not spawn builtin LSP for files outside instance", async () => {
    const spy = spyOn(LSPServer.Typescript, "spawn").mockResolvedValue(undefined)
    try {
      await withLsp({ lsp: true }, ({ lsp, directory }) =>
        Effect.gen(function* () {
          yield* lsp.touchFile(path.join(directory, "..", "outside.ts"))
          yield* lsp.hover({ file: path.join(directory, "..", "hover.ts"), line: 0, character: 0 })
        }),
      )
      expect(spy).toHaveBeenCalledTimes(0)
    } finally {
      spy.mockRestore()
    }
  })

  test("does not spawn builtin LSP for files inside instance when LSP is unset", async () => {
    const spy = spyOn(LSPServer.Typescript, "spawn").mockResolvedValue(undefined)
    try {
      await withLsp({}, ({ lsp, directory }) =>
        lsp.hover({ file: path.join(directory, "src", "inside.ts"), line: 0, character: 0 }),
      )
      expect(spy).toHaveBeenCalledTimes(0)
    } finally {
      spy.mockRestore()
    }
  })

  for (const [label, config] of [
    ["lsp is true", true],
    ["config object is provided", { eslint: { disabled: true } }],
  ] as const)
    test(`would spawn builtin LSP for files inside instance when ${label}`, async () => {
      const spy = spyOn(LSPServer.Typescript, "spawn").mockResolvedValue(undefined)
      try {
        await withLsp({ lsp: config }, ({ lsp, directory }) =>
          lsp.hover({ file: path.join(directory, "src", "inside.ts"), line: 0, character: 0 }),
        )
        expect(spy).toHaveBeenCalledTimes(1)
      } finally {
        spy.mockRestore()
      }
    })

  test("publishes lsp.updated after custom LSP initialization and reports it connected", async () => {
    const result = await withLsp(
      { lsp: { fake: { command: [process.execPath, fakeServerPath], extensions: [".repro"] } } },
      ({ lsp, directory, events }) =>
        Effect.gen(function* () {
          const file = path.join(directory, "sample.repro")
          yield* Effect.promise(() => Bun.write(file, "sample\n"))
          yield* lsp.touchFile(file)
          return { events: [...events], status: yield* lsp.status(), catalog: yield* lsp.catalog() }
        }),
    )
    expect(result.events).toContain("lsp.updated")
    expect(result.status).toEqual([{ id: "fake", name: "fake", root: "", status: "connected" }])
    expect(result.catalog.find((entry) => entry.id === "fake")).toMatchObject({ installed: true, status: "connected" })
  })

  test("uses pyright instead of ty by default, and ty when experimentalLspTy is enabled", async () => {
    for (const [env, expected] of [
      [{}, { ty: 0, pyright: 1 }],
      [{ OPENCODE_EXPERIMENTAL_LSP_TY: "1" }, { ty: 1, pyright: 0 }],
    ] as const) {
      const ty = spyOn(LSPServer.Ty, "spawn").mockResolvedValue(undefined)
      const pyright = spyOn(LSPServer.Pyright, "spawn").mockResolvedValue(undefined)
      try {
        await withLsp({ lsp: true, env }, ({ lsp, directory }) =>
          lsp.hover({ file: path.join(directory, "src", "inside.py"), line: 0, character: 0 }),
        )
        expect(ty).toHaveBeenCalledTimes(expected.ty)
        expect(pyright).toHaveBeenCalledTimes(expected.pyright)
      } finally {
        ty.mockRestore()
        pyright.mockRestore()
      }
    }
  })

  test("passes disableLspDownload to builtin LSP spawn; an explicit install lifts it", async () => {
    const pyright = spyOn(LSPServer.Pyright, "spawn").mockResolvedValue(undefined)
    try {
      const result = await withLsp({ lsp: true, env: { OPENCODE_DISABLE_LSP_DOWNLOAD: "1" } }, ({ lsp, directory }) =>
        Effect.gen(function* () {
          yield* lsp.hover({ file: path.join(directory, "src", "inside.py"), line: 0, character: 0 })
          return yield* lsp.install("pyright")
        }),
      )
      expect(pyright).toHaveBeenCalledTimes(2)
      expect(pyright.mock.calls[0]?.[2]).toMatchObject({ disableLspDownload: true })
      expect(pyright.mock.calls[1]?.[2]).toMatchObject({ disableLspDownload: false })
      expect(result).toMatchObject({ ok: false })
    } finally {
      pyright.mockRestore()
    }
  })
})

describe("LSP service lifecycle", () => {
  let spawnSpy: ReturnType<typeof spyOn>
  beforeEach(() => {
    spawnSpy = spyOn(LSPServer.Typescript, "spawn").mockResolvedValue(undefined)
  })
  afterEach(() => spawnSpy.mockRestore())

  test("unavailable servers are not errors and are retried after project setup", async () => {
    await withLsp({ lsp: true }, ({ lsp, directory }) =>
      Effect.gen(function* () {
        const file = path.join(directory, "example.ts")
        yield* lsp.touchFile(file)
        expect(yield* lsp.status()).toEqual([])
        yield* lsp.touchFile(file)
      }),
    )
    expect(spawnSpy).toHaveBeenCalledTimes(2)
  })

  test("init, status, diagnostics, symbols and lookups are empty without clients", async () => {
    await withLsp({}, ({ lsp, directory }) =>
      Effect.gen(function* () {
        yield* lsp.init()
        yield* lsp.init()
        expect(yield* lsp.status()).toEqual([])
        expect(yield* lsp.diagnostics()).toEqual({})
        expect(yield* lsp.workspaceSymbol("test")).toEqual([])
        expect(Array.isArray(yield* lsp.definition({ file: path.join(directory, "x.ts"), line: 0, character: 0 }))).toBe(true)
        expect(Array.isArray(yield* lsp.references({ file: path.join(directory, "x.ts"), line: 0, character: 0 }))).toBe(true)
        expect(yield* lsp.enabled()).toBe(false)
      }),
    )
  })

  test("hasClients() follows the lsp setting and the instance boundary", async () => {
    expect(await withLsp({}, ({ lsp, directory }) => lsp.hasClients(path.join(directory, "test.ts")))).toBe(false)
    expect(await withLsp({ lsp: true }, ({ lsp, directory }) => lsp.hasClients(path.join(directory, "test.ts")))).toBe(true)
    expect(
      await withLsp({ lsp: { eslint: { disabled: true } } }, ({ lsp, directory }) =>
        lsp.hasClients(path.join(directory, "test.ts")),
      ),
    ).toBe(true)
  })

  test("the catalog lists every server with what installing it fetches", async () => {
    const catalog = await withLsp({ lsp: true }, ({ lsp }) => lsp.catalog())
    const typescript = catalog.find((entry) => entry.id === "typescript")
    expect(typescript?.download).toContain("npm: typescript-language-server")
    expect(typescript?.status).toBe("idle")
    expect(catalog.map((entry) => entry.id)).toEqual(catalog.map((entry) => entry.id).toSorted())
    expect(await withLsp({ lsp: { typescript: { disabled: true } } }, ({ lsp }) => lsp.catalog())).not.toContainEqual(
      expect.objectContaining({ id: "typescript" }),
    )
  })
})

describe("LSP.Diagnostic", () => {
  test("pretty() formats diagnostics by severity", () => {
    expect(
      LSP.Diagnostic.pretty({
        range: { start: { line: 9, character: 4 }, end: { line: 9, character: 10 } },
        message: "Type 'string' is not assignable to type 'number'",
        severity: 1,
      } as any),
    ).toBe("ERROR [10:5] Type 'string' is not assignable to type 'number'")
    expect(
      LSP.Diagnostic.pretty({
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
        message: "Unused variable",
        severity: 2,
      } as any),
    ).toBe("WARN [1:1] Unused variable")
    expect(
      LSP.Diagnostic.pretty({ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, message: "Something wrong" } as any),
    ).toBe("ERROR [1:1] Something wrong")
  })
})

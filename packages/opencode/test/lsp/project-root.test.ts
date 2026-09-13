import { describe, expect, test } from "bun:test"
import path from "path"
import { Typescript, ESLint, Oxlint, Biome } from "../../src/lsp/server"
import { tmpdir, withTestInstance } from "../fixture/fixture"

describe("project language selection", () => {
  test("finds a nested TypeScript app before dependencies or a lockfile exist", async () => {
    await using tmp = await tmpdir()
    const root = path.join(tmp.path, "nested", "app")
    await Bun.write(path.join(root, "package.json"), '{"name":"example"}')
    await withTestInstance({ directory: tmp.path, fn: async (ctx) => {
      const file = path.join(root, "src", "index.ts")
      expect(await Typescript.root(file, ctx)).toBe(root)
      for (const server of [ESLint, Oxlint, Biome]) {
        expect(await server.root(file, ctx)).toBeUndefined()
      }
      await Bun.write(path.join(root, "biome.json"), "{}")
      expect(await Biome.root(file, ctx)).toBe(root)
    } })
  })
})

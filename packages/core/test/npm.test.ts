import fs from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Global } from "@opencode-ai/core/global"
import { Npm } from "@opencode-ai/core/npm"
import { tmpdir } from "./fixture/tmpdir"

const win = process.platform === "win32"

const writePackage = (dir: string, pkg: Record<string, unknown>) =>
  Bun.write(
    path.join(dir, "package.json"),
    JSON.stringify({
      version: "1.0.0",
      ...pkg,
    }),
  )

const npmLayer = (cache: string) =>
  AppNodeBuilder.build(Npm.node, [[Global.node, Global.layerWith({ cache, state: path.join(cache, "state") })]])

describe("Npm.sanitize", () => {
  test("keeps normal scoped package specs unchanged", () => {
    expect(Npm.sanitize("@opencode/acme")).toBe("@opencode/acme")
    expect(Npm.sanitize("@opencode/acme@1.0.0")).toBe("@opencode/acme@1.0.0")
    expect(Npm.sanitize("prettier")).toBe("prettier")
  })

  test("handles git https specs", () => {
    const spec = "acme@git+https://github.com/opencode/acme.git"
    const expected = win ? "acme@git+https_//github.com/opencode/acme.git" : spec
    expect(Npm.sanitize(spec)).toBe(expected)
  })
})

describe("Npm.add", () => {
  test("reifies when package cache directory exists without the package installed", async () => {
    await using tmp = await tmpdir()
    await fs.mkdir(path.join(tmp.path, "fixture-provider"))
    await writePackage(path.join(tmp.path, "fixture-provider"), {
      name: "fixture-provider",
      main: "index.js",
    })
    await Bun.write(path.join(tmp.path, "fixture-provider", "index.js"), "export const fixture = true\n")

    const spec = `fixture-provider@file:${path.join(tmp.path, "fixture-provider")}`
    await fs.mkdir(path.join(tmp.path, "cache", "packages", Npm.sanitize(spec)), { recursive: true })

    const entry = await Effect.gen(function* () {
      const npm = yield* Npm.Service
      return yield* npm.add(spec)
    }).pipe(Effect.scoped, Effect.provide(npmLayer(path.join(tmp.path, "cache"))), Effect.runPromise)

    expect(entry.entrypoint).toBeDefined()
  })
})

describe("Npm.which", () => {
  test("installs a CLI-only package on the first call without a module entrypoint", async () => {
    await using tmp = await tmpdir()
    const dir = path.join(tmp.path, "fixture-cli")
    await fs.mkdir(dir)
    await writePackage(dir, { name: "fixture-cli", bin: { "fixture-cli": "cli.cjs" } })
    await Bun.write(path.join(dir, "cli.cjs"), "#!/usr/bin/env node\nprocess.stdout.write('ready')\n")
    const tar = path.join(tmp.path, "fixture-cli.tar")
    await Bun.write(tar, await new Bun.Archive({
      "package/package.json": await Bun.file(path.join(dir, "package.json")).text(),
      "package/cli.cjs": await Bun.file(path.join(dir, "cli.cjs")).text(),
    }).bytes())
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        if (new URL(request.url).pathname.includes("/-/npm/")) return Response.json({})
        if (new URL(request.url).pathname.endsWith(".tar")) return new Response(Bun.file(tar))
        return Response.json({ name: "fixture-cli", "dist-tags": { latest: "1.0.0" }, versions: {
          "1.0.0": { name: "fixture-cli", version: "1.0.0", bin: { "fixture-cli": "cli.cjs" },
            dist: { tarball: new URL("/fixture-cli.tar", request.url).href } },
        } })
      },
    })
    try {
      await Bun.write(path.join(tmp.path, "cache", "packages", "fixture-cli", ".npmrc"), `registry=${server.url}\n`)
      const bin = await Effect.gen(function* () {
        const npm = yield* Npm.Service
        return yield* npm.which("fixture-cli", "fixture-cli")
      }).pipe(Effect.scoped, Effect.provide(npmLayer(path.join(tmp.path, "cache"))), Effect.runPromise)
      expect(bin).toBeDefined()
      expect(await Bun.file(bin!).text()).toContain("ready")
    } finally {
      server.stop(true)
    }
  })
})

describe("Npm.install", () => {
  test("respects omit from project .npmrc", async () => {
    await using tmp = await tmpdir()

    await writePackage(tmp.path, {
      name: "fixture",
      dependencies: {
        "prod-pkg": "file:./prod-pkg",
      },
      devDependencies: {
        "dev-pkg": "file:./dev-pkg",
      },
    })
    await Bun.write(path.join(tmp.path, ".npmrc"), "omit=dev\n")
    await fs.mkdir(path.join(tmp.path, "prod-pkg"))
    await fs.mkdir(path.join(tmp.path, "dev-pkg"))
    await writePackage(path.join(tmp.path, "prod-pkg"), { name: "prod-pkg" })
    await writePackage(path.join(tmp.path, "dev-pkg"), { name: "dev-pkg" })

    await Npm.install(tmp.path)

    await expect(fs.stat(path.join(tmp.path, "node_modules", "prod-pkg"))).resolves.toBeDefined()
    await expect(fs.stat(path.join(tmp.path, "node_modules", "dev-pkg"))).rejects.toThrow()
  })
})

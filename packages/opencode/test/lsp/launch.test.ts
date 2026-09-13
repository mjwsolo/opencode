import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { text } from "node:stream/consumers"
import { spawn, spawnJavaScript } from "../../src/lsp/launch"
import { tmpdir } from "../fixture/fixture"

describe("lsp.launch", () => {
  test("runs JavaScript language servers and their children without node on PATH", async () => {
    await using tmp = await tmpdir()
    const child = path.join(tmp.path, "child.cjs")
    const file = path.join(tmp.path, "server.cjs")
    await Bun.write(child, 'process.stdout.write("child ready")')
    await Bun.write(file, `require("node:child_process").fork(${JSON.stringify(child)}, [], { stdio: "inherit" })`)
    const proc = spawnJavaScript(file, [], { env: { PATH: "" } })
    expect(await text(proc.stdout)).toBe("child ready")
    expect(await proc.exited).toBe(0)
  })

  test("spawns cmd scripts with spaces on Windows", async () => {
    if (process.platform !== "win32") return

    await using tmp = await tmpdir()
    const dir = path.join(tmp.path, "with space")
    const file = path.join(dir, "echo cmd.cmd")

    await fs.mkdir(dir, { recursive: true })
    await Bun.write(file, "@echo off\r\nif %~1==--stdio exit /b 0\r\nexit /b 7\r\n")

    const proc = spawn(file, ["--stdio"])

    expect(await proc.exited).toBe(0)
  })
})

import { afterEach, beforeEach, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  readConfig,
  servers,
  setEnabled,
  userConfigDir,
  userConfigFile,
} from "../../src/util/mcp-config"

let dir: string
let file: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpcfg-"))
  file = path.join(dir, "localcode-agent", "localcode.json")
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

test("config dir honours XDG_CONFIG_HOME and falls back to ~/.config", () => {
  expect(userConfigDir({ XDG_CONFIG_HOME: "/x" }, "/h")).toBe("/x/localcode-agent")
  expect(userConfigDir({}, "/h")).toBe("/h/.config/localcode-agent")
  expect(userConfigFile(path.join(dir, "none"))).toBe(path.join(dir, "none", "localcode.json"))
})

test("disable and enable keep other keys and use private mode", () => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ model: "keep", mcp: { old: { type: "local", command: ["o"] } } }))
  expect(setEnabled(file, "old", false)).toBe(true)
  expect((servers(readConfig(file)).old as { enabled?: boolean }).enabled).toBe(false)
  expect(setEnabled(file, "old", true)).toBe(true)
  expect((servers(readConfig(file)).old as { enabled?: boolean }).enabled).toBe(true)
  expect(setEnabled(file, "missing", true)).toBe(false)
  expect(readConfig(file).model).toBe("keep")
  expect(fs.statSync(file).mode & 0o777).toBe(0o600)
  expect(fs.readdirSync(path.dirname(file)).filter((f) => f.endsWith(".tmp"))).toEqual([])
})

test("legacy mcp.servers entries and jsonc comments are handled", () => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `{\n // note\n "mcp": {"servers": {"s": {"type": "remote", "url": "https://a.example//x"}}}\n}`)
  expect(Object.keys(servers(readConfig(file)))).toEqual(["s"])
  expect(setEnabled(file, "s", false)).toBe(true)
  const cfg = readConfig(file) as { mcp: { servers: { s: { enabled: boolean; url: string } } } }
  expect(cfg.mcp.servers.s.enabled).toBe(false)
  expect(cfg.mcp.servers.s.url).toBe("https://a.example//x")
})

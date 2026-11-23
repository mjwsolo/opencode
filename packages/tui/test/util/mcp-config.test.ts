import { afterEach, beforeEach, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  addServer,
  commandLine,
  parseCommand,
  readConfig,
  removeServer,
  servers,
  setEnabled,
  userConfigDir,
  userConfigFile,
  validateName,
  validateRemote,
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

test("parseCommand splits quotes and rejects an unclosed one", () => {
  expect(parseCommand(`npx -y srv "a b" 'c d' ""`)).toEqual(["npx", "-y", "srv", "a b", "c d", ""])
  expect(() => parseCommand(`x "oops`)).toThrow()
  expect(commandLine(["npx", "a b"])).toBe(`npx "a b"`)
})

test("validation", () => {
  expect(validateName("ok-1", {})).toBeUndefined()
  expect(validateName("bad name", {})).toBeDefined()
  expect(validateName("a", { mcp: { a: { type: "local", command: ["x"] } } })).toContain("already exists")
  expect(validateRemote("https://x.example/mcp")).toBeUndefined()
  expect(validateRemote("ftp://x")).toBeDefined()
  expect(validateRemote("nope")).toBeDefined()
})

test("add, disable, enable, remove round trip keeps other keys and uses private mode", () => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ model: "keep", mcp: { old: { type: "local", command: ["o"] } } }))
  addServer(file, "new", { type: "local", command: ["npx", "srv"], enabled: false })
  expect(servers(readConfig(file)).new).toEqual({ type: "local", command: ["npx", "srv"], enabled: false })
  expect(setEnabled(file, "new", true)).toBe(true)
  expect((servers(readConfig(file)).new as { enabled?: boolean }).enabled).toBe(true)
  expect(setEnabled(file, "missing", true)).toBe(false)
  expect(readConfig(file).model).toBe("keep")
  expect(fs.statSync(file).mode & 0o777).toBe(0o600)
  expect(removeServer(file, "new")).toBe(true)
  expect(Object.keys(servers(readConfig(file)))).toEqual(["old"])
  expect(fs.readdirSync(path.dirname(file)).filter((f) => f.endsWith(".tmp"))).toEqual([])
})

test("adding a duplicate name fails and invalid JSON is never overwritten", () => {
  addServer(file, "a", { type: "remote", url: "https://x.example" })
  expect(() => addServer(file, "a", { type: "remote", url: "https://y.example" })).toThrow("already exists")
  fs.writeFileSync(file, "{broken")
  expect(() => addServer(file, "b", { type: "remote", url: "https://x.example" })).toThrow("not valid JSON")
  expect(fs.readFileSync(file, "utf8")).toBe("{broken")
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

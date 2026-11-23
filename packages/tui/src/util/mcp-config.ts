/**
 * Edits the MCP servers in the user's localcode config file (the same file `localcode mcp add --global`
 * writes). The runtime watches its config files, so a saved change takes effect without a restart.
 * Pure functions plus small atomic file helpers so the dialog logic can be tested against a temp dir.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export type McpSpec =
  | { type: "local"; command: string[]; environment?: Record<string, string>; enabled?: boolean }
  | { type: "remote"; url: string; headers?: Record<string, string>; enabled?: boolean }

export type Config = Record<string, unknown> & { mcp?: Record<string, unknown> }

export function userConfigDir(env: Record<string, string | undefined> = process.env, home = os.homedir()) {
  return path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), "localcode-agent")
}

export function userConfigFile(dir = userConfigDir()) {
  for (const name of ["localcode.json", "localcode.jsonc"]) {
    const file = path.join(dir, name)
    if (fs.existsSync(file)) return file
  }
  return path.join(dir, "localcode.json")
}

/** Drops // and block comments outside strings so a .jsonc file can be read. */
export function stripComments(text: string) {
  let out = ""
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      out += c
      if (c === "\\" && i + 1 < text.length) out += text[++i]
      else if (c === '"') inString = false
    } else if (c === '"') {
      inString = true
      out += c
    } else if (text.startsWith("//", i)) {
      while (i < text.length && text[i] !== "\n") i++
      i--
    } else if (text.startsWith("/*", i)) {
      const end = text.indexOf("*/", i + 2)
      i = end < 0 ? text.length : end + 1
    } else out += c
  }
  return out
}

export function readConfig(file: string): Config {
  if (!fs.existsSync(file)) return {}
  const text = fs.readFileSync(file, "utf8")
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    try {
      data = JSON.parse(stripComments(text))
    } catch {
      throw new Error(`${path.basename(file)} is not valid JSON; fix it first, nothing was changed`)
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error(`${path.basename(file)} is not a JSON object; nothing was changed`)
  return data as Config
}

export function writeConfig(file: string, config: Config) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`)
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function servers(config: Config): Record<string, McpSpec> {
  const mcp = config.mcp
  if (!mcp || typeof mcp !== "object") return {}
  const out: Record<string, McpSpec> = {}
  const nested = (mcp as { servers?: unknown }).servers
  const merge = (record: Record<string, unknown>) => {
    for (const [name, value] of Object.entries(record)) {
      if (name === "servers" || name === "timeout") continue
      if (value && typeof value === "object" && "type" in value) out[name] = value as McpSpec
    }
  }
  merge(mcp as Record<string, unknown>)
  if (nested && typeof nested === "object") merge(nested as Record<string, unknown>)
  return out
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

export function validateName(name: string, config: Config) {
  if (!NAME.test(name)) return "Use letters, numbers, - and _ (up to 64 characters)"
  if (name in servers(config)) return `A server named ${name} already exists`
  return undefined
}

/** Splits a command line into arguments, honouring single and double quotes. */
export function parseCommand(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let quote: string | undefined
  let started = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) {
      if (c === quote) quote = undefined
      else if (c === "\\" && quote === '"' && i + 1 < line.length) cur += line[++i]
      else cur += c
    } else if (c === '"' || c === "'") {
      quote = c
      started = true
    } else if (/\s/.test(c)) {
      if (started || cur) out.push(cur)
      cur = ""
      started = false
    } else {
      cur += c
      started = true
    }
  }
  if (quote) throw new Error("Unclosed quote in the command")
  if (started || cur) out.push(cur)
  return out
}

const quoteArg = (a: string) => (/^[\w@%+=:,./*-]+$/.test(a) ? a : JSON.stringify(a))

/** The command exactly as it will run, for showing before anything is saved. */
export function commandLine(command: string[]) {
  return command.map(quoteArg).join(" ")
}

export function validateRemote(url: string) {
  try {
    const u = new URL(url)
    if (u.protocol !== "http:" && u.protocol !== "https:") return "The URL must start with http:// or https://"
  } catch {
    return "That is not a valid URL"
  }
  return undefined
}

export function addServer(file: string, name: string, spec: McpSpec) {
  const config = readConfig(file)
  const bad = validateName(name, config)
  if (bad) throw new Error(bad)
  const mcp = config.mcp && typeof config.mcp === "object" ? config.mcp : {}
  mcp[name] = spec
  config.mcp = mcp
  writeConfig(file, config)
}

/** Where a server lives in the file: flat `mcp.<name>` or legacy `mcp.servers.<name>`. */
function holder(config: Config, name: string): Record<string, unknown> | undefined {
  const mcp = config.mcp as Record<string, unknown> | undefined
  if (!mcp) return undefined
  if (mcp[name] && typeof mcp[name] === "object") return mcp
  const nested = mcp.servers as Record<string, unknown> | undefined
  if (nested && typeof nested === "object" && nested[name] && typeof nested[name] === "object") return nested
  return undefined
}

/** Persists enabled; returns false when the server is not in this file (it comes from a project config). */
export function setEnabled(file: string, name: string, enabled: boolean) {
  const config = readConfig(file)
  const at = holder(config, name)
  if (!at) return false
  at[name] = { ...(at[name] as object), enabled }
  writeConfig(file, config)
  return true
}

export function removeServer(file: string, name: string) {
  const config = readConfig(file)
  const at = holder(config, name)
  if (!at) return false
  delete at[name]
  writeConfig(file, config)
  return true
}

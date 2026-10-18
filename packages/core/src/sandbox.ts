/**
 * LocalCode: OS-level sandbox for model-run shell commands on macOS.
 *
 * Every shell tool command (and everything it spawns) runs under
 * `/usr/bin/sandbox-exec` with a Seatbelt profile generated here. The owner
 * rule is "don't block anything" dev work needs, so the profile is
 * `(allow default)`: writes, network, process exec, ~/.ssh, ~/.aws and
 * ~/.gnupg all work as before (writes outside the project stay governed by
 * the external_directory prompts). The one hard block is reading the stores
 * no dev tool reads directly: macOS keychain files and browser cookie,
 * profile and login-data stores. A command that hits it gets a one-line
 * explanation in its output.
 *
 * Edits of the agent's own config are not blocked either; `selfConfig` lets
 * the runtime show a notice after the fact.
 */
export * as Sandbox from "./sandbox.js"

import { execFile } from "child_process"
import { existsSync, realpathSync } from "fs"
import path from "path"
import { Effect } from "effect"

export const EXECUTABLE = "/usr/bin/sandbox-exec"

/**
 * Outbound network policy for sandboxed commands. "allow" keeps today's
 * behaviour (commands the user asks for may use the network); "deny" blocks
 * everything but loopback and unix sockets. One switch, flipped here only.
 */
export const NETWORK: "allow" | "deny" = "allow"

/** Directory names that hold the agent's own config, agents, skills, plugins, hooks or MCP settings. */
export const CONFIG_DIRECTORIES = [".localcode-agent", ".opencode", ".claude", ".agents"] as const
/** Config file names the runtime loads from the project and its ancestors. */
export const CONFIG_FILES = ["localcode.json", "localcode.jsonc", "opencode.json", "opencode.jsonc"] as const

/** Stores under home that commands may never read: keychain files and browser cookie, profile and login data. */
export const SECRET_DIRECTORIES = [
  "Library/Keychains",
  "Library/Cookies",
  "Library/HTTPStorages",
  "Library/Safari",
  "Library/Containers/com.apple.Safari",
  "Library/Application Support/Google/Chrome",
  "Library/Application Support/Chromium",
  "Library/Application Support/BraveSoftware",
  "Library/Application Support/Microsoft Edge",
  "Library/Application Support/Arc",
  "Library/Application Support/Firefox",
  "Library/Mozilla",
] as const

export interface ProfileInput {
  /** The user's home directory. */
  readonly home: string
  /** Outbound network policy; defaults to NETWORK. */
  readonly network?: "allow" | "deny"
}

/** Resolve symlinks on the deepest existing ancestor; keep the rest of the path as written. */
export const real = (input: string) => {
  const rest: string[] = []
  let current = path.resolve(input)
  for (;;) {
    try {
      return path.join(realpathSync.native(current), ...rest.reverse())
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return path.resolve(input)
      rest.push(path.basename(current))
      current = parent
    }
  }
}

const unique = (items: readonly string[]) => [...new Set(items.filter((item) => item.length > 0))]

const str = (value: string) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
const subpath = (value: string) => `(subpath ${str(value)})`

export const planDirectory = (home: string) => path.join(home, ".localcode-agent", "plan")

/** The browser and keychain stores, as real paths. */
export const secretPaths = (home: string) => SECRET_DIRECTORIES.map((name) => path.join(real(home), name))

/** The Seatbelt profile for one shell command. Pure: the same input gives the same text. */
export function profile(input: ProfileInput): string {
  const lines = [
    "(version 1)",
    "(allow default)",
    "",
    "; Keychain files and browser cookie, profile and login-data stores: no reads.",
    `(deny file-read-data file-read-xattr ${secretPaths(input.home).map(subpath).join(" ")})`,
  ]
  if ((input.network ?? NETWORK) === "deny")
    lines.push(
      "",
      "; Network: loopback and unix sockets only.",
      "(deny network-outbound)",
      '(allow network-outbound (remote unix-socket) (remote ip "localhost:*"))',
    )
  return lines.join("\n") + "\n"
}

/** Whether `absolute` is the agent's own config or a guard (an edit of it gets a visible notice). */
export function selfConfig(absolute: string, input: { readonly home: string; readonly guarded: readonly string[] }) {
  const target = real(absolute)
  const home = real(input.home)
  if (FSContains(real(planDirectory(home)), target) || FSContains(planDirectory(input.home), absolute)) return false
  for (const candidate of unique([target, path.resolve(absolute)])) {
    const parts = candidate.split(path.sep)
    if (parts.some((part) => (CONFIG_DIRECTORIES as readonly string[]).includes(part))) return true
    if ((CONFIG_FILES as readonly string[]).includes(path.basename(candidate))) return true
    if (input.guarded.some((root) => FSContains(real(root), candidate) || FSContains(root, candidate))) return true
  }
  return false
}

function FSContains(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

/** Runtime config and guard paths outside the project: global config dirs, the runtime cache (binaries, plugins), explicit config files. */
export function guardedPaths(input: {
  readonly home: string
  readonly config: string
  readonly cache: string
  readonly env?: NodeJS.ProcessEnv
}) {
  const env = input.env ?? process.env
  return unique([
    input.config,
    path.join(input.home, ".config", "localcode-agent"),
    input.cache,
    "/Library/Application Support/opencode",
    ...[env.OPENCODE_CONFIG, env.LOCALCODE_CONFIG, env.OPENCODE_CONFIG_DIR].flatMap((item) => (item ? [item] : [])),
  ])
}

let warned = false
const probes = new Map<string, Promise<string | undefined>>()

/** Run the profile once against /usr/bin/true; resolves to an error message when it cannot apply. */
const probe = (text: string) => {
  const cached = probes.get(text)
  if (cached) return cached
  const result = new Promise<string | undefined>((resolve) => {
    execFile(EXECUTABLE, ["-p", text, "/usr/bin/true"], { timeout: 10_000 }, (error, _stdout, stderr) =>
      resolve(error ? (String(stderr).trim() || error.message) : undefined),
    )
  })
  if (probes.size > 64) probes.clear()
  probes.set(text, result)
  return result
}

/** Platform check, split out so tests can exercise the fallback. */
export const supported = (platform: NodeJS.Platform = process.platform) => platform === "darwin" && existsSync(EXECUTABLE)

/**
 * The argv prefix that runs a command under `text`, or undefined when the
 * sandbox cannot apply here (not macOS, sandbox-exec missing, already inside a
 * sandbox, profile rejected). The fallback runs the command as before and is
 * logged once per process, never silently failing the command.
 */
export const wrap = Effect.fn("Sandbox.wrap")(function* (text: string, platform: NodeJS.Platform = process.platform) {
  if (!supported(platform)) return undefined
  const error = yield* Effect.promise(() => probe(text))
  if (error === undefined) return [EXECUTABLE, "-p", text]
  if (!warned) {
    warned = true
    yield* Effect.logWarning("shell sandbox unavailable; commands run without it", { error })
  }
  return undefined
})

/** One line appended to a sandboxed command's output when the sandbox blocked it. */
export const BLOCKED_NOTICE =
  "localcode sandbox: shell commands cannot read macOS keychain files or browser cookie, profile and login-data stores."

/** The notice for a sandboxed command's output, when that output shows a denied read of a blocked store. */
export const explain = (output: string, home: string) =>
  /Operation not permitted/.test(output) &&
  [...SECRET_DIRECTORIES.map((name) => path.join(home, name)), ...secretPaths(home)].some((dir) => output.includes(dir))
    ? BLOCKED_NOTICE
    : undefined

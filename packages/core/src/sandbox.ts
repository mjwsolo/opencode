/**
 * LocalCode: OS-level sandbox for model-run shell commands on macOS.
 *
 * Every shell tool command (and everything it spawns) runs under
 * `/usr/bin/sandbox-exec` with a Seatbelt profile generated here. The profile
 * starts from `(allow default)` so toolchains, network and process exec keep
 * working, then:
 *   - denies reading secrets (SSH keys, cloud credentials, GnuPG, keychains,
 *     browser cookie and profile stores),
 *   - limits writes to the project, temp dirs, the runtime's tool output,
 *     common toolchain caches and directories the user approved for the
 *     command. A blocked write gets a one-line explanation in the output.
 *
 * Seatbelt evaluates rules last-match-wins, so the order of sections matters.
 * The command-string scanner stays as the readable ask layer; this enforces
 * what the scanner can only guess at (scripts, `python -c`, make targets).
 *
 * Edits of the agent's own config are not blocked; `selfConfig` lets the
 * runtime show a notice after the fact.
 */
export * as Sandbox from "./sandbox.js"

import { execFile } from "child_process"
import { existsSync, readFileSync, realpathSync } from "fs"
import os from "os"
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

/** Paths under home whose contents commands may never read. */
const SECRET_DIRECTORIES = [
  ".ssh",
  ".aws",
  ".gnupg",
  "Library/Keychains",
  "Library/Cookies",
  "Library/Safari",
  "Library/Application Support/Google/Chrome",
  "Library/Application Support/Chromium",
  "Library/Application Support/BraveSoftware",
  "Library/Application Support/Microsoft Edge",
  "Library/Application Support/Arc",
  "Library/Application Support/Vivaldi",
  "Library/Application Support/com.operasoftware.Opera",
  "Library/Application Support/Firefox",
  "Library/Mozilla",
]
/** Non-secret files ssh needs to talk to a host (keys themselves stay unreadable). */
const SSH_READABLE = ["known_hosts", "known_hosts2", "config"]

/** Toolchain caches under home that builds, installs and tests write to. */
const CACHE_DIRECTORIES = [
  ".cache",
  ".npm",
  ".bun/install",
  ".yarn",
  ".pnpm-store",
  ".node-gyp",
  ".cargo/registry",
  ".cargo/git",
  ".gradle",
  ".m2",
  "go/pkg/mod",
  ".local/share/uv",
  "Library/Caches",
  "Library/pnpm",
  "Library/Developer/Xcode/DerivedData",
  "Library/org.swift.swiftpm",
]

/** Temp roots on macOS, as real paths (/tmp and /var are symlinks into /private). */
const TEMP_DIRECTORIES = ["/private/tmp", "/private/var/tmp", "/private/var/folders"]

export interface ProfileInput {
  /** The user's home directory. */
  readonly home: string
  /** Project roots (the session directory and its worktree root). */
  readonly project: readonly string[]
  /** Temp directories. Defaults to the macOS temp roots plus os.tmpdir(). */
  readonly tmp?: readonly string[]
  /** Other writable directories (runtime tool output, linked git dirs). */
  readonly writable?: readonly string[]
  /** Directories the user approved for this command (external_directory). */
  readonly approved?: readonly string[]
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
/** Seatbelt matches real paths (/tmp is /private/tmp), so every rule uses them. */
const spellings = (items: readonly string[]) => unique(items.map(real))

const str = (value: string) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
const subpath = (value: string) => `(subpath ${str(value)})`
const literal = (value: string) => `(literal ${str(value)})`

/** Regex-escape a path with bracket classes; undefined when it holds characters we will not escape. */
const regexPath = (value: string) => {
  if (/[\\"^\]\[\n]/.test(value)) return undefined
  return value.replace(/[.*+?(){}|$]/g, (char) => `[${char}]`)
}

export const planDirectory = (home: string) => path.join(home, ".localcode-agent", "plan")

/** The Seatbelt profile for one shell command. Pure: the same input gives the same text. */
export function profile(input: ProfileInput): string {
  const home = real(input.home)
  const project = spellings(input.project.filter((item) => item !== path.parse(item).root))
  const approved = spellings(input.approved ?? [])
  const tmp = spellings(input.tmp ?? [...TEMP_DIRECTORIES, os.tmpdir()])
  const writable = unique([
    ...project,
    ...tmp,
    ...spellings(input.writable ?? []),
    ...CACHE_DIRECTORIES.map((name) => path.join(home, name)),
    real(planDirectory(input.home)),
    ...approved,
  ])
  const ssh = path.join(home, ".ssh")
  const lines = [
    "(version 1)",
    "(allow default)",
    "",
    "; Secrets: no reads of keys, credentials, keychains or browser profiles.",
    `(deny file-read-data file-read-xattr ${SECRET_DIRECTORIES.map((name) => subpath(path.join(home, name))).join(" ")})`,
    `(allow file-read-data file-read-xattr ${SSH_READABLE.map((name) => literal(path.join(ssh, name))).join(" ")} (regex #"^${regexPath(ssh) ?? "/nonexistent"}/[^/]+[.]pub$"))`,
    "",
    "; Writes: only the project, temp, toolchain caches and approved directories.",
    "(deny file-write*)",
    `(allow file-write* (subpath "/dev") ${writable.map(subpath).join(" ")})`,
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

/** The git directories a linked worktree writes to (its own gitdir and the shared common dir). */
export function gitDirectories(root: string): string[] {
  const dotgit = path.join(root, ".git")
  try {
    const text = readFileSync(dotgit, "utf8")
    const match = /^gitdir:\s*(.+)$/m.exec(text)
    if (!match) return []
    const gitdir = path.resolve(root, match[1].trim())
    const common = (() => {
      try {
        return path.resolve(gitdir, readFileSync(path.join(gitdir, "commondir"), "utf8").trim())
      } catch {
        return undefined
      }
    })()
    return unique([gitdir, ...(common ? [common] : [])])
  } catch {
    return []
  }
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

/** One line appended to a sandboxed command's output when the sandbox likely blocked it. */
export const BLOCKED_NOTICE =
  "localcode sandbox: shell commands can write only inside the project, temp folders, toolchain caches and folders you approved, and cannot read secrets (~/.ssh keys, ~/.aws, ~/.gnupg, keychains). Name another folder in the command to be asked for access to it."

/** The notice for a sandboxed command's output, when that output shows a sandbox denial. */
export const explain = (output: string) => (/Operation not permitted/.test(output) ? BLOCKED_NOTICE : undefined)

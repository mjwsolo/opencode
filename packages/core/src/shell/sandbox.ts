export * as ShellSandbox from "./sandbox.js"

import { readFileSync, realpathSync } from "fs"
import { spawn } from "child_process"
import os from "os"
import path from "path"
import { parse } from "jsonc-parser"

/**
 * macOS seatbelt for agent shell commands. The command still runs through the same shell; only the program
 * that is spawned changes: `/usr/bin/sandbox-exec -p <profile> -D KEY=value -- shell args...`.
 *
 * The profile is a fixed string. Paths reach it as `-D` parameters, so a path with spaces, quotes or
 * parentheses can never change what the profile means.
 */

export const SANDBOX_EXEC = "/usr/bin/sandbox-exec"

export type Options = {
  /** The project directory the command may read and write. */
  readonly project: string
  readonly home: string
  readonly tmp: string
  /** false: network is limited to this machine (localhost and unix sockets). */
  readonly network: boolean
}

export type Settings = {
  /** "Sandbox shell commands" in /permissions. */
  readonly enabled: boolean
  /** "Allow network in sandbox" in /permissions. */
  readonly network: boolean
}

export const DEFAULT_SETTINGS: Settings = { enabled: true, network: true }

/** The action of the permission request that lets one command run outside the sandbox. */
export const UNSANDBOXED_ACTION = "shell.unsandboxed"

// Under HOME: tool caches and installs a build or test run writes to.
const HOME_WRITE = [
  ".npm",
  ".cache",
  ".cargo",
  ".rustup",
  "go",
  ".local/share/uv",
  ".local/share/pnpm",
  ".local/state",
  ".bun",
  ".yarn",
  ".gradle",
  ".m2",
  "Library/Caches",
  "Library/pnpm",
] as const

// Under HOME: read only. Tool installs, git identity, and the shell's own startup files.
const HOME_READ = [
  ".local/bin",
  ".gitconfig",
  ".gitignore_global",
  ".config/git",
  ".config/uv",
  ".config/pip",
  ".config/pnpm",
  ".nvm",
  ".volta",
  ".pyenv",
  ".asdf",
  ".sdkman",
  ".deno",
  ".zshenv",
  ".zprofile",
  ".zshrc",
  ".zlogin",
  ".bash_profile",
  ".bashrc",
  ".profile",
  ".terminfo",
  "Library/Preferences",
  "Library/Python",
] as const

// Under HOME: credentials and keys. Never readable or writable inside the sandbox.
const HOME_SECRET = [
  ".ssh",
  ".aws",
  ".gnupg",
  ".kube",
  ".docker",
  ".azure",
  ".config/gcloud",
  ".config/gh",
  ".netrc",
  ".git-credentials",
  "Library/Keychains",
] as const

const under = (paths: readonly string[]) =>
  paths.map((item) => `(subpath (string-append (param "HOME") ${JSON.stringify(`/${item}`)}))`).join("\n  ")

/** The seatbelt profile. It names paths only through `(param ...)`, so it does not depend on the options. */
export function profile(network: boolean): string {
  return [
    "(version 1)",
    "(deny default)",
    '(import "system.sb")',
    "(allow process-exec)",
    "(allow process-fork)",
    "(allow signal (target same-sandbox))",
    "(allow sysctl-read)",
    "(allow ipc-posix-shm)",
    "(allow pseudo-tty)",
    // Paths up to a file may be inspected (getcwd, realpath); contents and listings are a separate rule.
    "(allow file-read-metadata)",
    "(allow file-read*",
    '  (literal "/")',
    '  (subpath "/usr") (subpath "/bin") (subpath "/sbin") (subpath "/System") (subpath "/Library")',
    '  (subpath "/opt") (subpath "/Applications") (subpath "/dev")',
    '  (subpath "/private/etc") (subpath "/private/var/db") (subpath "/private/var/select")',
    `  ${under(HOME_READ)})`,
    "(allow file-read* file-write*",
    '  (subpath (param "PROJECT")) (subpath (param "TMPDIR"))',
    '  (subpath "/private/tmp") (subpath "/private/var/folders")',
    '  (literal "/dev/null") (literal "/dev/tty") (literal "/dev/zero") (regex #"^/dev/tty[a-z0-9]*$") (regex #"^/dev/fd/")',
    `  ${under(HOME_WRITE)})`,
    // Secrets last: a later rule wins over the allows above.
    "(deny file-read* file-write*",
    `  ${under(HOME_SECRET)})`,
    "(allow mach-lookup",
    '  (global-name "com.apple.system.opendirectoryd.libinfo")',
    '  (global-name "com.apple.system.opendirectoryd.membership")',
    '  (global-name "com.apple.SecurityServer")',
    '  (global-name "com.apple.trustd")',
    '  (global-name "com.apple.trustd.agent")',
    '  (global-name "com.apple.coreservices.launchservicesd")',
    '  (global-name "com.apple.FSEvents")',
    '  (global-name "com.apple.fseventsd"))',
    ...(network
      ? ["(allow network*)"]
      : [
          '(allow network-outbound (remote ip "localhost:*"))',
          '(allow network-bind network-inbound (local ip "localhost:*"))',
          "(allow network* (remote unix-socket) (local unix-socket))",
        ]),
    "",
  ].join("\n")
}

const real = (item: string) => {
  try {
    return realpathSync(item)
  } catch {
    return path.resolve(item)
  }
}

export type Spawn = { readonly program: string; readonly args: readonly string[]; readonly sandboxed: boolean }

/**
 * The program and arguments to spawn for a command. Unchanged anywhere but macOS, and when `options` is
 * undefined (sandbox off, a remote workspace, or a command the user allowed to run outside it).
 */
export function wrap(
  program: string,
  args: readonly string[],
  options: Options | undefined,
  platform: NodeJS.Platform = process.platform,
): Spawn {
  if (platform !== "darwin" || options === undefined) return { program, args, sandboxed: false }
  return {
    program: SANDBOX_EXEC,
    args: [
      "-p",
      profile(options.network),
      "-D",
      `PROJECT=${real(options.project)}`,
      "-D",
      `HOME=${real(options.home)}`,
      "-D",
      `TMPDIR=${real(options.tmp)}`,
      "--",
      program,
      ...args,
    ],
    sandboxed: true,
  }
}

/** The sandbox options for a command in `project`, or undefined when it should not be sandboxed. */
export function options(
  settings: Settings,
  project: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Options | undefined {
  if (!settings.enabled) return undefined
  return { project, home: os.homedir(), tmp: env.TMPDIR || os.tmpdir(), network: settings.network }
}

/** The sandbox switches the user set in /permissions, kept in the same config file as the other switches. */
export function readSettings(configDir: string): Settings {
  let text: string
  try {
    text = readFileSync(path.join(configDir, "cli.json"), "utf8")
  } catch {
    return DEFAULT_SETTINGS
  }
  const session = (parse(text, [], { allowTrailingComma: true }) as { session?: Record<string, unknown> } | undefined)
    ?.session
  return {
    enabled: session?.sandbox === false ? false : true,
    network: session?.sandbox_network === false ? false : true,
  }
}

const DENIED_TEXT = /Operation not permitted|Permission denied/i

/** Whether a finished command looks like the sandbox stopped it, worth asking the system log about. */
export function suspicious(exit: number | null | undefined, output: string): boolean {
  return exit !== undefined && exit !== null && exit !== 0 && DENIED_TEXT.test(output)
}

export type Denial = { readonly pid: number; readonly process: string; readonly operation: string; readonly target: string }

// `2026-01-01 10:00:00.000 Df kernel[0:1] (Sandbox) Sandbox: cat(1234) deny(1) file-read-data /Users/x/.ssh/id`
const LINE = /Sandbox: (.+?)\((\d+)\) deny\(\d+\) (\S+)(?: (.*))?$/

/** Denied operations in `log show` output, for the processes in `pids` (all of them when it is undefined). */
export function parseDenials(log: string, pids?: ReadonlySet<number>): Denial[] {
  const seen = new Set<string>()
  const result: Denial[] = []
  for (const line of log.split("\n")) {
    const match = LINE.exec(line.trim())
    if (!match) continue
    const pid = Number(match[2])
    if (pids && !pids.has(pid)) continue
    const denial = { pid, process: match[1], operation: match[3], target: (match[4] ?? "").trim() }
    const key = `${denial.operation} ${denial.target}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(denial)
  }
  return result
}

/** The process IDs of `root` and everything still running below it. */
export function family(root: number, table: string): Set<number> {
  const children = new Map<number, number[]>()
  for (const line of table.split("\n")) {
    const [pid, parent] = line.trim().split(/\s+/).map(Number)
    if (!Number.isInteger(pid) || !Number.isInteger(parent)) continue
    children.set(parent, [...(children.get(parent) ?? []), pid])
  }
  const found = new Set<number>([root])
  const queue = [root]
  while (queue.length > 0) for (const child of children.get(queue.pop()!) ?? []) if (!found.has(child)) (found.add(child), queue.push(child))
  return found
}

const run = (program: string, args: string[], timeout: number) =>
  new Promise<string>((resolve) => {
    let out = ""
    const child = spawn(program, args, { stdio: ["ignore", "pipe", "ignore"] })
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout)
    child.stdout.on("data", (chunk) => (out += chunk))
    child.on("error", () => (clearTimeout(timer), resolve("")))
    child.on("close", () => (clearTimeout(timer), resolve(out)))
  })

/** What the sandbox denied to the command with process ID `pid` during the last `seconds` seconds, from the system log. */
export async function denials(pid: number | undefined, seconds: number): Promise<Denial[]> {
  const log = await run(
    "/usr/bin/log",
    ["show", "--style", "compact", "--last", `${seconds}s`, "--predicate", 'sender=="Sandbox"'],
    15_000,
  )
  if (pid === undefined) return parseDenials(log)
  // Children that already exited are gone from the process table; a denial of the command's own name still counts.
  const pids = family(pid, await run("/bin/ps", ["-A", "-o", "pid=,ppid="], 3_000))
  const all = parseDenials(log)
  const own = new Set(all.filter((item) => pids.has(item.pid)).map((item) => item.process))
  return all.filter((item) => pids.has(item.pid) || own.has(item.process))
}

/** The model-facing text for a command the sandbox stopped. */
export function describe(found: readonly Denial[]): string {
  if (found.length === 0) return "The sandbox may have blocked this command (macOS did not report what)."
  return [
    "The sandbox blocked these operations:",
    ...found.slice(0, 20).map((item) => `- ${item.process}: ${item.operation}${item.target ? ` ${item.target}` : ""}`),
    ...(found.length > 20 ? [`- and ${found.length - 20} more`] : []),
  ].join("\n")
}

/**
 * The small process, filesystem and package helpers the language-server runtime (ported from
 * opencode v1's packages/opencode/src/lsp) was written against.
 */
import { spawn as nodeSpawn, type ChildProcess } from "child_process"
import { createWriteStream, existsSync, realpathSync } from "fs"
import { chmod, mkdir, readFile, writeFile } from "fs/promises"
import { createRequire } from "node:module"
import { buffer } from "node:stream/consumers"
import path from "path"
import { Readable, type Stream } from "stream"
import { pipeline } from "stream/promises"
import whichPkg from "which"
import { Global } from "@opencode/util/global"

/** What the language-server runtime needs to know about the location it serves. */
export interface InstanceContext {
  readonly directory: string
  /** The project root (the repository top level, or the directory itself). */
  readonly worktree: string
}

export function containsPath(file: string, ctx: InstanceContext) {
  const within = (root: string) => {
    const relative = path.relative(root, file)
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
  }
  return within(ctx.directory) || (ctx.worktree !== path.parse(ctx.worktree).root && within(ctx.worktree))
}

export interface Flags {
  /** Language servers that are not installed stay off; only an explicit /lsp install downloads one. */
  readonly disableLspDownload: boolean
  readonly experimentalLspTy: boolean
  readonly experimentalLspTool: boolean
}

const truthy = (value?: string) => value === "1" || value?.toLowerCase() === "true"

export function flags(env: NodeJS.ProcessEnv = process.env): Flags {
  return {
    disableLspDownload: truthy(env.OPENCODE_DISABLE_LSP_DOWNLOAD),
    experimentalLspTy: truthy(env.OPENCODE_EXPERIMENTAL_LSP_TY),
    experimentalLspTool: truthy(env.OPENCODE_EXPERIMENTAL_LSP_TOOL) || truthy(env.OPENCODE_EXPERIMENTAL),
  }
}

export namespace Process {
  export type Stdio = "inherit" | "pipe" | "ignore" | number | Stream
  export interface Options {
    cwd?: string
    env?: NodeJS.ProcessEnv | null
    stdin?: Stdio
    stdout?: Stdio
    stderr?: Stdio
    shell?: boolean | string
    abort?: AbortSignal
    kill?: NodeJS.Signals | number
    timeout?: number
  }
  export interface RunOptions extends Omit<Options, "stdout" | "stderr"> {
    nothrow?: boolean
  }
  export interface Result {
    code: number
    stdout: Buffer
    stderr: Buffer
  }
  export type Child = ChildProcess & { exited: Promise<number> }

  export function spawn(cmd: string[], opts: Options = {}): Child {
    if (cmd.length === 0) throw new Error("Command is required")
    opts.abort?.throwIfAborted()
    const proc = nodeSpawn(cmd[0], cmd.slice(1), {
      cwd: opts.cwd,
      shell: opts.shell,
      env: opts.env === null ? {} : opts.env ? { ...process.env, ...opts.env } : undefined,
      stdio: [opts.stdin ?? "ignore", opts.stdout ?? "ignore", opts.stderr ?? "ignore"] as never,
      windowsHide: process.platform === "win32",
    })
    let closed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const abort = () => {
      if (closed || proc.exitCode !== null || proc.signalCode !== null) return
      closed = true
      proc.kill(opts.kill ?? "SIGTERM")
      const ms = opts.timeout ?? 5_000
      if (ms > 0) timer = setTimeout(() => proc.kill("SIGKILL"), ms)
    }
    const exited = new Promise<number>((resolve, reject) => {
      const done = () => {
        opts.abort?.removeEventListener("abort", abort)
        if (timer) clearTimeout(timer)
      }
      proc.once("exit", (code, signal) => {
        done()
        resolve(code ?? (signal ? 1 : 0))
      })
      proc.once("error", (error) => {
        done()
        reject(error)
      })
    })
    void exited.catch(() => undefined)
    if (opts.abort) {
      opts.abort.addEventListener("abort", abort, { once: true })
      if (opts.abort.aborted) abort()
    }
    const child = proc as Child
    child.exited = exited
    return child
  }

  export async function run(cmd: string[], opts: RunOptions = {}): Promise<Result> {
    const out = await Promise.resolve()
      .then(() => {
        const proc = spawn(cmd, { ...opts, stdout: "pipe", stderr: "pipe" })
        if (!proc.stdout || !proc.stderr) throw new Error("Process output not available")
        return Promise.all([proc.exited, buffer(proc.stdout), buffer(proc.stderr)])
      })
      .then(([code, stdout, stderr]) => ({ code, stdout, stderr }))
      .catch((error: unknown) => {
        if (!opts.nothrow) throw error
        return { code: 1, stdout: Buffer.alloc(0), stderr: Buffer.from(String(error)) }
      })
    if (out.code === 0 || opts.nothrow) return out
    throw new Error(`Command failed with code ${out.code}: ${cmd.join(" ")}\n${out.stderr.toString().trim()}`)
  }

  export async function text(cmd: string[], opts: RunOptions = {}) {
    const out = await run(cmd, opts)
    return { ...out, text: out.stdout.toString() }
  }

  export async function stop(proc: ChildProcess) {
    if (proc.exitCode !== null || proc.signalCode !== null) return
    if (process.platform !== "win32" || !proc.pid) {
      proc.kill()
      return
    }
    const out = await run(["taskkill", "/pid", String(proc.pid), "/T", "/F"], { nothrow: true })
    if (out.code !== 0) proc.kill()
  }
}

export namespace Filesystem {
  export async function exists(p: string) {
    return existsSync(p)
  }

  export async function readText(p: string) {
    return readFile(p, "utf-8")
  }

  export async function write(p: string, content: string | Buffer | Uint8Array, mode?: number) {
    await mkdir(path.dirname(p), { recursive: true })
    await writeFile(p, content, mode ? { mode } : undefined)
  }

  export async function writeStream(p: string, stream: ReadableStream<Uint8Array> | Readable, mode?: number) {
    await mkdir(path.dirname(p), { recursive: true })
    const source = stream instanceof Readable ? stream : Readable.fromWeb(stream as never)
    await pipeline(source, createWriteStream(p))
    if (mode) await chmod(p, mode)
  }

  /** On Windows, the canonical casing of a path; language servers may report other casing. */
  export function normalizePath(p: string) {
    if (process.platform !== "win32") return p
    const resolved = path.win32.normalize(path.win32.resolve(p))
    try {
      return realpathSync.native(resolved)
    } catch {
      return resolved
    }
  }

  export async function findUp(
    target: string | string[],
    start: string,
    stop?: string,
    options?: { rootFirst?: boolean },
  ): Promise<string[]> {
    const dirs = [start]
    let current = start
    while (stop !== current) {
      const parent = path.dirname(current)
      if (parent === current) break
      dirs.push(parent)
      current = parent
    }
    const targets = Array.isArray(target) ? target : [target]
    const result: string[] = []
    for (const dir of options?.rootFirst ? dirs.toReversed() : dirs) {
      for (const item of targets) {
        const search = path.join(dir, item)
        if (existsSync(search)) result.push(search)
      }
    }
    return result
  }

  export async function* up(options: { targets: string[]; start: string; stop?: string }) {
    let current = options.start
    while (true) {
      for (const target of options.targets) {
        const search = path.join(current, target)
        if (existsSync(search)) yield search
      }
      if (options.stop === current) break
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
  }
}

export namespace Archive {
  export async function extractZip(zipPath: string, destDir: string) {
    if (process.platform === "win32") {
      const command = `$global:ProgressPreference = 'SilentlyContinue'; Expand-Archive -Path '${path.resolve(zipPath)}' -DestinationPath '${path.resolve(destDir)}' -Force`
      await Process.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", command])
      return
    }
    await Process.run(["unzip", "-o", "-q", zipPath, "-d", destDir])
  }
}

export namespace Module {
  export function resolve(id: string, dir: string) {
    try {
      return createRequire(path.join(dir, "package.json")).resolve(id)
    } catch {
      return undefined
    }
  }
}

/** An executable on PATH, or one LocalCode installed into its own bin folder. */
export function which(cmd: string, env?: NodeJS.ProcessEnv) {
  const base = env?.PATH ?? env?.Path ?? process.env.PATH ?? process.env.Path ?? ""
  const full = base ? base + path.delimiter + Global.Path.bin : Global.Path.bin
  const result = whichPkg.sync(cmd, {
    nothrow: true,
    path: full,
    pathExt: env?.PATHEXT ?? env?.PathExt ?? process.env.PATHEXT ?? process.env.PathExt,
  })
  return typeof result === "string" ? result : null
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label?: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>
  return Promise.race([
    promise.finally(() => clearTimeout(timeout)),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(label ?? `Operation timed out after ${ms}ms`)), ms)
    }),
  ])
}

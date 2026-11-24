import { describe, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { spawnSync } from "child_process"
import { ShellSandbox } from "@opencode/core/shell/sandbox"

const options = { project: "/tmp/p", home: "/Users/someone", tmp: "/tmp", network: true }

describe("ShellSandbox.wrap", () => {
  test("is a no-op off macOS", () => {
    for (const platform of ["linux", "win32"] as const) {
      expect(ShellSandbox.wrap("/bin/zsh", ["-c", "ls"], options, platform)).toEqual({
        program: "/bin/zsh",
        args: ["-c", "ls"],
        sandboxed: false,
      })
    }
  })

  test("is a no-op without options", () => {
    expect(ShellSandbox.wrap("/bin/zsh", ["-c", "ls"], undefined, "darwin").sandboxed).toBe(false)
  })

  test("keeps the shell and its arguments after --", () => {
    const wrapped = ShellSandbox.wrap("/bin/zsh", ["-l", "-c", "echo 'a b' (x)"], options, "darwin")
    expect(wrapped.program).toBe("/usr/bin/sandbox-exec")
    expect(wrapped.sandboxed).toBe(true)
    const split = wrapped.args.indexOf("--")
    expect(wrapped.args.slice(split + 1)).toEqual(["/bin/zsh", "-l", "-c", "echo 'a b' (x)"])
  })

  test("passes paths as parameters, so quotes, spaces and parentheses cannot change the profile", () => {
    const project = '/tmp/my "odd" project (1)'
    const wrapped = ShellSandbox.wrap("/bin/sh", [], { ...options, project }, "darwin")
    expect(wrapped.args[1]).toBe(ShellSandbox.profile(true))
    expect(wrapped.args[1]).not.toContain("odd")
    expect(wrapped.args).toContain(`PROJECT=${path.resolve(project)}`)
  })

  test("resolves symlinks in the parameters", () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sbx-")))
    const link = `${dir}-link`
    fs.symlinkSync(dir, link)
    try {
      const wrapped = ShellSandbox.wrap("/bin/sh", [], { ...options, project: link }, "darwin")
      expect(wrapped.args).toContain(`PROJECT=${dir}`)
    } finally {
      fs.rmSync(link)
      fs.rmdirSync(dir)
    }
  })
})

describe("ShellSandbox.profile", () => {
  test("denies by default and fences secrets after the allows", () => {
    const text = ShellSandbox.profile(true)
    expect(text).toContain("(deny default)")
    const secrets = text.indexOf("(deny file-read* file-write*")
    expect(secrets).toBeGreaterThan(text.indexOf("(allow file-read* file-write*"))
    for (const secret of [".ssh", ".aws", ".gnupg", "Library/Keychains"]) expect(text.slice(secrets)).toContain(secret)
  })

  test("fences repository metadata and LocalCode settings after the project allow", () => {
    const text = ShellSandbox.profile(true)
    const allow = text.indexOf("(allow file-read* file-write*")
    const deny = text.indexOf("(deny file-write*")
    expect(deny).toBeGreaterThan(allow)
    const block = text.slice(deny, text.indexOf("(allow mach-lookup"))
    for (const item of [
      "/.git/hooks",
      "/.localcode-agent",
      "/localcode.json",
      "/.mcp.json",
      "/.config/localcode-agent",
      "/.zshrc",
      "/.bashrc",
      "/.profile",
      "/.zprofile",
    ])
      expect(block).toContain(item)
    expect(block).toContain("[.]sample$")
    // git config stays writable: init, branch, remote and fetch write it.
    expect(block).not.toContain(".git/config")
  })

  test("limits the network to this machine when network is off", () => {
    expect(ShellSandbox.profile(true)).toContain("(allow network*)")
    const off = ShellSandbox.profile(false)
    expect(off).not.toContain("(allow network*)")
    expect(off).toContain('(remote ip "localhost:*")')
  })

  test.skipIf(process.platform !== "darwin")("is accepted by sandbox-exec and fences a real command", () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sbx-")))
    try {
      const run = (script: string) => {
        const wrapped = ShellSandbox.wrap("/bin/sh", ["-c", script], { ...options, project: root, home: os.homedir(), tmp: os.tmpdir() }, "darwin")
        return spawnSync(wrapped.program, [...wrapped.args], { cwd: root, encoding: "utf8" })
      }
      expect(run("echo ok > inside && cat inside").stdout).toBe("ok\n")
      const outside = run(`echo no > ${JSON.stringify(path.join(os.homedir(), ".sbx-should-not-exist"))}`)
      expect(outside.status).not.toBe(0)
      expect(fs.existsSync(path.join(os.homedir(), ".sbx-should-not-exist"))).toBe(false)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("ShellSandbox settings", () => {
  const withConfig = (text: string | undefined, check: (dir: string) => void) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-cfg-"))
    try {
      if (text !== undefined) fs.writeFileSync(path.join(dir, "cli.json"), text)
      check(dir)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }

  test("default on, network on", () => withConfig(undefined, (dir) => expect(ShellSandbox.readSettings(dir)).toEqual({ enabled: true, network: true })))
  test("reads the switches", () =>
    withConfig('{ "session": { "sandbox": false, "sandbox_network": false }, }', (dir) =>
      expect(ShellSandbox.readSettings(dir)).toEqual({ enabled: false, network: false }),
    ))
  test("a broken file keeps the safe defaults", () =>
    withConfig("{ not json", (dir) => expect(ShellSandbox.readSettings(dir)).toEqual({ enabled: true, network: true })))
  test("options are undefined when the sandbox is off", () => {
    expect(ShellSandbox.options({ enabled: false, network: true }, "/p")).toBeUndefined()
    expect(ShellSandbox.options({ enabled: true, network: false }, "/p")?.network).toBe(false)
  })
})

describe("ShellSandbox denials", () => {
  const log = [
    "2026-01-01 10:00:00.000 Df kernel[0:1] (Sandbox) Sandbox: cat(4242) deny(1) file-read-data /Users/x/.ssh/id_rsa",
    "2026-01-01 10:00:00.100 Df kernel[0:1] (Sandbox) Sandbox: cat(4242) deny(1) file-read-data /Users/x/.ssh/id_rsa",
    "2026-01-01 10:00:00.200 Df kernel[0:1] (Sandbox) Sandbox: python3(4243) deny(1) file-write-create /Users/x/my file (1)",
    "2026-01-01 10:00:00.300 Df kernel[0:1] (Sandbox) Sandbox: Safari(999) deny(1) network-outbound 1.2.3.4:443",
    "unrelated line",
  ].join("\n")

  test("lists distinct denied operations and keeps paths with spaces", () => {
    const found = ShellSandbox.parseDenials(log)
    expect(found.map((item) => item.target)).toEqual([
      "/Users/x/.ssh/id_rsa",
      "/Users/x/my file (1)",
      "1.2.3.4:443",
    ])
  })

  test("filters to the command's process family", () => {
    const found = ShellSandbox.parseDenials(log, new Set([4242, 4243]))
    expect(found.map((item) => item.process)).toEqual(["cat", "python3"])
  })

  test("finds the descendants of a pid", () => {
    expect([...ShellSandbox.family(10, "10 1\n11 10\n12 11\n13 2\n")].sort()).toEqual([10, 11, 12])
  })

  test("only a failing command that says so is suspicious", () => {
    expect(ShellSandbox.suspicious(1, "cat: x: Operation not permitted")).toBe(true)
    expect(ShellSandbox.suspicious(1, "ls: nope: Permission denied")).toBe(true)
    expect(ShellSandbox.suspicious(0, "Permission denied")).toBe(false)
    expect(ShellSandbox.suspicious(2, "syntax error")).toBe(false)
    expect(ShellSandbox.suspicious(undefined, "Operation not permitted")).toBe(false)
  })

  test("describes what was blocked", () => {
    const text = ShellSandbox.describe(ShellSandbox.parseDenials(log, new Set([4242])))
    expect(text).toContain("The sandbox blocked these operations:")
    expect(text).toContain("- cat: file-read-data /Users/x/.ssh/id_rsa")
  })
})

describe("ShellSandbox.scrubEnv", () => {
  test("drops credential-looking variables and keeps the rest", () => {
    const env = {
      PATH: "/bin",
      HOME: "/h",
      GITHUB_TOKEN: "a",
      gh_token: "a",
      MY_SECRET: "a",
      STRIPE_KEY: "a",
      DB_PASSWORD: "a",
      AWS_REGION: "a",
      AWS_SECRET_ACCESS_KEY: "a",
      OPENAI_API_KEY: "a",
      ANTHROPIC_API_KEY: "a",
      HF_TOKEN: "a",
      KEYBOARD: "us",
      TOKENIZERS_PARALLELISM: "false",
      SSH_AUTH_SOCK: "/s",
    }
    expect(Object.keys(ShellSandbox.scrubEnv(env)).sort()).toEqual(["HOME", "KEYBOARD", "PATH", "SSH_AUTH_SOCK", "TOKENIZERS_PARALLELISM"])
  })

  test("keeps the variables LocalCode passes to its tools", () => {
    const env = { OPENCODE_SESSION_ID: "s", LOCALCODE_SERVER_KEY: "k", OPENCODE_SERVER_PASSWORD: "p" }
    expect(ShellSandbox.scrubEnv(env)).toEqual(env)
  })
})

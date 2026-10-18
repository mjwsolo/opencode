import fs from "fs/promises"
import { realpathSync } from "fs"
import path from "path"
import { spawnSync } from "child_process"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Sandbox } from "@opencode/core/sandbox"
import { tmpdir } from "./fixture/tmpdir"

const home = "/u/someone"

describe("Sandbox.profile", () => {
  const text = Sandbox.profile({
    home,
    project: ["/work/app"],
    tmp: ["/private/tmp"],
    writable: ["/data/tool-output"],
    approved: ["/elsewhere/approved"],
  })

  test("starts permissive and denies secret reads", () => {
    expect(text.startsWith("(version 1)\n(allow default)\n")).toBe(true)
    for (const secret of [".ssh", ".aws", ".gnupg", "Library/Keychains"])
      expect(text).toContain(`(subpath "${home}/${secret}")`)
    expect(text).toContain('(subpath "/u/someone/Library/Application Support/Google/Chrome")')
    expect(text).toContain(`(literal "${home}/.ssh/known_hosts")`)
    // gh keeps working: its config is not a hard block.
    expect(text).not.toContain(".config/gh")
  })

  test("writes are denied, then allowed for project, temp, caches, runtime and approved dirs", () => {
    const deny = text.indexOf("(deny file-write*)")
    const allow = text.indexOf("(allow file-write* (subpath \"/dev\")")
    expect(deny).toBeGreaterThan(0)
    expect(allow).toBeGreaterThan(deny)
    const line = text.slice(allow).split("\n")[0]
    for (const dir of [
      "/work/app",
      "/private/tmp",
      "/data/tool-output",
      "/elsewhere/approved",
      `${home}/.npm`,
      `${home}/.cache`,
      `${home}/Library/Caches`,
      `${home}/.cargo/registry`,
      `${home}/.gradle`,
      `${home}/.m2`,
      `${home}/.bun/install`,
      `${home}/.localcode-agent/plan`,
    ])
      expect(line).toContain(`(subpath "${dir}")`)
    expect(line).not.toContain(`(subpath "${home}")`)
  })

  test("the agent's own config is not blocked (a notice is shown instead)", () => {
    expect(text).not.toContain("localcode-agent)")
    expect(text.match(/\(deny file-write\*/g)?.length).toBe(1)
  })

  test("network follows the single policy switch", () => {
    expect(Sandbox.NETWORK).toBe("allow")
    expect(text).not.toContain("network-outbound")
    const closed = Sandbox.profile({ home, project: ["/work/app"], network: "deny" })
    expect(closed).toContain("(deny network-outbound)")
    expect(closed).toContain('(remote ip "localhost:*")')
  })

  test("escapes quotes in paths", () => {
    expect(Sandbox.profile({ home, project: ['/work/we"ird'] })).toContain('(subpath "/work/we\\"ird")')
  })

  test("never makes the filesystem root writable", () => {
    expect(Sandbox.profile({ home, project: ["/"] })).not.toContain('(subpath "/")')
  })
})

describe("Sandbox.selfConfig", () => {
  const guarded = Sandbox.guardedPaths({
    home,
    config: `${home}/.config/localcode-agent`,
    cache: `${home}/.cache/localcode-agent`,
    env: {},
  })
  const is = (file: string) => Sandbox.selfConfig(file, { home, guarded })

  test("matches config dirs, config files and guarded roots", () => {
    expect(is("/work/app/.localcode-agent/localcode.json")).toBe(true)
    expect(is("/work/app/.localcode-agent/plugins/x.ts")).toBe(true)
    expect(is("/work/app/.opencode/agent/a.md")).toBe(true)
    expect(is("/work/app/sub/opencode.jsonc")).toBe(true)
    expect(is("/work/app/localcode.json")).toBe(true)
    expect(is("/work/app/.claude/skills/s/SKILL.md")).toBe(true)
    expect(is(`${home}/.config/localcode-agent/tui.json`)).toBe(true)
    expect(is(`${home}/.cache/localcode-agent/bin/rg`)).toBe(true)
  })

  test("leaves ordinary files and the plan dir alone", () => {
    expect(is("/work/app/src/index.ts")).toBe(false)
    expect(is("/work/app/package.json")).toBe(false)
    expect(is("/work/app/AGENTS.md")).toBe(false)
    expect(is(`${home}/.localcode-agent/plan/next.md`)).toBe(false)
    expect(is(`${home}/.cache/other/x`)).toBe(false)
  })

  test("guards explicit config files named in the environment", () => {
    expect(
      Sandbox.guardedPaths({ home, config: "/c", cache: "/k", env: { LOCALCODE_CONFIG: "/run/session-1.json" } }),
    ).toContain("/run/session-1.json")
  })
})

describe("Sandbox.gitDirectories", () => {
  test("a linked worktree writes to its gitdir and the common dir", async () => {
    await using tmp = await tmpdir()
    const common = path.join(tmp.path, "main", ".git")
    const gitdir = path.join(common, "worktrees", "wt")
    await fs.mkdir(gitdir, { recursive: true })
    await fs.writeFile(path.join(gitdir, "commondir"), "../..\n")
    const wt = path.join(tmp.path, "wt")
    await fs.mkdir(wt)
    await fs.writeFile(path.join(wt, ".git"), `gitdir: ${gitdir}\n`)
    expect(Sandbox.gitDirectories(wt)).toEqual([gitdir, common])
    expect(Sandbox.gitDirectories(tmp.path)).toEqual([])
  })
})

describe("Sandbox.wrap", () => {
  test("falls back to running unwrapped where the sandbox is unsupported", async () => {
    expect(await Effect.runPromise(Sandbox.wrap("(version 1)(allow default)", "linux"))).toBeUndefined()
  })

  const mac = Sandbox.supported() ? test : test.skip
  mac("falls back (and does not throw) when the profile does not compile", async () => {
    expect(await Effect.runPromise(Sandbox.wrap("(version 1)(this is not sbpl"))).toBeUndefined()
  })
  mac("wraps with sandbox-exec when the profile applies", async () => {
    const text = Sandbox.profile({ home, project: ["/work/app"] })
    expect(await Effect.runPromise(Sandbox.wrap(text))).toEqual([Sandbox.EXECUTABLE, "-p", text])
  })
})

// Real Seatbelt behaviour, against a fixture HOME so nothing touches the user's files.
describe("Sandbox enforcement (macOS)", () => {
  const mac = Sandbox.supported() ? test : test.skip

  const fixture = async () => {
    const tmp = await tmpdir()
    const root = realpathSync(tmp.path)
    const dirs = {
      home: path.join(root, "home"),
      project: path.join(root, "project"),
      tmp: path.join(root, "tmp"),
      outside: path.join(root, "outside"),
      approved: path.join(root, "approved"),
      config: path.join(root, "home", ".config", "localcode-agent"),
    }
    for (const dir of Object.values(dirs)) await fs.mkdir(dir, { recursive: true })
    // A real home already has these parents; the cache dirs below them are what commands create.
    for (const parent of ["Library/Caches", ".cargo", "go/pkg"]) await fs.mkdir(path.join(dirs.home, parent), { recursive: true })
    await fs.mkdir(path.join(dirs.home, ".ssh"))
    await fs.writeFile(path.join(dirs.home, ".ssh", "id_ed25519"), "PRIVATE KEY")
    await fs.writeFile(path.join(dirs.home, ".ssh", "known_hosts"), "github.com ssh-ed25519 AAAA")
    await fs.mkdir(path.join(dirs.project, ".localcode-agent"))
    const run = (script: string, extra: Partial<Sandbox.ProfileInput> = {}) => {
      const text = Sandbox.profile({
        home: dirs.home,
        project: [dirs.project],
        tmp: [dirs.tmp],
        ...extra,
      })
      const result = spawnSync(Sandbox.EXECUTABLE, ["-p", text, "/bin/sh", "-c", script], {
        cwd: dirs.project,
        env: { ...process.env, HOME: dirs.home, TMPDIR: dirs.tmp, npm_config_cache: path.join(dirs.home, ".npm") },
        encoding: "utf8",
        timeout: 60_000,
      })
      return { code: result.status, out: `${result.stdout}${result.stderr}` }
    }
    return { tmp, dirs, run }
  }

  mac("writes land in the project and temp, not outside", async () => {
    const { tmp, dirs, run } = await fixture()
    await using _ = tmp
    expect(run(`echo ok > ${dirs.project}/a.txt && mkdir -p ${dirs.project}/src/x && echo ok > ${dirs.tmp}/b`).code).toBe(0)
    const outside = run(`echo pwn > ${dirs.outside}/c`)
    expect(outside.code).not.toBe(0)
    expect(outside.out).toContain("Operation not permitted")
    expect(await Bun.file(path.join(dirs.outside, "c")).exists()).toBe(false)
    // Subprocesses inherit the sandbox.
    expect(run(`python3 -c "open('${dirs.outside}/d','w').write('x')"`).code).not.toBe(0)
    expect(await Bun.file(path.join(dirs.outside, "d")).exists()).toBe(false)
    expect(run(`echo x > ${dirs.home}/.zshrc`).code).not.toBe(0)
  })

  mac("secrets are unreadable while ssh's host list stays readable", async () => {
    const { tmp, dirs, run } = await fixture()
    await using _ = tmp
    const key = run(`cat ${dirs.home}/.ssh/id_ed25519`)
    expect(key.code).not.toBe(0)
    expect(key.out).not.toContain("PRIVATE KEY")
    expect(run(`ls ${dirs.home}/.ssh`).code).not.toBe(0)
    expect(run(`cat ${dirs.home}/.ssh/known_hosts`).out).toContain("github.com")
  })

  mac("the agent's own config in the project stays writable (it gets a notice, not a block)", async () => {
    const { tmp, dirs, run } = await fixture()
    await using _ = tmp
    expect(run(`echo '{}' > ${dirs.project}/.localcode-agent/localcode.json && echo '{}' > ${dirs.project}/localcode.json`).code).toBe(0)
  })

  mac("a blocked command gets a one-line explanation", async () => {
    const { tmp, dirs, run } = await fixture()
    await using _ = tmp
    const blocked = run(`echo pwn > ${dirs.outside}/c`)
    expect(Sandbox.explain(blocked.out)).toBe(Sandbox.BLOCKED_NOTICE)
    expect(Sandbox.explain(run("echo fine").out)).toBeUndefined()
  })

  mac("directories approved for the command become writable", async () => {
    const { tmp, dirs, run } = await fixture()
    await using _ = tmp
    expect(run(`echo x > ${dirs.approved}/f`).code).not.toBe(0)
    expect(run(`echo x > ${dirs.approved}/f`, { approved: [dirs.approved] }).code).toBe(0)
  })

  mac("toolchain caches stay writable (npm, pip, uv, cargo, go)", async () => {
    const { tmp, dirs, run } = await fixture()
    await using _ = tmp
    const caches = [".npm/_cacache", "Library/Caches/pip/http", ".cache/uv", ".cargo/registry", "Library/Caches/go-build"]
    expect(run(caches.map((dir) => `mkdir -p ${dirs.home}/${dir} && echo x > ${dirs.home}/${dir}/f`).join(" && ")).code).toBe(0)
    if (Bun.which("npm")) {
      const npm = run("npm cache verify")
      expect(npm.code).toBe(0)
      expect((await fs.readdir(path.join(dirs.home, ".npm", "_cacache"))).length).toBeGreaterThan(0)
    }
    if (Bun.which("python3"))
      expect(run(`python3 -m pip --version >/dev/null 2>&1 || true; python3 -c "import tempfile; tempfile.NamedTemporaryFile().write(b'x')"`).code).toBe(0)
  })
})

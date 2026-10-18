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
  const text = Sandbox.profile({ home })

  test("allows everything except reading keychains and browser stores", () => {
    expect(text.startsWith("(version 1)\n(allow default)\n")).toBe(true)
    for (const store of [
      "Library/Keychains",
      "Library/Cookies",
      "Library/Safari",
      "Library/Application Support/Google/Chrome",
      "Library/Application Support/BraveSoftware",
      "Library/Application Support/Microsoft Edge",
      "Library/Application Support/Firefox",
      "Library/Application Support/Arc",
    ])
      expect(text).toContain(`(subpath "${home}/${store}")`)
    // Dev tools need these; nothing restricts writes.
    for (const open of [".ssh", ".aws", ".gnupg", ".config/gh"]) expect(text).not.toContain(`${home}/${open}`)
    expect(text).not.toContain("file-write")
    expect(text.match(/\(deny /g)?.length).toBe(1)
  })

  test("network follows the single policy switch", () => {
    expect(Sandbox.NETWORK).toBe("allow")
    expect(text).not.toContain("network-outbound")
    const closed = Sandbox.profile({ home, network: "deny" })
    expect(closed).toContain("(deny network-outbound)")
    expect(closed).toContain('(remote ip "localhost:*")')
  })

  test("escapes quotes in paths", () => {
    expect(Sandbox.profile({ home: '/u/we"ird' })).toContain('(subpath "/u/we\\"ird/Library/Keychains")')
  })
})

describe("Sandbox.explain", () => {
  test("explains only denials of a blocked store", () => {
    expect(Sandbox.explain(`cat: ${home}/Library/Cookies/Cookies.binarycookies: Operation not permitted`, home)).toBe(
      Sandbox.BLOCKED_NOTICE,
    )
    expect(Sandbox.explain(`ls: ${home}/Desktop: Operation not permitted`, home)).toBeUndefined()
    expect(Sandbox.explain("fine", home)).toBeUndefined()
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

describe("Sandbox.wrap", () => {
  test("falls back to running unwrapped where the sandbox is unsupported", async () => {
    expect(await Effect.runPromise(Sandbox.wrap("(version 1)(allow default)", "linux"))).toBeUndefined()
  })

  const mac = Sandbox.supported() ? test : test.skip
  mac("falls back (and does not throw) when the profile does not compile", async () => {
    expect(await Effect.runPromise(Sandbox.wrap("(version 1)(this is not sbpl"))).toBeUndefined()
  })
  mac("wraps with sandbox-exec when the profile applies", async () => {
    const text = Sandbox.profile({ home })
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
      outside: path.join(root, "outside"),
      homebrew: path.join(root, "opt", "homebrew"),
    }
    for (const dir of Object.values(dirs)) await fs.mkdir(dir, { recursive: true })
    const write = async (file: string, text: string) => {
      await fs.mkdir(path.dirname(path.join(dirs.home, file)), { recursive: true })
      await fs.writeFile(path.join(dirs.home, file), text)
    }
    await write(".ssh/id_ed25519", "PRIVATE KEY")
    await write(".aws/credentials", "[default]")
    await write(".gnupg/pubring.kbx", "GPG")
    await write("Library/Application Support/Google/Chrome/Default/Cookies", "CHROME-COOKIES")
    await write("Library/Application Support/Google/Chrome/Default/Login Data", "CHROME-LOGINS")
    await write("Library/Application Support/Firefox/Profiles/x.default/cookies.sqlite", "FIREFOX-COOKIES")
    await write("Library/Keychains/login.keychain-db", "KEYCHAIN")
    const run = (script: string, extra: Partial<Sandbox.ProfileInput> = {}) => {
      const text = Sandbox.profile({ home: dirs.home, ...extra })
      const result = spawnSync(Sandbox.EXECUTABLE, ["-p", text, "/bin/sh", "-c", script], {
        cwd: dirs.project,
        env: { ...process.env, HOME: dirs.home, npm_config_cache: path.join(dirs.home, ".npm") },
        encoding: "utf8",
        timeout: 60_000,
      })
      return { code: result.status, out: `${result.stdout}${result.stderr}` }
    }
    return { tmp, dirs, run }
  }

  mac("git, ssh, aws and gpg files stay readable", async () => {
    const { tmp, dirs, run } = await fixture()
    await using _ = tmp
    const read = run(`cat ${dirs.home}/.ssh/id_ed25519 ${dirs.home}/.aws/credentials ${dirs.home}/.gnupg/pubring.kbx`)
    expect(read.code).toBe(0)
    expect(read.out).toBe("PRIVATE KEY[default]GPG")
    if (Bun.which("ssh-keygen"))
      expect(run(`ssh-keygen -q -t ed25519 -N '' -f ${dirs.home}/.ssh/id_new && ssh-keygen -y -f ${dirs.home}/.ssh/id_new`).code).toBe(0)
  })

  mac("writes anywhere still work (installs, global config, caches)", async () => {
    const { tmp, dirs, run } = await fixture()
    await using _ = tmp
    // A brew-like install into an /opt/homebrew-style prefix, a global git config, a cargo bin, a user site.
    expect(
      run(
        [
          `mkdir -p ${dirs.homebrew}/Cellar/tool/1.0/bin && echo x > ${dirs.homebrew}/Cellar/tool/1.0/bin/tool`,
          `ln -s ../Cellar/tool/1.0/bin/tool ${dirs.homebrew}/tool`,
          `echo x > ${dirs.outside}/file`,
          `mkdir -p ${dirs.home}/.cargo/bin && echo x > ${dirs.home}/.cargo/bin/tool`,
          `echo '[user]' > ${dirs.home}/.gitconfig`,
          `echo x > ${dirs.project}/a.txt`,
        ].join(" && "),
      ).code,
    ).toBe(0)
    if (Bun.which("git")) expect(run("git config --global user.name sandbox-test").code).toBe(0)
    if (Bun.which("npm")) expect(run("npm cache verify").code).toBe(0)
  })

  mac("browser cookie and login stores and keychain files are unreadable, with an explanation", async () => {
    const { tmp, dirs, run } = await fixture()
    await using _ = tmp
    const chrome = run(`cat "${dirs.home}/Library/Application Support/Google/Chrome/Default/Cookies"`)
    expect(chrome.code).not.toBe(0)
    expect(chrome.out).not.toContain("CHROME-COOKIES")
    expect(Sandbox.explain(chrome.out, dirs.home)).toBe(Sandbox.BLOCKED_NOTICE)
    for (const file of [
      "Library/Application Support/Google/Chrome/Default/Login Data",
      "Library/Application Support/Firefox/Profiles/x.default/cookies.sqlite",
      "Library/Keychains/login.keychain-db",
    ])
      expect(run(`cat "${dirs.home}/${file}"`).code).not.toBe(0)
    // Subprocesses inherit the block.
    expect(
      run(`python3 -c "print(open('${dirs.home}/Library/Keychains/login.keychain-db').read())"`).out,
    ).not.toContain("KEYCHAIN")
  })
})

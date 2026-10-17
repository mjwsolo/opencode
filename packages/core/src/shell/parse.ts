export * as ShellParse from "./parse.js"

import { Effect } from "effect"
import { fileURLToPath } from "url"
import os from "os"
import path from "path"
import type { Node } from "web-tree-sitter"
import { shellParserWasm } from "#shell-parser-wasm"
import { ShellSelect } from "./select.js"
import { lazy } from "../util/lazy.js"
import { Wildcard } from "../util/wildcard.js"

type Part = { type: string; text: string }
const CWD = new Set(["cd", "chdir", "popd", "pushd", "push-location", "set-location"])
const POWERSHELL_PATH_FLAG_RE =
  /^-(?:p(?:ath|at|a)?|lp|l(?:i(?:t(?:e(?:r(?:a(?:l(?:p(?:a(?:t(?:h)?)?)?)?)?)?)?)?)?)?|psp(?:a(?:t(?:h)?)?)?):?$/i

export type Result = {
  commands: Array<{ resource: string; save: string }>
  directories: string[]
}

const ARITY: Record<string, number> = {
  cat: 1,
  cd: 1,
  chmod: 1,
  chown: 1,
  cp: 1,
  echo: 1,
  env: 1,
  export: 1,
  grep: 1,
  kill: 1,
  killall: 1,
  ln: 1,
  ls: 1,
  mkdir: 1,
  mv: 1,
  ps: 1,
  pwd: 1,
  rm: 1,
  rmdir: 1,
  sleep: 1,
  source: 1,
  tail: 1,
  touch: 1,
  unset: 1,
  which: 1,
  aws: 3,
  az: 3,
  bazel: 2,
  brew: 2,
  bun: 2,
  "bun run": 3,
  "bun x": 3,
  cargo: 2,
  "cargo add": 3,
  "cargo run": 3,
  cdk: 2,
  cf: 2,
  cmake: 2,
  composer: 2,
  consul: 2,
  "consul kv": 3,
  crictl: 2,
  deno: 2,
  "deno task": 3,
  doctl: 3,
  docker: 2,
  "docker builder": 3,
  "docker compose": 3,
  "docker container": 3,
  "docker image": 3,
  "docker network": 3,
  "docker volume": 3,
  eksctl: 2,
  "eksctl create": 3,
  firebase: 2,
  flyctl: 2,
  gcloud: 3,
  gh: 3,
  git: 2,
  "git config": 3,
  "git remote": 3,
  "git stash": 3,
  go: 2,
  gradle: 2,
  helm: 2,
  heroku: 2,
  hugo: 2,
  ip: 2,
  "ip addr": 3,
  "ip link": 3,
  "ip netns": 3,
  "ip route": 3,
  kind: 2,
  "kind create": 3,
  kubectl: 2,
  "kubectl kustomize": 3,
  "kubectl rollout": 3,
  kustomize: 2,
  make: 2,
  mc: 2,
  "mc admin": 3,
  minikube: 2,
  mongosh: 2,
  mysql: 2,
  mvn: 2,
  ng: 2,
  npm: 2,
  "npm exec": 3,
  "npm init": 3,
  "npm run": 3,
  "npm view": 3,
  npx: 2,
  nvm: 2,
  nx: 2,
  openssl: 2,
  "openssl req": 3,
  "openssl x509": 3,
  pip: 2,
  pipenv: 2,
  pnpm: 2,
  "pnpm dlx": 3,
  "pnpm exec": 3,
  "pnpm run": 3,
  poetry: 2,
  podman: 2,
  "podman container": 3,
  "podman image": 3,
  psql: 2,
  pulumi: 2,
  "pulumi stack": 3,
  python: 2,
  pyenv: 2,
  rake: 2,
  rbenv: 2,
  "redis-cli": 2,
  rustup: 2,
  serverless: 2,
  sfdx: 3,
  skaffold: 2,
  sls: 2,
  sst: 2,
  swift: 2,
  systemctl: 2,
  terraform: 2,
  "terraform workspace": 3,
  tmux: 2,
  turbo: 2,
  ufw: 2,
  vault: 2,
  "vault auth": 3,
  "vault kv": 3,
  vercel: 2,
  volta: 2,
  wp: 2,
  yarn: 2,
  "yarn dlx": 3,
  "yarn run": 3,
}
const PREFIX_LENGTH = Math.max(...Object.values(ARITY))

export const scan = Effect.fnUntraced(function* (
  command: string,
  shell: string,
  cwd: string,
  options?: { portable?: boolean; wasm?: typeof shellParserWasm },
) {
  const wasm = options?.wasm ?? shellParserWasm
  // A build without the PowerShell grammar (LocalCode's macOS build) scans PowerShell portably.
  if (options?.portable || wasm.bash === "" || (wasm.powershell === "" && ShellSelect.ps(shell)))
    return yield* scanPortable(command, shell, cwd)
  return yield* scanLegacy(command, shell, cwd)
})

const scanLegacy = Effect.fnUntraced(function* (command: string, shell: string, cwd: string) {
  const parsers = yield* Effect.promise(load)
  const powershell = ShellSelect.ps(shell)
  const tree = (powershell ? parsers.ps : parsers.bash).parse(command)
  if (!tree) return yield* Effect.fail(new Error("Failed to parse shell command"))

  return yield* Effect.acquireUseRelease(
    Effect.succeed(tree),
    (tree) =>
      Effect.sync(() =>
        tree.rootNode.descendantsOfType("command").reduce(
          (result, node) => {
            if (!node) return result
            const command = parts(node)
            const tokens = command.map((part) => part.text)
            if (tokens.length === 0) return result
            const name = powershell ? tokens[0].toLowerCase() : tokens[0]
            if (CWD.has(name)) {
              result.directories.push(...directoryArgs(command, powershell, cwd, shell))
              return result
            }
            result.commands.push({
              resource: (node.parent?.type === "redirected_statement" ? node.parent.text : node.text).trim(),
              save: `${prefix(tokens).join(" ")} *`,
            })
            return result
          },
          { commands: [] as Array<{ resource: string; save: string }>, directories: [] as string[] },
        ),
      ),
    (tree) => Effect.sync(() => tree.delete()),
  )
})

export const scanPortable = Effect.fnUntraced(function* (command: string, shell: string, cwd: string) {
  const { ShellScan } = yield* Effect.tryPromise({
    try: () => import("./scan.js"),
    catch: (cause) => new Error(`Portable shell scanner failed to load: ${cause}`, { cause }),
  })
  const powershell = ShellSelect.ps(shell)
  const name = ShellSelect.name(shell)
  const result = powershell
    ? ShellScan.scanPowerShell(command)
    : ShellScan.scan(command, name === "bash" || name === "zsh" ? name : "posix")
  if (result.kind === "opaque")
    return yield* Effect.fail(new Error(`Portable shell scanner cannot analyze command: ${result.reason}`))

  const output: Result = { commands: [], directories: [] }
  for (const item of result.commands) {
    // The legacy command walk skips declarations, not the substitutions within them.
    if (item.declaration) continue
    const words = item.redirectWordCount === undefined ? item.rawWords : item.rawWords.slice(0, item.redirectWordCount)
    // The shipped PowerShell grammar treats bare statement-head foreach blocks as control flow.
    if (
      powershell &&
      item.statementHead &&
      /^foreach(?:-|$)/i.test(words[0] ?? "") &&
      words.length > 1 &&
      words.slice(1).every((word) => word.startsWith("{"))
    )
      continue
    const name = powershell ? words[0]?.toLowerCase() : words[0]
    if (CWD.has(name)) {
      output.directories.push(
        ...directoryArgs(
          powershell
            ? words.flatMap((raw, index): Part[] => {
                const text =
                  !raw.includes("`$") && /['"`]/.test(raw) ? (item.words[index] ?? raw) : raw.replaceAll("`$", "\0")
                if (!/^-[A-Za-z_?][\w?-]*(?::|$)/.test(raw)) return [{ type: "word", text }]
                const colon = text.indexOf(":")
                if (colon >= 0)
                  return colon + 1 < text.length
                    ? [
                        { type: "command_parameter", text: text.slice(0, colon) },
                        { type: "word", text: text.slice(colon + 1) },
                      ]
                    : [{ type: "command_parameter", text: text.slice(0, colon) }]
                return [{ type: "command_parameter", text }]
              })
            : item.rawWords.map((text, index) => ({
                type: "word",
                // Only literal quoting resolves to a static directory.
                text: text.startsWith("$'") || (!/[$`~\\]/.test(text) && /['"]/.test(text)) ? item.words[index] : text,
              })),
          powershell,
          cwd,
          shell,
        ),
      )
      continue
    }
    const selected = prefix(words.slice(0, PREFIX_LENGTH))
    const conventional = `${selected.join(" ")} *`
    const end = item.wordEnds?.[selected.length - 1]
    // Keep existing grants stable unless normalized spacing loses the original source boundary.
    const save =
      !powershell || end === undefined || Wildcard.match(item.resource, conventional)
        ? conventional
        : (() => {
            const boundary =
              item.wordEnds?.find(
                (value) => value >= end && (value >= item.resource.length || /\s/.test(item.resource[value])),
              ) ?? end
            const separator = /^\s+(?:`(?:\r\n|\r|\n)\s*)?/.exec(item.resource.slice(boundary))?.[0]
            return `${item.resource.slice(0, boundary)}${separator ?? " "}*`
          })()
    output.commands.push({
      resource: item.resource,
      save,
    })
  }
  return output
})

function parts(node: Node) {
  return Array.from({ length: node.childCount }).flatMap((_, index): Part[] => {
    const child = node.child(index)
    if (!child) return []
    if (child.type === "command_elements")
      return Array.from({ length: child.childCount }).flatMap((_, itemIndex): Part[] => {
        const item = child.child(itemIndex)
        if (!item || item.type === "command_argument_sep" || item.type === "redirection") return []
        return [{ type: item.type, text: item.text }]
      })
    if (!["command_name", "command_name_expr", "word", "string", "raw_string", "concatenation"].includes(child.type))
      return []
    return [{ type: child.type, text: child.text }]
  })
}

function directoryArgs(command: Part[], powershell: boolean, cwd: string, shell: string) {
  if (!powershell)
    return command
      .slice(1)
      .filter((part) => !part.text.startsWith("-"))
      .map((part) => directoryArgument(part.text, powershell, cwd, shell))
      .filter((part) => part !== undefined)

  const directories: string[] = []
  let path = false
  let endOfParameters = false
  for (const part of command.slice(1)) {
    if (!endOfParameters && part.text === "--") {
      endOfParameters = true
      continue
    }
    if (path) {
      const value = directoryArgument(part.text, powershell, cwd, shell)
      if (value) directories.push(value)
      path = false
      continue
    }
    if (!endOfParameters && part.type === "command_parameter") {
      path = POWERSHELL_PATH_FLAG_RE.test(part.text)
      continue
    }
    const value = directoryArgument(part.text, powershell, cwd, shell)
    if (value) directories.push(value)
  }
  return directories
}

function directoryArgument(value: string, powershell: boolean, cwd: string, shell: string) {
  const quote = value[0]
  const text = (quote === '"' || quote === "'") && value.at(-1) === quote ? value.slice(1, -1) : value
  if (!powershell) return expandKnownDirectory(text)

  // PowerShell exposes environment variables through $env:NAME and provides these
  // automatic directory variables. Expand only values we can determine without executing code.
  return expandKnownDirectory(
    text
      .replace(/\$\{env:([^}]+)\}/gi, (_, key: string) => environment(key) ?? "")
      .replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/gi, (_, key: string) => environment(key) ?? "")
      .replace(/\$(?:\{(HOME|PWD|PSHOME)\}|(HOME|PWD|PSHOME)(?=$|[\\/]))/gi, (_, braced?: string, bare?: string) => {
        const key = (braced ?? bare ?? "").toUpperCase()
        if (key === "HOME") return os.homedir()
        if (key === "PWD") return cwd
        return path.dirname(shell)
      }),
  )
}

function expandKnownDirectory(value: string) {
  // Unknown shell expressions cannot be resolved safely during permission analysis.
  if (value.includes("$") || value.includes("`") || value.startsWith("(")) return
  const resolved = value.replaceAll("\0", "$")
  if (resolved === "~") return os.homedir()
  if (resolved.startsWith("~/") || (process.platform === "win32" && resolved.startsWith("~\\"))) {
    return path.join(os.homedir(), resolved.slice(2))
  }
  return resolved
}

function environment(key: string) {
  if (process.platform !== "win32") return process.env[key]
  const name = Object.keys(process.env).find((item) => item.toLowerCase() === key.toLowerCase())
  return name ? process.env[name] : undefined
}

function prefix(tokens: string[]) {
  for (let length = tokens.length; length > 0; length--) {
    const arity = ARITY[tokens.slice(0, length).join(" ")]
    if (arity !== undefined) return tokens.slice(0, arity)
  }
  return tokens.slice(0, 1)
}

function resolve(asset: string) {
  if (asset.startsWith("file://")) return fileURLToPath(asset)
  if (path.isAbsolute(asset)) return asset
  return fileURLToPath(new URL(asset, import.meta.url))
}

const load = lazy(initialize)

async function initialize() {
  const { Parser, Language } = await import("web-tree-sitter")
  await Parser.init({ locateFile: () => resolve(shellParserWasm.runtime) })
  const [bashLanguage, psLanguage] = await Promise.all([
    Language.load(resolve(shellParserWasm.bash)),
    shellParserWasm.powershell === "" ? undefined : Language.load(resolve(shellParserWasm.powershell)),
  ])
  const bash = new Parser()
  bash.setLanguage(bashLanguage)
  const ps = new Parser()
  if (psLanguage) ps.setLanguage(psLanguage)
  return { bash, ps }
}

/**
 * Paths a command reads or writes that are visible without running it: the file arguments of
 * commands known to take paths (opencode v1's list) and the targets of redirections. Each is
 * returned as written (quotes removed, a leading ~ expanded); unknown expansions ($VAR, command
 * substitutions) and leading globs are skipped, as in v1. Terminal devices are never returned.
 */
const FILE_COMMANDS = new Set([
  ...CWD,
  "rm",
  "cp",
  "mv",
  "mkdir",
  "rmdir",
  "touch",
  "chmod",
  "chown",
  "cat",
  "tee",
  "ln",
  "get-content",
  "set-content",
  "add-content",
  "copy-item",
  "move-item",
  "remove-item",
  "new-item",
  "rename-item",
])
const CMD_FILE_COMMANDS = new Set(["copy", "del", "dir", "erase", "md", "mkdir", "move", "rd", "ren", "rename", "rmdir", "type"])
const POWERSHELL_FLAGS = new Set(["-destination", "-literalpath", "-path"])
const POWERSHELL_SWITCHES = new Set(["-confirm", "-debug", "-force", "-nonewline", "-recurse", "-verbose", "-whatif"])
const DEVICES = /^\/dev\/(?:null|zero|stdin|stdout|stderr|tty|fd\/\d+)$/

export const paths = Effect.fnUntraced(function* (
  command: string,
  shell: string,
  cwd: string,
  options?: { portable?: boolean; wasm?: typeof shellParserWasm },
) {
  const wasm = options?.wasm ?? shellParserWasm
  const powershell = ShellSelect.ps(shell)
  const cmd = ShellSelect.name(shell) === "cmd"
  // The tree-sitter grammar sees redirection targets; use it whenever the build has it, whichever
  // scanner derives the permission patterns.
  const raw =
    wasm.bash === "" || (powershell && wasm.powershell === "")
      ? yield* pathsPortable(command, shell)
      : yield* pathsLegacy(command, powershell, cmd)
  return [
    ...new Set(
      raw.flatMap((value) => {
        const text = pathText(value, powershell, cwd, shell)
        return text === undefined || DEVICES.test(text) ? [] : [text]
      }),
    ),
  ]
})

function fileArguments(command: Part[], powershell: boolean, cmd: boolean): string[] {
  const name = powershell || cmd ? command[0]?.text.toLowerCase() : command[0]?.text
  if (!name || CWD.has(name) || !(FILE_COMMANDS.has(name) || (cmd && CMD_FILE_COMMANDS.has(name)))) return []
  if (!powershell)
    return command
      .slice(1)
      .filter(
        (part) =>
          !part.text.startsWith("-") && !(cmd && part.text.startsWith("/")) && !(name === "chmod" && part.text.startsWith("+")),
      )
      .map((part) => part.text)
  const out: string[] = []
  let want = false
  for (const part of command.slice(1)) {
    if (want) {
      out.push(part.text)
      want = false
      continue
    }
    if (part.type === "command_parameter") {
      const flag = part.text.toLowerCase()
      if (POWERSHELL_SWITCHES.has(flag)) continue
      want = POWERSHELL_FLAGS.has(flag)
      continue
    }
    out.push(part.text)
  }
  return out
}

const REDIRECT_TARGET = /(?:^|[\s;|(])(?:\d+|&)?(>>|>\||>&|<&|<>|>|<(?!<))\s*("[^"]*"|'[^']*'|[^\s;|&<>()]+)/g
const REDIRECT_OPERATORS = new Set([">", ">>", ">|", "&>", "&>>", "<", "<>", ">&", "<&"])

const pathsLegacy = Effect.fnUntraced(function* (command: string, powershell: boolean, cmd: boolean) {
  const parsers = yield* Effect.promise(load)
  const tree = (powershell ? parsers.ps : parsers.bash).parse(command)
  if (!tree) return yield* Effect.fail(new Error("Failed to parse shell command"))
  return yield* Effect.acquireUseRelease(
    Effect.succeed(tree),
    (tree) =>
      Effect.sync(() => {
        const out: string[] = []
        for (const node of tree.rootNode.descendantsOfType("command")) {
          if (node) out.push(...fileArguments(parts(node), powershell, cmd))
        }
        for (const node of tree.rootNode.descendantsOfType(["file_redirect", "redirected_file_name"])) {
          if (!node) continue
          if (node.type === "redirected_file_name") {
            out.push(node.text)
            continue
          }
          const children = Array.from({ length: node.childCount }, (_, index) => node.child(index)).filter(
            (child) => child !== null,
          )
          const operator = children.find((child) => !child.isNamed && REDIRECT_OPERATORS.has(child.type))?.type
          const targets = children.filter((child) => child.isNamed && child.type !== "file_descriptor")
          for (const target of targets) {
            // ">&2" and "<&-" duplicate or close descriptors; they name no file.
            if ((operator === ">&" || operator === "<&") && /^(?:\d+|-)$/.test(target.text)) continue
            out.push(target.text)
          }
        }
        return out
      }),
    (tree) => Effect.sync(() => tree.delete()),
  )
})

const pathsPortable = Effect.fnUntraced(function* (command: string, shell: string) {
  const { ShellScan } = yield* Effect.tryPromise({
    try: () => import("./scan.js"),
    catch: (cause) => new Error(`Portable shell scanner failed to load: ${cause}`, { cause }),
  })
  const powershell = ShellSelect.ps(shell)
  const name = ShellSelect.name(shell)
  const result = powershell
    ? ShellScan.scanPowerShell(command)
    : ShellScan.scan(command, name === "bash" || name === "zsh" ? name : "posix")
  if (result.kind === "opaque")
    return yield* Effect.fail(new Error(`Portable shell scanner cannot analyze command: ${result.reason}`))
  return result.commands.flatMap((item) => {
    const end = item.redirectWordCount ?? item.rawWords.length
    const words = item.rawWords.slice(0, end).map((text, index): Part => ({
      type: powershell && /^-[A-Za-z_?][\w?-]*$/.test(text) ? "command_parameter" : "word",
      text: text.startsWith("$'") || (!/[$`~\\]/.test(text) && /['"]/.test(text)) ? item.words[index] : text,
    }))
    // The portable scanner keeps no redirection targets; read them from the command's source.
    const targets = Array.from(item.resource.matchAll(REDIRECT_TARGET), (match) => match[2]).filter(
      (text) => !/^(?:\d+|-)$/.test(text),
    )
    return [...fileArguments(words, powershell, name === "cmd"), ...targets]
  })
})

function pathText(value: string, powershell: boolean, cwd: string, shell: string) {
  const quote = value[0]
  const unquoted = (quote === '"' || quote === "'") && value.length > 1 && value.at(-1) === quote ? value.slice(1, -1) : value
  const expanded = powershell
    ? directoryArgument(unquoted, true, cwd, shell)
    : unquoted.includes("$") || unquoted.includes("`") || unquoted.startsWith("(")
      ? undefined
      : expandKnownDirectory(unquoted)
  if (!expanded) return
  // A leading glob names no fixed directory; a later one keeps the fixed part before it.
  const glob = /[?*[]/.exec(expanded)
  if (glob?.index === 0) return
  const fixed = glob ? expanded.slice(0, glob.index) : expanded
  if (!powershell) return fixed
  // PowerShell provider paths other than the file system are not files.
  const provider = /^([A-Za-z]+)::(.*)$/.exec(fixed)
  if (provider) return provider[1].toLowerCase() === "filesystem" ? provider[2] : undefined
  const drive = /^([A-Za-z]+):(.*)$/.exec(fixed)
  return drive && drive[1].length > 1 ? undefined : fixed
}

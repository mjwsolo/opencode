import { expect, test } from "bun:test"
import { mergePluginTargets } from "../src/plugin/discovery"

test("deduplicates equivalent local plugin targets while retaining the final source", () => {
  const directory = "/project"
  const discovered = { entry: "/project/.opencode/plugins/example", install: true, optional: true }
  const server = { entry: "./.opencode/plugins/example", install: false, optional: true }

  expect(mergePluginTargets([discovered, server], directory)).toEqual([server])
})

test("preserves the first target position when a later source overrides it", () => {
  const first = { entry: "example", install: true, optional: true }
  const other = { entry: "other", install: true, optional: true }
  const configured = { entry: { package: "example", options: { enabled: true } }, install: true, optional: false }

  expect(mergePluginTargets([first, other, configured], "/project")).toEqual([configured, other])
})

test("project plugin directories are discovered only when project configuration is enabled", async () => {
  const { mkdtemp, mkdir, rm } = await import("node:fs/promises")
  const os = await import("node:os")
  const path = await import("node:path")
  const { localPluginDirectories, projectPluginsEnabled } = await import("../src/plugin/discovery")
  const root = await mkdtemp(path.join(os.tmpdir(), "tui-discovery-"))
  try {
    const project = path.join(root, "project")
    await mkdir(path.join(project, ".git"), { recursive: true })
    await mkdir(path.join(project, ".localcode-agent"), { recursive: true })
    const config = path.join(root, "config")
    const enabled = await localPluginDirectories(project, config, true)
    expect(enabled).toContain(path.join(project, ".opencode", "plugins"))
    expect(enabled).toContain(path.join(project, ".localcode-agent", "plugins"))
    expect(await localPluginDirectories(project, config, false)).toEqual([path.join(config, "plugins")])
    expect(projectPluginsEnabled({})).toBe(true)
    expect(projectPluginsEnabled({ OPENCODE_DISABLE_PROJECT_CONFIG: "1" })).toBe(false)
    expect(projectPluginsEnabled({ OPENCODE_CONFIG_PROJECT_DISABLE: "true" })).toBe(false)
    expect(projectPluginsEnabled({ OPENCODE_DISABLE_PROJECT_CONFIG: "0" })).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

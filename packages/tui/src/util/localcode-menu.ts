/**
 * LocalCode's command menu is an allowlist. The "/" menu (and the palette) lists
 * every command upstream OpenCode registers, so each upstream update added
 * commands nobody chose (/btw, /worktrees, /variant-cycle, ...). Only the names
 * below are offered; a new upstream command stays hidden until it is added here,
 * and tests/e2e checks the menu against this list.
 */
export const LOCALCODE_MENU: ReadonlySet<string> = new Set([
  "bench",
  "cd",
  "clear",
  "compact",
  "decide",
  "diff",
  "exit",
  "export",
  "help",
  "import",
  "mcps",
  "models",
  "new",
  "permissions",
  "project-context",
  "rename",
  "resume",
  "speak",
  "server",
  "settings",
  "show-sidebar",
  "skills",
  "status",
  "themes",
  "thinking",
  "undo",
  "vision",
])

type MenuCommand = {
  title?: string
  palette?: boolean
  slash?: { name: string; aliases?: readonly string[]; arguments?: boolean }
}

/** The command's slash names; palette actions without one are named from their title. */
export function menuSlash(command: MenuCommand) {
  if (command.slash) return command.slash
  if (!command.palette || !command.title) return undefined
  return {
    name: command.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    aliases: undefined,
    arguments: undefined,
  }
}

/** The names of this command LocalCode offers (empty: not in the menu). */
export function offeredNames(command: MenuCommand): string[] {
  const slash = menuSlash(command)
  if (!slash?.name) return []
  return [slash.name, ...(slash.aliases ?? [])].filter((name) => LOCALCODE_MENU.has(name))
}

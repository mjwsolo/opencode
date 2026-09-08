import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createMemo, For, type Accessor } from "solid-js"
import { DEFAULT_THEMES, useTheme } from "../../context/theme"
import { useCommandShortcut } from "../../keymap"

const themeCount = Object.keys(DEFAULT_THEMES).length

type TipPart = { text: string; highlight: boolean }
type TipShortcut = Accessor<string>
type Shortcuts = {
  agentCycle: TipShortcut
  childFirst: TipShortcut
  childNext: TipShortcut
  childPrevious: TipShortcut
  commandList: TipShortcut
  editorOpen: TipShortcut
  helpShow: TipShortcut
  inputClear: TipShortcut
  inputNewline: TipShortcut
  inputPaste: TipShortcut
  inputUndo: TipShortcut
  leader: TipShortcut
  messagesCopy: TipShortcut
  messagesFirst: TipShortcut
  messagesLast: TipShortcut
  messagesPageDown: TipShortcut
  messagesPageUp: TipShortcut
  messagesToggleConceal: TipShortcut
  modelCycleRecent: TipShortcut
  modelList: TipShortcut
  sessionExport: TipShortcut
  sessionInterrupt: TipShortcut
  sessionList: TipShortcut
  sessionNew: TipShortcut
  sessionParent: TipShortcut
  sessionPinToggle: TipShortcut
  sessionQuickSwitch1: TipShortcut
  sessionQuickSwitch9: TipShortcut
  sessionSidebarToggle: TipShortcut
  sessionTimeline: TipShortcut
  statusView: TipShortcut
  terminalSuspend: TipShortcut
  themeList: TipShortcut
}
type Tip = string | ((shortcuts: Shortcuts) => string | undefined)

function parse(tip: string): TipPart[] {
  const parts: TipPart[] = []
  const regex = /\{highlight\}(.*?)\{\/highlight\}/g
  const found = Array.from(tip.matchAll(regex))
  const state = found.reduce(
    (acc, match) => {
      const start = match.index ?? 0
      if (start > acc.index) {
        acc.parts.push({ text: tip.slice(acc.index, start), highlight: false })
      }
      acc.parts.push({ text: match[1], highlight: true })
      acc.index = start + match[0].length
      return acc
    },
    { parts, index: 0 },
  )

  if (state.index < tip.length) {
    parts.push({ text: tip.slice(state.index), highlight: false })
  }

  return parts
}

const NO_MODELS_TIP = "Run {highlight}/models{/highlight} to pick a local model and quant, then start coding"
const NO_MODELS_PARTS = parse(NO_MODELS_TIP)

function shortcutText(value: string) {
  return `{highlight}${value}{/highlight}`
}

function commandText(command: string, shortcut: string) {
  if (!shortcut) return shortcutText(command)
  return `${shortcutText(command)} or ${shortcutText(shortcut)}`
}

function press(shortcut: string, text: string) {
  if (!shortcut) return undefined
  return `Press ${shortcutText(shortcut)} ${text}`
}

function configShortcut(api: TuiPluginApi, command: string): TipShortcut {
  return () =>
    api.tuiConfig.keybinds
      .get(command)
      .map((binding) => api.keys.formatSequence(Array.from(api.keymap.parseKeySequence(binding.key))))
      .filter(Boolean)
      .join(", ")
}

export function Tips(props: { api: TuiPluginApi; connected?: boolean }) {
  const theme = useTheme().theme
  const tipOffset = Math.random()
  const shortcuts: Shortcuts = {
    agentCycle: useCommandShortcut("agent.cycle"),
    childFirst: configShortcut(props.api, "session.child.first"),
    childNext: configShortcut(props.api, "session.child.next"),
    childPrevious: configShortcut(props.api, "session.child.previous"),
    commandList: useCommandShortcut("command.palette.show"),
    editorOpen: useCommandShortcut("prompt.editor"),
    helpShow: useCommandShortcut("help.show"),
    inputClear: useCommandShortcut("prompt.clear"),
    inputNewline: useCommandShortcut("input.newline"),
    inputPaste: useCommandShortcut("prompt.paste"),
    inputUndo: useCommandShortcut("input.undo"),
    leader: configShortcut(props.api, "leader"),
    messagesCopy: configShortcut(props.api, "messages.copy"),
    messagesFirst: configShortcut(props.api, "session.first"),
    messagesLast: configShortcut(props.api, "session.last"),
    messagesPageDown: configShortcut(props.api, "session.page.down"),
    messagesPageUp: configShortcut(props.api, "session.page.up"),
    messagesToggleConceal: configShortcut(props.api, "session.toggle.conceal"),
    modelCycleRecent: useCommandShortcut("model.cycle_recent"),
    modelList: useCommandShortcut("model.list"),
    sessionExport: configShortcut(props.api, "session.export"),
    sessionInterrupt: configShortcut(props.api, "session.interrupt"),
    sessionList: useCommandShortcut("session.list"),
    sessionNew: useCommandShortcut("session.new"),
    sessionParent: configShortcut(props.api, "session.parent"),
    sessionPinToggle: configShortcut(props.api, "session.pin.toggle"),
    sessionQuickSwitch1: useCommandShortcut("session.quick_switch.1"),
    sessionQuickSwitch9: useCommandShortcut("session.quick_switch.9"),
    sessionSidebarToggle: configShortcut(props.api, "session.sidebar.toggle"),
    sessionTimeline: configShortcut(props.api, "session.timeline"),
    statusView: useCommandShortcut("localcode.status"),
    terminalSuspend: useCommandShortcut("terminal.suspend"),
    themeList: useCommandShortcut("theme.switch"),
  }
  const tip = createMemo(() => {
    if (props.connected === false) return NO_MODELS_TIP
    const tips = [...TIPS, process.platform !== "win32" ? TERMINAL_SUSPEND_TIP : INPUT_UNDO_TIP].flatMap((item) => {
      const value = typeof item === "string" ? item : item(shortcuts)
      return value ? [value] : []
    })
    return tips[Math.floor(tipOffset * tips.length)] ?? NO_MODELS_TIP
  }, NO_MODELS_TIP)
  // Solid can expose a memo's initial value while a pure computation is pending.
  const parts = createMemo(() => {
    const value = tip()
    if (typeof value === "string") return parse(value)
    return NO_MODELS_PARTS
  }, NO_MODELS_PARTS)

  return (
    <box flexDirection="row" maxWidth="100%">
      <text flexShrink={0} style={{ fg: theme.warning }}>
        ● Tip{" "}
      </text>
      <text flexShrink={1} wrapMode="word">
        <For each={parts()}>
          {(part) => <span style={{ fg: part.highlight ? theme.text : theme.textMuted }}>{part.text}</span>}
        </For>
      </text>
    </box>
  )
}

const TIPS: Tip[] = [
  "Type {highlight}@{/highlight} followed by a filename to fuzzy search and attach files",
  "Start a message with {highlight}!{/highlight} to run shell commands (e.g., {highlight}!ls -la{/highlight})",
  (shortcuts) => press(shortcuts.agentCycle(), "to cycle between Build and Plan agents"),
  "Use {highlight}/undo{/highlight} to revert the last message and file changes",
  "Use {highlight}/redo{/highlight} to restore previously undone messages and file changes",
  "Everything runs on this machine: models, sessions, and tools never leave your computer",
  "Drag and drop images or PDFs into the terminal as context (if the loaded model supports vision)",
  (shortcuts) => press(shortcuts.inputPaste(), "to paste images from your clipboard into the prompt"),
  (shortcuts) => `Use ${commandText("/editor", shortcuts.editorOpen())} to compose messages in your external editor`,
  "Run {highlight}/init{/highlight} to auto-generate project rules based on your codebase",
  (shortcuts) => `Use ${commandText("/models", shortcuts.modelList())} to pick a local model, then the quant to load`,
  "In the model picker, {highlight}★{/highlight} marks the model and quant recommended for your RAM",
  "The quant picker shows file size, whether it fits in memory, and estimated tokens per second",
  "Picking a quant that is not downloaded yet fetches it and reloads the local server on the same port",
  (shortcuts) => `Use ${commandText("/themes", shortcuts.themeList())} to switch between ${themeCount} built-in themes`,
  (shortcuts) => `Use ${commandText("/new", shortcuts.sessionNew())} to start a fresh conversation session`,
  (shortcuts) => `Use ${commandText("/sessions", shortcuts.sessionList())} to list, pin, and continue sessions`,
  (shortcuts) => press(shortcuts.sessionPinToggle(), "in the session list to pin one at the top"),
  (shortcuts) =>
    shortcuts.sessionQuickSwitch1() && shortcuts.sessionQuickSwitch9()
      ? `Use ${shortcutText(shortcuts.sessionQuickSwitch1())} through ${shortcutText(shortcuts.sessionQuickSwitch9())} to switch pinned sessions`
      : undefined,
  "Run {highlight}/compact{/highlight} to summarize long sessions near the model's context limit",
  "Local models have smaller context windows than cloud ones; compact early and keep prompts focused",
  (shortcuts) => `Use ${commandText("/export", shortcuts.sessionExport())} to save the conversation as Markdown`,
  (shortcuts) => press(shortcuts.messagesCopy(), "to copy the assistant's last message to clipboard"),
  (shortcuts) => press(shortcuts.commandList(), "to see all available actions and commands"),
  (shortcuts) => `The leader key is ${shortcutText(shortcuts.leader())}; combine with other keys for quick actions`,
  (shortcuts) => press(shortcuts.modelCycleRecent(), "to quickly switch between recently used models"),
  (shortcuts) => press(shortcuts.sessionSidebarToggle(), "in a session to show or hide the sidebar panel"),
  (shortcuts) =>
    shortcuts.messagesPageUp() && shortcuts.messagesPageDown()
      ? `Use ${shortcutText(shortcuts.messagesPageUp())}/${shortcutText(shortcuts.messagesPageDown())} to navigate through conversation history`
      : undefined,
  (shortcuts) => press(shortcuts.messagesFirst(), "to jump to the beginning of the conversation"),
  (shortcuts) => press(shortcuts.messagesLast(), "to jump to the most recent message"),
  (shortcuts) => press(shortcuts.inputNewline(), "to add newlines in your prompt"),
  (shortcuts) => press(shortcuts.inputClear(), "when typing to clear the input field"),
  (shortcuts) => press(shortcuts.sessionInterrupt(), "to stop the model mid-response"),
  "Switch to {highlight}Plan{/highlight} agent for suggestions without making changes",
  "Use {highlight}@agent-name{/highlight} in prompts to invoke specialized subagents",
  (shortcuts) => {
    const items = [
      shortcuts.sessionParent(),
      shortcuts.childFirst(),
      shortcuts.childPrevious(),
      shortcuts.childNext(),
    ].filter(Boolean)
    if (!items.length) return undefined
    return `Use ${items.map(shortcutText).join(" / ")} for parent/child sessions`
  },
  "Create {highlight}localcode.json{/highlight} for agent settings, and {highlight}tui.json{/highlight} for the TUI",
  "Project-local config lives in {highlight}.localcode-agent/{/highlight} at the root of your repo",
  "Add {highlight}$schema{/highlight} to your config for autocomplete in your editor",
  "Configure {highlight}model{/highlight} in {highlight}localcode.json{/highlight} to set the model loaded at startup",
  "Override any keybind in {highlight}tui.json{/highlight} via the {highlight}keybinds{/highlight} section",
  "Set any keybind to {highlight}none{/highlight} to disable it completely",
  "Configure local MCP servers in the {highlight}mcp{/highlight} config section",
  "Add {highlight}.md{/highlight} files to {highlight}.localcode-agent/commands/{/highlight} for reusable prompts",
  "Use {highlight}$ARGUMENTS{/highlight}, {highlight}$1{/highlight}, {highlight}$2{/highlight} in custom commands for dynamic input",
  "Use backticks to inject shell output (e.g., {highlight}`git status`{/highlight})",
  "Add {highlight}.md{/highlight} files to {highlight}.localcode-agent/agents/{/highlight} for specialized agent personas",
  "Configure per-agent permissions for {highlight}edit{/highlight} and {highlight}bash{/highlight} tools",
  'Use patterns like {highlight}"git *": "allow"{/highlight} for granular bash permissions',
  'Set {highlight}"rm -rf *": "deny"{/highlight} to block destructive commands',
  'Configure {highlight}"git push": "ask"{/highlight} to require approval before pushing',
  'Set {highlight}"formatter": true{/highlight} to enable built-in formatters',
  'Set {highlight}"formatter": false{/highlight} to disable inherited formatters',
  "Define custom formatter commands with file extensions in config",
  'Set {highlight}"lsp": true{/highlight} to enable built-in LSP code analysis',
  "Create {highlight}.ts{/highlight} files in {highlight}.localcode-agent/tools/{/highlight} to define new tools for the model",
  "Tool definitions can invoke scripts written in Python, Go, etc",
  "Add {highlight}.ts{/highlight} files to {highlight}.localcode-agent/plugins/{/highlight} for event hooks",
  "Use plugins to send OS notifications when sessions complete",
  "Create a plugin to prevent localcode from reading sensitive files",
  "Use {highlight}localcode -s <id>{/highlight} to resume a session; the id is printed when you exit",
  "Use {highlight}localcode --continue{/highlight} to resume the last session",
  "Smaller quants load faster and leave more room for context; larger quants answer more accurately",
  "Close memory-hungry apps before loading a large model: the fit badge in the quant picker assumes free RAM",
  'Use {highlight}"theme": "system"{/highlight} to match your terminal\'s colors',
  "Create JSON theme files in {highlight}.localcode-agent/themes/{/highlight} directory",
  "Themes support dark/light variants for both modes",
  "Use numeric xterm color codes 0-255 in custom theme JSON",
  "Use {highlight}{env:VAR_NAME}{/highlight} for environment variables in config",
  "Use {highlight}{file:path}{/highlight} to include file contents in config values",
  "Use {highlight}instructions{/highlight} in config to load additional rules files",
  "Set agent {highlight}temperature{/highlight} from 0.0 (focused) to 1.0 (creative)",
  "Configure {highlight}steps{/highlight} to limit agentic iterations per request",
  'Set {highlight}"tools": {"bash": false}{/highlight} to disable specific tools',
  'Set {highlight}"mcp_*": false{/highlight} to disable all tools from an MCP server',
  "Override global tool settings per agent configuration",
  "Permission {highlight}doom_loop{/highlight} prevents infinite tool call loops",
  "Permission {highlight}external_directory{/highlight} protects files outside project",
  (shortcuts) => `Use ${commandText("/status", shortcuts.statusView())} to see the loaded model, MCP, and LSP state`,
  "Use {highlight}--print-logs{/highlight} flag to see detailed logs in stderr",
  (shortcuts) => `Use ${commandText("/timeline", shortcuts.sessionTimeline())} to jump to specific messages`,
  (shortcuts) => press(shortcuts.messagesToggleConceal(), "to toggle code block visibility in messages"),
  "Enable {highlight}scroll_acceleration{/highlight} in {highlight}tui.json{/highlight} for smooth scrolling",
  (shortcuts) =>
    shortcuts.commandList()
      ? `Toggle username display in chat via the command palette (${shortcutText(shortcuts.commandList())})`
      : "Toggle username display in chat via the command palette",
  "Commit your project's {highlight}AGENTS.md{/highlight} file to Git for team sharing",
  "Use {highlight}/review{/highlight} to review uncommitted changes, branches, or PRs",
  (shortcuts) => `Use ${commandText("/help", shortcuts.helpShow())} to show the help dialog`,
  "Use {highlight}/rename{/highlight} to rename the current session",
]

const INPUT_UNDO_TIP: Tip = (shortcuts) => press(shortcuts.inputUndo(), "to undo changes in your prompt")
const TERMINAL_SUSPEND_TIP: Tip = (shortcuts) =>
  press(shortcuts.terminalSuspend(), "to suspend the terminal and return to your shell")

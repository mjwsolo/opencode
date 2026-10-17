import { useTerminalDimensions } from "@opentui/solid"
import { TextareaRenderable } from "@opentui/core"
import { createSignal, onMount } from "solid-js"
import path from "node:path"
import { useDialog } from "../ui/dialog"
import { useTheme } from "../context/theme"
import { useToast } from "../ui/toast"
import { useConfig } from "../config"
import { Keymap } from "../context/keymap"
import { loadProjectContext, saveProjectContext } from "../util/project-context"

/** Edit the project's LOCALCODE.md in place: ctrl+s saves, enter adds a line, esc cancels. */
export function DialogProjectContext(props: { document: Awaited<ReturnType<typeof loadProjectContext>> }) {
  const dimensions = useTerminalDimensions()
  const dialog = useDialog()
  const theme = useTheme()
  const toast = useToast()
  const config = useConfig().data
  const [editor, setEditor] = createSignal<TextareaRenderable>()
  const [saving, setSaving] = createSignal(false)
  async function save() {
    const target = editor()
    if (saving() || !target) return
    setSaving(true)
    try {
      await saveProjectContext(props.document, target.plainText)
      dialog.clear()
      toast.show({
        variant: "success",
        title: "Project context saved",
        message: "Saved. Use --context full to include project instructions, or ask to read LOCALCODE.md for a specific task.",
      })
    } catch (error) {
      toast.show({ variant: "error", title: "Could not save project context", message: String(error) })
    } finally {
      setSaving(false)
    }
  }
  Keymap.createLayer(() => ({
    mode: "modal",
    target: editor,
    enabled: editor() !== undefined,
    priority: 1,
    commands: [
      { bind: "ctrl+s", title: "Save project context", group: "Dialog", run: () => void save() },
      { bind: "return", title: "New line", group: "Dialog", run: () => editor()?.insertText("\n") },
    ],
  }))
  Keymap.createLayer(() => ({
    mode: "modal",
    priority: 1,
    commands: [{ bind: "escape", title: "Cancel", group: "Dialog", run: () => dialog.clear() }],
  }))
  onMount(() => {
    dialog.setSize("large")
    setTimeout(() => {
      if (!editor()?.isDestroyed) editor()?.focus()
    }, 1)
  })
  return (
    <box paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <text fg={theme.text.base}>
        <span style={{ bold: true }}>Project context</span>
      </text>
      <text fg={theme.text.muted}>{path.basename(props.document.file)} · saved instructions for this project</text>
      <textarea
        ref={setEditor}
        height={Math.max(2, Math.min(14, Math.floor(dimensions().height * 0.75) - 10))}
        initialValue={props.document.content}
        placeholder="Add project conventions, build commands, and useful background…"
        textColor={theme.text.base}
        focusedTextColor={theme.text.base}
        placeholderColor={theme.text.muted}
        cursorStyle={config.cursor}
        cursorColor={theme.text.base}
      />
      <box flexDirection="row" gap={3}>
        <text fg={theme.hue.interactive[200]} onMouseUp={() => void save()}>
          {saving() ? "Saving…" : "Save · ctrl+s"}
        </text>
        <text fg={theme.text.muted} onMouseUp={() => dialog.clear()}>
          Cancel · esc
        </text>
        <text fg={theme.text.muted}>enter new line</text>
      </box>
    </box>
  )
}

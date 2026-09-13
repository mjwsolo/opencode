import { useTerminalDimensions } from "@opentui/solid"
import { TextareaRenderable } from "@opentui/core"
import { createSignal, onMount } from "solid-js"
import path from "node:path"
import { useDialog } from "../ui/dialog"
import { useTheme } from "../context/theme"
import { useToast } from "../ui/toast"
import { useTuiConfig } from "../config"
import { useBindings } from "../keymap"
import { loadProjectContext, saveProjectContext } from "../util/project-context"

export function DialogProjectContext(props: { document: Awaited<ReturnType<typeof loadProjectContext>> }) {
  const dimensions = useTerminalDimensions()
  const dialog = useDialog()
  const { theme } = useTheme()
  const toast = useToast()
  const config = useTuiConfig()
  const [editor, setEditor] = createSignal<TextareaRenderable>()
  const [saving, setSaving] = createSignal(false)
  async function save() {
    if (saving() || !editor()) return
    setSaving(true)
    try {
      await saveProjectContext(props.document, editor()!.plainText)
      dialog.clear()
      toast.show({
        variant: "success",
        title: "Project context saved",
        message: "Used for future replies. Start /new to clear older context from this chat.",
      })
    } catch (error) {
      toast.show({ variant: "error", title: "Could not save project context", message: String(error) })
    } finally {
      setSaving(false)
    }
  }
  useBindings(() => ({
    target: editor,
    priority: 1,
    bindings: [
      { key: "ctrl+s", desc: "Save project context", group: "Dialog", cmd: () => void save() },
      { key: "enter", desc: "New line", group: "Dialog", cmd: () => editor()?.insertText("\n") },
    ],
  }))
  onMount(() => {
    dialog.setSize("large")
    setTimeout(() => {
      if (!editor()?.isDestroyed) editor()?.focus()
    }, 1)
  })
  return (
    <box paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <text fg={theme.text}>
        <span style={{ bold: true }}>Project context</span>
      </text>
      <text fg={theme.textMuted}>{path.basename(props.document.file)} · saved instructions for this project</text>
      <textarea
        ref={setEditor}
        height={Math.max(2, Math.min(14, Math.floor(dimensions().height * 0.75) - 10))}
        initialValue={props.document.content}
        placeholder="Add project conventions, build commands, and useful background…"
        textColor={theme.text}
        focusedTextColor={theme.text}
        placeholderColor={theme.textMuted}
        cursorStyle={config.cursor}
        cursorColor={theme.text}
      />
      <box flexDirection="row" gap={3}>
        <text fg={theme.primary} onMouseUp={() => void save()}>
          {saving() ? "Saving…" : "Save · ctrl+s"}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          Cancel · esc
        </text>
        <text fg={theme.textMuted}>enter new line</text>
      </box>
    </box>
  )
}

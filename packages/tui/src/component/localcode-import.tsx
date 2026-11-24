/**
 * /import: bring MCP servers and skills over from Claude Code, Codex and Cursor. The supervisor reads
 * those user-level files only now, because the user asked (GET /import/detect). Nothing is checked by
 * default; servers arrive switched off. Secret values never reach this process, only names.
 */
import { createSignal, For, Show } from "solid-js"
import { DialogHeader, DialogLayout, useDialog } from "../ui/dialog"
import { useTheme } from "../context/theme"
import { Keymap } from "../context/keymap"
import { useToast } from "../ui/toast"
import { getJSON, postJSON } from "../util/localcode"
import { groupImportItems, importSummary, truncateEnd, type ImportItem } from "./localcode-import-model"

type Detect = { items: ImportItem[]; notes: string[] }
type Applied = { servers: string[]; skills: string[]; backup: string | null }

export function DialogImport() {
  const dialog = useDialog()
  const toast = useToast()
  const theme = useTheme().surface("dialog")
  const [items, setItems] = createSignal<ImportItem[]>()
  const [notes, setNotes] = createSignal<string[]>([])
  const [error, setError] = createSignal<string>()
  const [cursor, setCursor] = createSignal(0)
  const [checked, setChecked] = createSignal<ReadonlySet<string>>(new Set())
  const [confirming, setConfirming] = createSignal(false)
  const [busy, setBusy] = createSignal(false)

  getJSON<Detect>("/import/detect")
    .then((d) => {
      setItems(d.items)
      setNotes(d.notes)
    })
    .catch((e) => setError(e instanceof Error ? e.message : String(e)))

  const flat = () => groupImportItems(items() ?? []).flatMap((g) => g.items)
  const chosen = () => flat().filter((i) => checked().has(i.id))
  const move = (d: number) => {
    const n = flat().length
    if (n) setCursor((c) => (c + d + n) % n)
  }
  const toggle = () => {
    const it = flat()[cursor()]
    if (!it || it.status === "exists") return
    setChecked((prev) => {
      const next = new Set(prev)
      if (!next.delete(it.id)) next.add(it.id)
      return next
    })
  }
  const apply = async () => {
    if (busy()) return
    setBusy(true)
    try {
      const res = await postJSON<Applied>("/import/apply", { items: chosen().map((i) => i.id) })
      dialog.clear()
      toast.show({
        variant: "success",
        title: "Imported",
        message:
          [
            res.servers.length ? `${res.servers.length} MCP server(s), switched off (turn on in /mcps)` : "",
            res.skills.length ? `${res.skills.length} skill(s)` : "",
          ]
            .filter(Boolean)
            .join(" and ") || "Nothing new to add",
        duration: 8000,
      })
      if (res.backup) toast.show({ variant: "info", message: `Your previous config was saved to ${res.backup}`, duration: 8000 })
    } catch (e) {
      setBusy(false)
      setConfirming(false)
      toast.show({ variant: "error", title: "Import failed", message: e instanceof Error ? e.message : String(e) })
    }
  }

  Keymap.createLayer(() => ({
    mode: "modal",
    commands: [
      { bind: "up", title: "Previous", group: "Dialog", run: () => move(-1) },
      { bind: "down", title: "Next", group: "Dialog", run: () => move(1) },
      { bind: "space", title: "Toggle", group: "Dialog", run: () => !confirming() && toggle() },
      {
        bind: "return",
        title: "Continue",
        group: "Dialog",
        run: () => {
          if (confirming()) return void apply()
          if (chosen().length) setConfirming(true)
          else toast.show({ variant: "info", message: "Press space to pick what to import first", duration: 3000 })
        },
      },
      // Esc cancels at every step (the dialog's own escape closes it); going back is left/backspace.
      { bind: "left", title: "Back", group: "Dialog", run: () => setConfirming(false) },
    ],
  }))

  const row = (it: ImportItem) => {
    const idx = flat().findIndex((x) => x.id === it.id)
    const focused = () => idx === cursor()
    const box = () => (it.status === "exists" ? "[=]" : checked().has(it.id) ? "[x]" : "[ ]")
    const detail = () => {
      if (it.kind === "mcp") {
        const what = it.command ?? it.url ?? ""
        return `${focused() ? what : truncateEnd(what, 44)} · starts off`
      }
      return `${it.size} · about ${it.tokens} tokens in every request${it.has_scripts ? " · has scripts" : ""}`
    }
    return (
      <box>
        <text fg={focused() ? theme.text.base : theme.text.muted} wrapMode={focused() ? "word" : "none"}>
          {focused() ? "> " : "  "}
          {box()} {it.name}
          {it.status === "clash" ? ` (name taken, will be ${it.suggestion})` : it.status === "exists" ? " (already there)" : ""}
        </text>
        <text fg={theme.text.muted} wrapMode={focused() ? "word" : "none"}>
          {"      "}
          {detail()}
        </text>
        <Show when={focused() && (it.env_names?.length || it.header_names?.length)}>
          <text fg={theme.text.muted} wrapMode="word">
            {"      "}
            {it.env_names?.length ? `environment: ${it.env_names.join(", ")} (values stay hidden)` : `headers: ${it.header_names!.join(", ")} (values stay hidden)`}
          </text>
        </Show>
      </box>
    )
  }

  return (
    <DialogLayout
      header={<DialogHeader title={confirming() ? "Import these?" : "Import from other agents"} closeLabel="esc: cancel" />}
      footer={{
        actions: {
          primary: [
            { title: confirming() ? "import" : "continue", key: "enter", onTrigger: () => {} },
          ],
          secondary: confirming() ? [] : [{ title: "toggle", key: "space", onTrigger: toggle }],
        },
      }}
      legacyFooter={<box />}
    >
      <Show when={!error()} fallback={<text fg={theme.text.muted}>Could not read the import list: {error()}</text>}>
        <Show when={items()} fallback={<text fg={theme.text.muted}>Looking for Claude Code, Codex and Cursor settings…</text>}>
          <Show
            when={!confirming()}
            fallback={
              <box>
                <For each={importSummary(chosen())}>{(l) => <text fg={theme.text.base}>{l}</text>}</For>
                <text fg={theme.text.muted} wrapMode="word">
                  These will be added, switched off. Turn MCP servers on in /mcps.
                </text>
              </box>
            }
          >
            <Show when={flat().length} fallback={<text fg={theme.text.muted}>No user-level settings found in Claude Code, Codex or Cursor.</text>}>
              <For each={groupImportItems(items()!)}>
                {(g) => (
                  <box>
                    <text fg={theme.text.base}>{g.label}</text>
                    <For each={g.items}>{(it) => row(it)}</For>
                  </box>
                )}
              </For>
              <For each={notes()}>{(n) => <text fg={theme.text.muted} wrapMode="word">Note: {n}</text>}</For>
            </Show>
          </Show>
        </Show>
      </Show>
    </DialogLayout>
  )
}

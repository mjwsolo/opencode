import { onMount } from "solid-js"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import {
  addServer,
  commandLine,
  parseCommand,
  readConfig,
  userConfigFile,
  validateName,
  validateRemote,
  type McpSpec,
} from "../util/mcp-config"

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Add a server without editing files: name, local or remote, command or URL, then confirm. It is saved disabled. */
export function DialogMcpAdd(props: { onDone: (name?: string) => void }) {
  const dialog = useDialog()
  const toast = useToast()
  const file = userConfigFile()

  const back = () => props.onDone()
  // DialogConfirm clears the dialog after its callbacks run, so follow-up dialogs open on the next tick.
  const later = (fn: () => void) => setTimeout(fn, 0)

  const askName = (value = "") => {
    dialog.replace(() => (
      <DialogPrompt
        title="Add MCP server: name"
        placeholder="for example: github"
        value={value}
        onCancel={back}
        onConfirm={(raw) => {
          const name = raw.trim()
          let bad: string | undefined
          try {
            bad = validateName(name, readConfig(file))
          } catch (e) {
            bad = message(e)
          }
          if (bad) return void toast.show({ variant: "error", message: bad })
          askType(name)
        }}
      />
    ))
  }

  const askType = (name: string) => {
    dialog.replace(() => (
      <DialogSelect
        title={`Add ${name}: local or remote?`}
        options={[
          { title: "Local", value: "local", description: "A program that runs on your Mac" },
          { title: "Remote", value: "remote", description: "A server you connect to by URL" },
        ]}
        onSelect={(option) => (option.value === "local" ? askCommand(name) : askUrl(name))}
      />
    ))
  }

  const askCommand = (name: string, value = "") => {
    dialog.replace(() => (
      <DialogPrompt
        title={`Add ${name}: command`}
        placeholder="for example: npx -y @modelcontextprotocol/server-filesystem ."
        value={value}
        onCancel={back}
        onConfirm={(line) => {
          let command: string[]
          try {
            command = parseCommand(line)
          } catch (e) {
            return void toast.show({ variant: "error", message: message(e) })
          }
          if (!command.length) return void toast.show({ variant: "error", message: "Enter the command to run" })
          confirmSave(
            name,
            { type: "local", command, enabled: false },
            `Will run on your Mac when you enable it:\n\n  ${commandLine(command)}`,
            () => askCommand(name, line),
          )
        }}
      />
    ))
  }

  const askUrl = (name: string, value = "") => {
    dialog.replace(() => (
      <DialogPrompt
        title={`Add ${name}: URL`}
        placeholder="https://example.com/mcp"
        value={value}
        onCancel={back}
        onConfirm={(raw) => {
          const url = raw.trim()
          const bad = validateRemote(url)
          if (bad) return void toast.show({ variant: "error", message: bad })
          confirmSave(name, { type: "remote", url, enabled: false }, `Will connect to:\n\n  ${url}`, () => askUrl(name, url))
        }}
      />
    ))
  }

  const confirmSave = (name: string, spec: McpSpec, text: string, edit: () => void) => {
    dialog.replace(() => (
      <DialogConfirm
        title={`Save ${name}?`}
        message={`${text}\n\nIt is saved disabled; enable it from the list.`}
        label={{ confirm: "Save", cancel: "Edit" }}
        onConfirm={() => {
          try {
            addServer(file, name, spec)
            toast.show({ variant: "success", message: `Added ${name} (disabled)` })
            later(() => props.onDone(name))
          } catch (e) {
            toast.show({ variant: "error", message: message(e) })
            later(back)
          }
        }}
        onCancel={() => later(edit)}
      />
    ))
  }

  onMount(() => askName())
  return <box />
}

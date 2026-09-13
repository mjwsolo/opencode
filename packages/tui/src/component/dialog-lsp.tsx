/**
 * /lsp — language servers. localcode never downloads a language server on its own;
 * this list shows every server the build knows, whether it is installed, and what
 * installing would fetch. Enter on one asks first, then installs and starts it.
 */
import { createResource, Show } from "solid-js"
import { DialogSelect } from "../ui/dialog-select"
import { DialogConfirm } from "../ui/dialog-confirm"
import { useDialog } from "../ui/dialog"
import { useSDK } from "../context/sdk"
import { useToast } from "../ui/toast"
import { useTheme } from "../context/theme"
import { useProject } from "../context/project"

type Entry = { id: string; extensions: string[]; installed: boolean; status: "connected" | "starting" | "error" | "idle"; download: string }

export function DialogLsp() {
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()
  const project = useProject()
  const { theme } = useTheme()
  const workspace = () => project.workspace.current()
  const [data, { refetch }] = createResource(async () => {
    const r = await sdk.client.lsp.catalog({ workspace: workspace() })
    return (r.data ?? []) as Entry[]
  })

  async function install(e: Entry) {
    const ok = await new Promise<boolean>((resolve) => {
      dialog.replace(() => (
        <DialogConfirm
          title={`Install the ${e.id} language server?`}
          message={`This downloads: ${e.download}.\nIt runs locally for ${e.extensions.join(" ")} files in this project. Nothing else is fetched.`}
          confirmLabel="Download and start"
          onConfirm={() => resolve(true)}
          onCancel={() => resolve(false)}
        />
      ))
    })
    if (!ok) {
      dialog.replace(() => <DialogLsp />)
      return
    }
    dialog.clear()
    toast.show({ variant: "info", title: "Language server", message: `Installing ${e.id}… (downloading if needed)`, duration: 10 * 60_000 })
    try {
      const r = await sdk.client.lsp.install({ workspace: workspace(), lspInstallInput: { id: e.id } })
      const res = (r.data ?? { ok: false, error: `HTTP ${(r as any).response?.status ?? "?"}` }) as { ok: boolean; error?: string }
      if (!res.ok) throw new Error(res.error ?? "install failed")
      toast.show({ variant: "success", title: "Language server", message: `${e.id} is running for this project`, duration: 5000 })
    } catch (err) {
      toast.show({ variant: "error", title: "Language server", message: String(err).replace(/^Error:\s*/, ""), duration: 8000 })
    }
  }

  const options = () =>
    (data() ?? []).map((e) => ({
      value: e.id,
      title: e.id,
      titleView: (
        <span>
          {e.id}
          {"   "}
          <span
            style={{
              fg:
                e.status === "connected"
                  ? theme.success
                  : e.status === "starting"
                    ? theme.warning
                    : e.status === "error"
                      ? theme.error
                      : e.installed
                        ? theme.success
                        : theme.textMuted,
            }}
          >
            {e.status === "connected"
              ? "running"
              : e.status === "starting"
                ? "starting…"
                : e.status === "error"
                  ? "failed to start"
                  : e.installed
                    ? "installed"
                    : "not installed"}
          </span>
        </span>
      ),
      description: `${e.extensions.slice(0, 6).join(" ")}${e.extensions.length > 6 ? " …" : ""}   ${e.download}`,
      onSelect: () => {
        if (e.status === "connected") {
          toast.show({ variant: "info", title: "Language server", message: `${e.id} is already running`, duration: 3000 })
          dialog.clear()
          return
        }
        void install(e)
      },
    }))

  return (
    <Show when={!data.error} fallback={<DialogSelect title="Language servers" options={[]} emptyView={<text>Could not list language servers: {String(data.error)}</text>} />}>
      <DialogSelect<string>
        title={data.loading ? "Language servers — loading…" : "Language servers  (enter installs or starts one)"}
        options={options()}
        footerHints={[{ title: "enter", label: "install / start" }, { title: "esc", label: "back" }]}
        onFilter={() => void refetch}
      />
    </Show>
  )
}

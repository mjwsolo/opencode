import { Plugin } from "@opencode/plugin/tui"
import type { LocationRef } from "@opencode/client"
import { LspRpc } from "@opencode/schema/lsp-rpc"
import { createMemo, createResource, For, onCleanup, Show } from "solid-js"

type Status = { enabled: boolean; servers: readonly LspRpc.Status[] }

const rpc = (context: Plugin.Context) => context.client.rpc(LspRpc.Definition)

export async function lspStatus(context: Plugin.Context, location?: LocationRef): Promise<Status> {
  return (await rpc(context).status({}, { location })) as Status
}

/** The code-intelligence panel: servers starting, running or failed, never silently absent. */
export function SidebarLsp(props: { context: Plugin.Context; sessionID: string }) {
  const theme = props.context.theme
  const [view, updateView] = props.context.storage.store("view", { initial: { open: true } })
  const location = createMemo(() => props.context.data.session.get(props.sessionID)?.location)
  const [state, { refetch }] = createResource(location, (value) => lspStatus(props.context, value).catch(() => undefined))
  const stop = rpc(props.context).events.on("updated", () => void refetch())
  onCleanup(stop)
  const list = createMemo(() => state()?.servers ?? [])
  const color = (status: string) =>
    status === "connected"
      ? theme.text.feedback.success.base
      : status === "starting"
        ? theme.text.feedback.warning.base
        : theme.text.feedback.error.base

  return (
    <Show when={state()}>
      <box>
        <box
          flexDirection="row"
          gap={1}
          onMouseDown={() => {
            if (list().length <= 2) return
            void updateView((draft) => {
              draft.open = !draft.open
            }).catch(() => {})
          }}
        >
          <Show when={list().length > 2}>
            <text fg={theme.text.base}>{view.open ? "▼" : "▶"}</text>
          </Show>
          <text fg={theme.text.base}>
            <b>Code intelligence</b>
          </text>
        </box>
        <Show when={list().length <= 2 || view.open}>
          <Show when={list().length === 0}>
            <text fg={theme.text.muted}>{state()?.enabled ? "Not running · /lsp to set up" : "LSPs are disabled"}</text>
          </Show>
          <For each={list()}>
            {(item) => (
              <box flexDirection="row" gap={1}>
                <text flexShrink={0} style={{ fg: color(item.status) }}>
                  •
                </text>
                <text fg={theme.text.muted} wrapMode="word">
                  {item.id} {item.root}
                  {item.status === "starting" ? " · setting up…" : item.status === "error" ? " · failed to start — /lsp" : ""}
                </text>
              </box>
            )}
          </For>
        </Show>
      </box>
    </Show>
  )
}

const label = (entry: LspRpc.CatalogEntry) =>
  entry.status === "connected"
    ? "running"
    : entry.status === "starting"
      ? "starting…"
      : entry.status === "error"
        ? "failed to start"
        : entry.installed
          ? "installed"
          : "not installed"

/** The download size from what a server fetches ("npm: pyright (~15 MB)" -> "≈ 15 MB"). */
export function downloadSize(download: string) {
  const size = /~\s*(\d+(?:\.\d+)?)\s*([KMG]B)/.exec(download)
  if (size) return `≈ ${size[1]} ${size[2]}`
  if (/nothing downloaded/i.test(download)) return "no download"
  return "size varies"
}

/**
 * One row per server. The status and, for a server that is not installed, its download size sit
 * in the row's right column, which is never truncated; what the download fetches follows the
 * extensions and is shown in full when installing asks for confirmation.
 */
export function lspOptions(catalog: readonly LspRpc.CatalogEntry[]) {
  return catalog.map((entry) => {
    const missing = !entry.installed && entry.status !== "connected"
    return {
      title: entry.id,
      value: entry.id,
      footer: missing ? `${label(entry)} · ${downloadSize(entry.download)}` : label(entry),
      description: `${entry.extensions.slice(0, 6).join(" ")}${entry.extensions.length > 6 ? " …" : ""}   ${entry.download}`,
    }
  })
}

/**
 * /lsp: every language server this build knows, whether it is installed, and what installing it
 * would fetch. LocalCode never downloads one on its own; choosing one asks first, showing the download.
 */
export async function chooseLsp(context: Plugin.Context, location?: LocationRef) {
  let catalog: readonly LspRpc.CatalogEntry[]
  try {
    catalog = (await rpc(context).catalog({}, { location })) as readonly LspRpc.CatalogEntry[]
  } catch (error) {
    context.ui.toast.show({ variant: "error", title: "Language servers", message: `Could not list language servers: ${String(error)}` })
    return
  }
  const id = await context.ui.dialog.select<string>({
    title: "Language servers  (enter installs or starts one)",
    options: lspOptions(catalog),
  })
  const entry = catalog.find((item) => item.id === id)
  if (!entry) return
  if (entry.status === "connected") {
    context.ui.toast.show({ variant: "info", title: "Language server", message: `${entry.id} is already running`, duration: 3000 })
    return
  }
  const confirmed = await context.ui.dialog.confirm({
    title: `Install the ${entry.id} language server?`,
    message: `This downloads: ${entry.download}.\nIt runs locally for ${entry.extensions.join(" ")} files in this project. Nothing else is fetched.`,
    label: { confirm: "Download and start" },
  })
  if (confirmed !== true) return void chooseLsp(context, location)
  context.ui.toast.show({
    variant: "info",
    title: "Language server",
    message: `Installing ${entry.id}… (downloading if needed)`,
    duration: 10 * 60_000,
  })
  try {
    const result = (await rpc(context).install({ id: entry.id }, { location })) as LspRpc.InstallResult
    if (!result.ok) throw new Error(result.error ?? "install failed")
    context.ui.toast.show({ variant: "success", title: "Language server", message: `${entry.id} is running for this project`, duration: 5000 })
  } catch (error) {
    context.ui.toast.show({
      variant: "error",
      title: "Language server",
      message: String(error).replace(/^Error:\s*/, ""),
      duration: 8000,
    })
  }
}

export default Plugin.define({
  id: "opencode.sidebar.lsp",
  setup(context) {
    context.ui.slot({
      append: "sidebar.content",
      render: (props) => <SidebarLsp context={context} sessionID={props.sessionID} />,
    })
    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "lsp.list",
          title: "Language servers: install or start one",
          group: "Session",
          palette: true,
          slash: { name: "lsp" },
          run: () => {
            const route = context.ui.router.current()
            const location =
              route.type === "session" ? context.data.session.get(route.sessionID)?.location : context.data.location.default()
            void chooseLsp(context, location)
          },
        },
      ],
    }))
  },
})

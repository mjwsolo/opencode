import { useTheme } from "../context/theme"
import { DialogHeader, DialogLayout } from "../ui/dialog"
import { useData } from "../context/data"
import { useClient } from "../context/client"
import { LspRpc } from "@opencode/schema/lsp-rpc"
import { For, Match, Switch, Show, createMemo, createResource } from "solid-js"

export function DialogStatus() {
  const data = useData()
  const theme = useTheme().surface("dialog")

  const client = useClient()
  const mcp = createMemo(() => data.location.mcp.server.list() ?? [])
  const [lsp] = createResource(() =>
    client.api
      .rpc(LspRpc.Definition)
      .status({}, { location: data.location.default() })
      .then((value: unknown) => (value as { servers: readonly LspRpc.Status[] }).servers)
      .catch(() => [] as readonly LspRpc.Status[]),
  )
  const color = (status: string) => {
    if (status === "connected") return theme.text.feedback.success.base
    if (status === "failed") return theme.text.feedback.error.base
    if (status === "needs_auth") return theme.text.feedback.warning.base
    return theme.text.muted
  }
  return (
    <DialogLayout header={<DialogHeader title="Status" />}>
      <Show when={mcp().length > 0} fallback={<text fg={theme.text.base}>No MCP servers</text>}>
        <box>
          <text fg={theme.text.base}>
            {mcp().length} MCP server{mcp().length === 1 ? "" : "s"}
          </text>
          <For each={mcp()}>
            {(item) => (
              <box flexDirection="row" gap={1}>
                <text flexShrink={0} style={{ fg: color(item.status.status) }}>
                  •
                </text>
                <text fg={theme.text.base} wrapMode="word">
                  <b>{item.name}</b>{" "}
                  <span style={{ fg: theme.text.muted }}>
                    <Switch fallback={item.status.status}>
                      <Match when={item.status.status === "connected"}>Connected</Match>
                      <Match when={item.status.status === "failed" && item.status}>{(val) => val().error}</Match>
                      <Match when={item.status.status === "disabled"}>Disabled in configuration</Match>
                      <Match when={item.status.status === "needs_auth" && item.status}>
                        {(val) => `Needs authentication: ${val().error}`}
                      </Match>
                    </Switch>
                  </span>
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>
      <Show when={(lsp() ?? []).length > 0}>
        <box>
          <text fg={theme.text.base}>{lsp()!.length} LSP Servers</text>
          <For each={lsp()}>
            {(item) => (
              <box flexDirection="row" gap={1}>
                <text
                  flexShrink={0}
                  style={{
                    fg:
                      item.status === "connected"
                        ? theme.text.feedback.success.base
                        : item.status === "starting"
                          ? theme.text.feedback.warning.base
                          : theme.text.feedback.error.base,
                  }}
                >
                  •
                </text>
                <text fg={theme.text.base} wrapMode="word">
                  <b>{item.id}</b> <span style={{ fg: theme.text.muted }}>{item.root}</span>
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>
    </DialogLayout>
  )
}

export * as LspRpc from "./lsp-rpc.js"

import { define } from "./rpc.js"

export type Status = {
  readonly id: string
  readonly name: string
  readonly root: string
  readonly status: "connected" | "starting" | "error"
}

/** What /lsp shows: language servers are never downloaded on their own. */
export type CatalogEntry = {
  readonly id: string
  readonly extensions: readonly string[]
  readonly installed: boolean
  readonly status: "connected" | "starting" | "error" | "idle"
  /** What installing fetches, e.g. "npm: typescript-language-server (~2 MB)". */
  readonly download: string
}

export type InstallResult = { readonly ok: boolean; readonly error?: string }

const object = (properties: Record<string, unknown> = {}, required: string[] = []) =>
  ({ type: "object", properties, required }) as const

const status = object(
  {
    id: { type: "string" },
    name: { type: "string" },
    root: { type: "string" },
    status: { type: "string", enum: ["connected", "starting", "error"] },
  },
  ["id", "name", "root", "status"],
)

/** Language-server state for the terminal UI's code-intelligence panel and /lsp; `lsp.updated` signals changes. */
export const Definition = define({
  id: "opencode.lsp",
  methods: {
    status: {
      input: object(),
      output: object({ enabled: { type: "boolean" }, servers: { type: "array", items: status } }, ["enabled", "servers"]),
    },
    catalog: {
      input: object(),
      output: {
        type: "array",
        items: object(
          {
            id: { type: "string" },
            extensions: { type: "array", items: { type: "string" } },
            installed: { type: "boolean" },
            status: { type: "string", enum: ["connected", "starting", "error", "idle"] },
            download: { type: "string" },
          },
          ["id", "extensions", "installed", "status", "download"],
        ),
      },
    },
    /** Install (downloading only now, on this explicit request) and start one server. */
    install: {
      input: object({ id: { type: "string" } }, ["id"]),
      output: object({ ok: { type: "boolean" }, error: { type: "string" } }, ["ok"]),
    },
  },
  events: {
    /** Server state changed (one started, failed, connected or was installed). */
    updated: { schema: object() },
  },
})

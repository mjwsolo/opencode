export * as LspPlugin from "./lsp.js"

import { ToolFailure } from "@opencode/ai"
import type { Context } from "@opencode/plugin/effect/plugin"
import { LspRpc } from "@opencode/schema/lsp-rpc"
import { Effect, Schema, Stream } from "effect"
import { LspEvent } from "@opencode/schema/lsp-event"
import { Bus } from "../bus.js"
import { realpathSync } from "fs"
import path from "path"
import { pathToFileURL } from "url"
import { FileAccess } from "../file-access.js"
import { Location } from "../location.js"
import type { LSPClient } from "../lsp/client.js"
import { LSP } from "../lsp/lsp.js"
import { Filesystem, flags } from "../lsp/support.js"
import { Permission } from "../permission.js"

/** Other files' errors reported after a write, as in opencode v1. */
export const MAX_PROJECT_DIAGNOSTICS_FILES = 5

const operations = [
  "goToDefinition",
  "findReferences",
  "hover",
  "documentSymbol",
  "workspaceSymbol",
  "goToImplementation",
  "prepareCallHierarchy",
  "incomingCalls",
  "outgoingCalls",
] as const

export const ToolInput = Schema.Struct({
  operation: Schema.Literals(operations).annotate({ description: "The LSP operation to perform" }),
  path: Schema.String.annotate({ description: "The absolute or relative path to the file" }),
  line: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
    description: "The line number (1-based, as shown in editors)",
  }),
  character: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
    description: "The character offset (1-based, as shown in editors)",
  }),
  query: Schema.optional(Schema.String).annotate({
    description: "Search query for workspaceSymbol. Empty string requests all symbols.",
  }),
})

const TOOL_DESCRIPTION = [
  "Query the language server for code intelligence.",
  "",
  "Operations: goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, goToImplementation, prepareCallHierarchy, incomingCalls, outgoingCalls.",
  "",
  "All take path, line and character (1-based). workspaceSymbol also takes query (empty = all symbols) and uses path only to pick the server. Errors if no server is set up for that file type.",
].join("\n")

type Diagnostics = Record<string, LSPClient.Diagnostic[]>

/** The edit tools' report of language-server errors, worded as opencode v1 worded it. */
export function diagnosticsReport(
  tool: "edit" | "write" | "patch",
  files: readonly string[],
  diagnostics: Diagnostics,
  directory: string,
) {
  const blocks: string[] = []
  if (tool === "patch") {
    for (const file of files) {
      const block = LSP.Diagnostic.report(file, diagnostics[Filesystem.normalizePath(file)] ?? [])
      if (!block) continue
      const relative = path.relative(directory, file).replaceAll("\\", "/")
      blocks.push(`LSP errors detected in ${relative}, please fix:\n${block}`)
    }
    return blocks.join("\n\n")
  }
  const current = files[0] ? Filesystem.normalizePath(files[0]) : undefined
  const own = current ? LSP.Diagnostic.report(files[0]!, diagnostics[current] ?? []) : ""
  if (own) blocks.push(`LSP errors detected in this file, please fix:\n${own}`)
  if (tool === "write") {
    let others = 0
    for (const [file, issues] of Object.entries(diagnostics)) {
      if (file === current || others >= MAX_PROJECT_DIAGNOSTICS_FILES) continue
      const block = LSP.Diagnostic.report(file, issues)
      if (!block) continue
      others++
      blocks.push(`LSP errors detected in other files:\n${block}`)
    }
  }
  return blocks.join("\n\n")
}

const stringField = (value: unknown, key: string) =>
  value && typeof value === "object" && key in value && typeof (value as Record<string, unknown>)[key] === "string"
    ? ((value as Record<string, unknown>)[key] as string)
    : undefined

/**
 * Language servers (opencode v1's LSP support): reads warm the file's server, edits report its
 * errors, the terminal UI shows server state and installs one only on an explicit /lsp request,
 * and the experimental `lsp` tool queries it.
 */
export const Plugin = {
  id: "opencode.lsp",
  effect: Effect.fn("LspPlugin")(function* (ctx: Context) {
    const lsp = yield* LSP.Service
    const location = yield* Location.Service
    const access = yield* FileAccess.Service
    const permission = yield* Permission.Service
    // Language servers see canonical paths (macOS /var is /private/var), as the location does.
    const resolve = (file: string) => {
      const absolute = FileAccess.resolvePath(location.directory, file)
      try {
        return realpathSync(absolute)
      } catch {
        return absolute
      }
    }

    const bus = yield* Bus.Service
    const registration = yield* ctx.rpc.register(LspRpc.Definition, {
      status: () =>
        Effect.gen(function* () {
          return { enabled: yield* lsp.enabled(), servers: yield* lsp.status() }
        }),
      catalog: () => lsp.catalog(),
      install: (input) => lsp.install(String((input as { id?: unknown }).id ?? "")),
    }).pipe(Effect.orDie)
    // The terminal UI refreshes its panel when server state changes.
    yield* bus.subscribe(LspEvent.Updated).pipe(
      Stream.runForEach(() => registration.events.emit("updated", {}).pipe(Effect.ignore)),
      Effect.forkScoped,
    )

    // Reads start the file's language server in the background, so errors are ready by the edit.
    yield* ctx.tool.hook("execute.after", (event) =>
      Effect.gen(function* () {
        if (event.status !== "completed") return
        if (event.tool === "read") {
          const file = stringField(event.input, "path")
          if (file) yield* lsp.touchFile(resolve(file)).pipe(Effect.ignoreCause, Effect.forkDetach)
          return
        }
        if (event.tool !== "edit" && event.tool !== "write" && event.tool !== "patch") return
        const files =
          event.tool === "patch"
            ? (((event.result.output as { applied?: { type: string; target: string }[] } | undefined)?.applied ?? [])
                .filter((item) => item.type !== "delete")
                .map((item) => item.target))
            : [stringField(event.input, "path")].filter((file): file is string => Boolean(file)).map(resolve)
        if (files.length === 0 || !(yield* lsp.enabled())) return
        yield* Effect.forEach(files, (file) => lsp.touchFile(file, "document"), { discard: true })
        const diagnostics = yield* lsp.diagnostics()
        const report = diagnosticsReport(event.tool, files, diagnostics, location.directory)
        const content = event.result.content
        event.result = {
          ...event.result,
          metadata: { ...event.result.metadata, diagnostics },
          ...(report
            ? {
                content: [
                  ...(typeof content === "string" ? [{ type: "text" as const, text: content }] : (content ?? [])),
                  { type: "text" as const, text: report },
                ],
              }
            : {}),
        }
      }).pipe(Effect.catchCause((cause) => Effect.logWarning("language server diagnostics failed", { cause }))),
    )

    // The code-intelligence tool is experimental, as in opencode v1 (OPENCODE_EXPERIMENTAL_LSP_TOOL).
    if (!flags().experimentalLspTool) return
    yield* ctx.tool
      .transform((editor) =>
        editor.add({
          name: "lsp",
          options: { codemode: false },
          description: TOOL_DESCRIPTION,
          input: ToolInput,
          execute: (input, context) =>
            Effect.gen(function* () {
              const target = yield* access.resolve({ path: input.path, kind: "file" })
              yield* access.authorizeExternal([target], context)
              const file = target.absolute
              yield* permission.assert({
                action: "lsp",
                resources: ["*"],
                save: ["*"],
                metadata:
                  input.operation === "workspaceSymbol"
                    ? { operation: input.operation }
                    : { operation: input.operation, path: file, line: input.line, character: input.character },
                sessionID: context.sessionID,
                agent: context.agent,
                source: { type: "tool", messageID: context.messageID, id: context.id },
              })
              if (!(yield* Effect.promise(() => Filesystem.exists(file))))
                return yield* Effect.fail(new ToolFailure({ message: `File not found: ${file}` }))
              if (!(yield* lsp.hasClients(file)))
                return yield* Effect.fail(new ToolFailure({ message: "No LSP server available for this file type." }))
              yield* lsp.touchFile(file, "document")
              const position = { file, line: input.line - 1, character: input.character - 1 }
              const result: unknown[] = yield* (() => {
                switch (input.operation) {
                  case "goToDefinition":
                    return lsp.definition(position)
                  case "findReferences":
                    return lsp.references(position)
                  case "hover":
                    return lsp.hover(position)
                  case "documentSymbol":
                    return lsp.documentSymbol(pathToFileURL(file).href)
                  case "workspaceSymbol":
                    return lsp.workspaceSymbol(input.query ?? "")
                  case "goToImplementation":
                    return lsp.implementation(position)
                  case "prepareCallHierarchy":
                    return lsp.prepareCallHierarchy(position)
                  case "incomingCalls":
                    return lsp.incomingCalls(position)
                  case "outgoingCalls":
                    return lsp.outgoingCalls(position)
                }
              })()
              return {
                content:
                  result.length === 0 ? `No results found for ${input.operation}` : JSON.stringify(result, null, 2),
                metadata: { result },
              }
            }).pipe(
              Effect.mapError((error) =>
                error instanceof ToolFailure ? error : new ToolFailure({ message: `LSP ${input.operation} failed`, error }),
              ),
            ),
        }),
      )
      .pipe(Effect.orDie)
  }),
}

import { expect, test } from "bun:test"
import { chooseLsp } from "../../../src/feature-plugins/sidebar/lsp"

function fake(options: { pick?: string; confirm?: boolean; install?: { ok: boolean; error?: string } }) {
  const calls: string[] = []
  const toasts: { variant?: string; message: string }[] = []
  let selectOptions: any[] = []
  let confirmMessage = ""
  let picks = 0
  const context = {
    client: {
      rpc: () => ({
        catalog: async () => {
          calls.push("catalog")
          return [
            { id: "pyright", extensions: [".py"], installed: false, status: "idle", download: "npm: pyright (~15 MB)" },
            { id: "gopls", extensions: [".go"], installed: true, status: "connected", download: "go install gopls" },
          ]
        },
        install: async (input: { id: string }) => {
          calls.push(`install ${input.id}`)
          return options.install ?? { ok: true }
        },
      }),
    },
    ui: {
      dialog: {
        select: async (input: { options: any[] }) => {
          selectOptions = input.options
          return picks++ === 0 ? options.pick : undefined
        },
        confirm: async (input: { message: string }) => {
          confirmMessage = input.message
          return options.confirm
        },
      },
      toast: { show: (toast: { variant?: string; message: string }) => toasts.push(toast) },
    },
  }
  return { context: context as any, calls, toasts, options: () => selectOptions, confirmMessage: () => confirmMessage }
}

test("/lsp lists install state and what each download fetches, and installs only after confirmation", async () => {
  const declined = fake({ pick: "pyright", confirm: false })
  await chooseLsp(declined.context)
  expect(declined.options().map((option) => [option.title, option.footer])).toEqual([
    ["pyright", "not installed"],
    ["gopls", "running"],
  ])
  expect(declined.options()[0].description).toContain("npm: pyright (~15 MB)")
  expect(declined.confirmMessage()).toContain("This downloads: npm: pyright (~15 MB).")
  expect(declined.calls.filter((call) => call.startsWith("install"))).toEqual([])

  const accepted = fake({ pick: "pyright", confirm: true })
  await chooseLsp(accepted.context)
  expect(accepted.calls).toEqual(["catalog", "install pyright"])
  expect(accepted.toasts.at(-1)).toMatchObject({ variant: "success", message: "pyright is running for this project" })
})

test("/lsp does not reinstall a running server and reports a failed install", async () => {
  const running = fake({ pick: "gopls", confirm: true })
  await chooseLsp(running.context)
  expect(running.calls).toEqual(["catalog"])
  expect(running.toasts.at(-1)?.message).toBe("gopls is already running")

  const failed = fake({ pick: "pyright", confirm: true, install: { ok: false, error: "pyright: nothing to start" } })
  await chooseLsp(failed.context)
  expect(failed.toasts.at(-1)).toMatchObject({ variant: "error", message: "pyright: nothing to start" })
})

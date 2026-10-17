import type { InstanceContext } from "../../src/lsp/support"
export { tmpdir } from "../fixture/tmpdir"

/** opencode v1's test instance, reduced to what the language-server runtime reads. */
export async function withTestInstance<R>(input: { directory: string; worktree?: string; fn: (ctx: InstanceContext) => R }) {
  return input.fn({ directory: input.directory, worktree: input.worktree ?? input.directory })
}

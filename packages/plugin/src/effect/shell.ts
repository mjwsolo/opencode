import type { Hooks } from "./registration.js"

export interface ShellCreateBefore {
  command: string
  cwd: string
  timeout: number
  shell: string
  env: Record<string, string | undefined>
  /** Program and arguments the shell runs under (an OS sandbox wrapper), if any. */
  prefix?: string[]
}

export interface ShellHooks {
  readonly "create.before": ShellCreateBefore
}

export interface ShellDomain {
  readonly hook: Hooks<ShellHooks>
}

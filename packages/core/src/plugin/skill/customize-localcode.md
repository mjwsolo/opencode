<!--
  Built-in skill. Name and description are registered in code at
  packages/core/src/plugin/skill.ts. The body below becomes the skill's content.
-->

# Customizing localcode

localcode is built on OpenCode V2. Its configuration has the same shape as
OpenCode V2 configuration; only the file names, directories and command name
differ. Use this guide when editing localcode's own configuration, agents,
commands, skills, plugins, MCP servers or permission rules.

## Names

| OpenCode V2 docs say                 | localcode uses                                     |
| ------------------------------------ | -------------------------------------------------- |
| `opencode.json(c)`                   | `localcode.json(c)`                                |
| `.opencode/`                         | `.localcode-agent/`                                |
| `~/.config/opencode/`                | `~/.config/localcode-agent/`                       |
| `~/.local/share/opencode/`           | `~/.local/share/localcode-agent/`                  |
| `opencode <command>`                 | `localcode <command>`                              |

For compatibility, `opencode.json(c)` files and a `.opencode/` directory are
still read, but new files should use the localcode names. In the same
directory the localcode names win.

## Reference

Do not guess field names or shapes. The OpenCode V2 documentation at
<https://opencode.ai/v2/docs/> describes the configuration localcode reads;
fetch the relevant page before writing config you are unsure of, and apply the
name substitutions above. Use only the V2 docs; <https://opencode.ai/docs/>
documents V1. Never recommend a field the schema marks deprecated. If the docs
are missing or contradictory, keep the change minimal and say what is
uncertain instead of guessing.

## Configuration files

Configuration is JSON or JSONC. Global configuration lives at
`~/.config/localcode-agent/localcode.json(c)` and applies to every project.
Project configuration can live in any directory as `localcode.json(c)` or
`.localcode-agent/localcode.json(c)`, including nested packages in a monorepo.

localcode searches the current directory and every ancestor. It merges direct
`localcode.json(c)` files from the farthest ancestor to the current directory,
then does the same for `.localcode-agent/localcode.json(c)` files, so every
`.localcode-agent` config overrides every direct config. Global configuration
has lower precedence than these project documents.

Common fields include `model`, `default_agent`, `permissions`, `agents`,
`commands`, `plugins`, `providers`, `mcp`, `skills`, `instructions`,
`references`, `formatter` and `lsp`. Preserve unrelated settings when editing
an existing file.

Terminal preferences (themes, keybindings, input behaviour) are separate. They
live in `~/.config/localcode-agent/cli.json`, never in `localcode.json`.

## Skills, agents and commands

| Scope                         | Path                                                                   |
| ----------------------------- | ---------------------------------------------------------------------- |
| Project agents                | `.localcode-agent/agent(s)/<name>.md`                                  |
| Global agents                 | `~/.config/localcode-agent/agent(s)/<name>.md`                         |
| Project commands              | `.localcode-agent/command(s)/<name>.md`                                |
| Global commands               | `~/.config/localcode-agent/command(s)/<name>.md`                       |
| Project skills                | `.localcode-agent/skill(s)/<name>/SKILL.md`                            |
| Global skills                 | `~/.config/localcode-agent/skill(s)/<name>/SKILL.md`                   |
| External skills (auto-loaded) | `~/.claude/skills/<name>/SKILL.md`, `~/.agents/skills/<name>/SKILL.md` |

## MCP servers

Configure MCP servers under `mcp.servers`. Prefer the CLI because it preserves
unrelated configuration. Use `--global` when the user wants the server for
every project; omit it for project-local configuration.

```sh
localcode mcp add <name> --global --url <remote-url>
localcode mcp list
```

Remote servers use OAuth by default. If `mcp list` reports that a server needs
authentication, tell the user to run `/mcps`, select the server, and sign in.
Do not run `localcode mcp auth` through the shell tool: it starts an
interactive flow whose authorization link can be hidden in background output.

Report the server as configured but awaiting sign-in until its status confirms
it is connected. Do not ask for or store an API key when the server supports
OAuth. When header credentials are required, use an environment substitution
such as `{env:MCP_API_KEY}` instead of writing a secret into configuration.

## Plugins

For creating, configuring or loading plugins, fetch the
[plugins guide](https://opencode.ai/v2/docs/build/plugins) before answering.
It covers hooks, transforms, tools, plugin context capabilities and package
entrypoints.

## Troubleshooting

- Inspect `~/.local/share/localcode-agent/log/`.
- Do not delete or edit the database while diagnosing a problem.
- Redact API keys, authorization headers, prompts and file contents before
  sharing diagnostics.

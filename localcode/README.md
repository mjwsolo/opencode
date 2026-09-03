# localcode profile for this fork

This branch adapts opencode as localcode's agent front end:

- **Local inference only.** `localcode/opencode.json` points opencode at
  localcode's bundled turboquant `llama-server` through the
  `@ai-sdk/openai-compatible` provider (chat/completions — no Responses API
  requirement here).
- **No account, nothing leaves the machine**: `"share": "disabled"`,
  `"autoupdate": false`, static local api key.
- The config ships project-local, so a user's own `~/.config/opencode` is
  never read or written.

The launcher and end-to-end journey tests live in the localcode repo on the
`integrate/opencode-frontend` branch (`opencode-agent/`).

# localcode profile for this fork

This branch adapts opencode v2 as localcode's agent front end:

- **Local inference only.** `localcode/localcode.json` points the runtime at
  localcode's bundled `llama-server` through the `@ai-sdk/openai-compatible`
  provider. Under the localcode launcher the `localcode` provider follows the
  supervisor (loaded alias, context budget, vision) instead of this file.
- **No account, no background traffic**: no release checks, no catalog
  refresh, no package downloads, no background service, static local API key.
- The binary is `localcode`; configuration is `localcode.json` (then
  `opencode.json`) and `.localcode-agent/`; state lives under
  `localcode-agent` in the XDG directories; every `OPENCODE_*` variable is
  also read as `LOCALCODE_*`.

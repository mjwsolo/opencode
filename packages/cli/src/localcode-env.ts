// Every OPENCODE_* setting is also readable under its LOCALCODE_* name; the
// LocalCode name wins when both are set. Imported first by the entry point so
// the copy happens before any module reads process.env, and child processes
// (the standalone server, tools) inherit the resolved values.
for (const [key, value] of Object.entries(process.env)) {
  if (value === undefined || !key.startsWith("LOCALCODE_")) continue
  process.env[`OPENCODE_${key.slice("LOCALCODE_".length)}`] = value
}

export {}

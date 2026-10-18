export * as LocalCodeTools from "./localcode-tools.js"

/**
 * Compact tool descriptions for local models. Every request re-reads the tool definitions, so the
 * built-in tools are described in a few lines each: what the tool does, the rule that makes a call
 * succeed, and nothing a model can infer from the parameter names. Parameter descriptions are
 * shortened the same way. Names, types, required fields and enums are untouched.
 */
type Lean = {
  readonly description: string | ((upstream: string) => string)
  readonly parameters?: Readonly<Record<string, string>>
}

const LEAN: Readonly<Record<string, Lean>> = {
  shell: {
    // The upstream text names the platform and shell; keep that sentence.
    description: (upstream) =>
      [
        "Run a shell command and return its output.",
        upstream.match(/Commands run on [^.]+\./)?.[0],
        "Quote paths that contain spaces. Prefer the dedicated tools for reading, searching and editing files. Large output is saved to a file and a preview is returned.",
      ]
        .filter(Boolean)
        .join(" "),
    parameters: {
      workdir: "Working directory (default: the project directory). Use this instead of cd.",
      timeout: "Milliseconds; 0 disables it. Default 120000 in the foreground, none in the background.",
      background: "Return at once and get notified when it ends (dev servers, long builds). Do not add &.",
    },
  },
  read: {
    description: [
      "Read a file or list a directory.",
      "",
      '- Text lines come back as "N: content"; the prefix is not part of the file. Directory entries are one per line.',
      "- Read large files in sections with offset and limit; prefer one larger read over many small slices. Use grep to find content and glob to find paths.",
      "- Images and PDFs are returned as attachments.",
    ].join("\n"),
    parameters: {
      offset: "First line or entry to read (1-based)",
      limit: "Lines or entries to read (default and maximum 2000)",
    },
  },
  edit: {
    description: [
      "Replace exact text in a file.",
      "",
      '- oldString must match the file exactly, including indentation. Copy it from the Read output after the "N: " line-number prefix; never include the prefix.',
      "- oldString must occur once: include more surrounding lines, or set replaceAll to change every occurrence (for renames).",
      "- Several places in one file: put the further replacements in edits; they apply in order, all or none.",
      "- Prefer editing existing files over writing new ones.",
    ].join("\n"),
    parameters: {
      newString: "Replacement text (must differ from oldString)",
      replaceAll: "Replace every occurrence (default false: oldString must occur once)",
      edits: "Further replacements in the same file, applied in order after the first",
    },
  },
  write: {
    description:
      "Write a whole file, overwriting any existing file at that path; missing parent directories are created. For partial changes use edit.",
  },
  grep: {
    description:
      "Search file contents with a regular expression (or exact text with literal). Returns file paths, line numbers and the matching lines.",
    parameters: {
      path: "File or directory to search (default: the project directory)",
      include: 'File filter, for example "*.py" or "*.{ts,tsx}"',
      literal: "Match pattern as exact text (default false)",
      caseSensitive: "Default true",
      limit: "Maximum matching lines (default 100)",
    },
  },
  glob: {
    description: 'Find files by name pattern, for example "**/*.js" or "src/**/*.ts".',
    parameters: {
      path: "Directory to search (default: the project directory)",
      hidden: "Include hidden files (default false)",
      limit: "Maximum paths (default 100)",
    },
  },
  question: {
    description: [
      "Ask the user a question with options when instructions are ambiguous or a decision is theirs to make.",
      "",
      '- A "type your own answer" option is added automatically; do not add "Other". Set multiple: true to allow several answers.',
      '- Put a recommended option first and mark it "(Recommended)".',
    ].join("\n"),
  },
  skill: {
    description: "Load one of the available skills by id. Its instructions and resources are added to the conversation.",
    parameters: { id: "An available skill's id, or one the user named" },
  },
  webfetch: {
    description:
      "Fetch an HTTP or HTTPS URL and return its content as markdown (default), text, or html. Read-only. Very large pages are replaced with a preview.",
    parameters: { format: "Default markdown", timeout: "Seconds (maximum 120)" },
  },
}

/** Shorten a built-in tool's definition in place; the input schema is copied, never mutated. */
export function lean(name: string, tool: { description: string; input: unknown }) {
  const entry = LEAN[name]
  if (!entry) return
  tool.description = typeof entry.description === "function" ? entry.description(tool.description) : entry.description
  const input = tool.input as { properties?: Record<string, unknown> } | null
  if (!entry.parameters || !input || typeof input !== "object" || !input.properties) return
  const properties = { ...input.properties }
  for (const [key, text] of Object.entries(entry.parameters)) {
    const property = properties[key]
    if (property && typeof property === "object") properties[key] = { ...property, description: text }
  }
  tool.input = { ...input, properties }
}

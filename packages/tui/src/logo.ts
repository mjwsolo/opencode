// OpenCode's compact block lettering, adapted to the localcode wordmark.
export const logo = {
  left: [
    "█                 █ ",
    "█  █▀▀█ █▀▀▀ ▀▀▀█ █ ",
    "█  █__█ █___ █▀▀█ █ ",
    "▀  ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀ ",
  ],
  right: ["             ▄     ", "█▀▀▀ █▀▀█ █▀▀█ █▀▀█", "█___ █__█ █__█ █^^^", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"],
}

export const go = {
  left: ["    ", "█   ", "█   ", "▀▀▀▀"],
  right: ["    ", "█▀▀▀", "█___", "▀▀▀▀"],
}

export const slogan = "Agentic coding. Local models. On your Mac."

// Compact two-row wordmark for narrow terminals, built from half-height blocks.
const compactGlyphs: Record<string, [string, string]> = {
  l: ["█  ", "█▄▄"],
  o: ["█▀█", "█▄█"],
  c: ["█▀▀", "█▄▄"],
  a: ["▄▀█", "█▀█"],
  d: ["▄▄█", "█▄█"],
  e: ["█▀▀", "██▄"],
}

export const compact = [0, 1].map((row) =>
  [..."localcode"].map((char) => compactGlyphs[char]![row]).join(" "),
)


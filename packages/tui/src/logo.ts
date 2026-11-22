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

// The same wordmark one column narrower per letter, for narrow terminals.
// Same rows, glyphs and shadow markers (_ and ^) as `logo`, so it renders identically.
const smallGlyphs: Record<string, string[]> = {
  l: ["█", "█", "█", "▀"],
  o: ["   ", "█▀█", "█_█", "▀▀▀"],
  c: ["   ", "█▀▀", "█__", "▀▀▀"],
  a: ["   ", "▀▀█", "█▀█", "▀▀▀"],
  d: ["  ▄", "█▀█", "█_█", "▀▀▀"],
  e: ["   ", "█▀█", "█^^", "▀▀▀"],
}
const small = (word: string) => [0, 1, 2, 3].map((row) => [...word].map((char) => smallGlyphs[char]![row]).join(" "))
export const logoSmall = { left: small("local"), right: small("code") }

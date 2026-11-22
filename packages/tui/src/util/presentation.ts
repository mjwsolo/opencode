import { logo, logoSmall, logoStacked } from "../logo"

const reset = "\x1b[0m"
const bold = "\x1b[1m"
const dim = "\x1b[90m"

function wordmark(pad = "", mark: typeof logo = logo) {
  const draw = (line: string, fg: string, shadow: string, bg: string) =>
    [...line]
      .map((char) => {
        if (char === "_") return `${bg} ${reset}`
        if (char === "^") return `${fg}${bg}▀${reset}`
        if (char === "~") return `${shadow}▀${reset}`
        if (char === " ") return " "
        return `${fg}${char}${reset}`
      })
      .join("")

  return mark.left.map((line, index) => {
    const left = draw(line, "\x1b[38;2;95;135;255m", "\x1b[38;2;27;35;59m", "\x1b[48;2;27;35;59m")
    const right = draw(mark.right[index] ?? "", "\x1b[38;2;95;135;255m", "\x1b[38;2;27;35;59m", "\x1b[48;2;27;35;59m")
    return `${pad}${left} ${right}`
  })
}

// Widest logo that fits: full, one column narrower per letter, or stacked; plain text below that.
const width = (mark: typeof logo) => 2 + (mark.left[0]?.length ?? 0) + 1 + (mark.right[0]?.length ?? 0)
const BRAND = "\x1b[38;2;95;135;255m"
function fittingWordmark(columns: number) {
  for (const mark of [logo, logoSmall, logoStacked]) if (columns >= width(mark)) return wordmark("  ", mark)
  return [`  ${BRAND}${bold}localcode${reset}`]
}

export type SessionEpilogue = { readonly title: string; readonly sessionID?: string }

// Printed after the TUI closes.
export function epilogue(input: {
  readonly session?: SessionEpilogue
  readonly updatedVersion?: string
  readonly columns?: number
}) {
  if (!input.session) return
  const row = (label: string, value: string) => `  ${dim}${label.padEnd(10, " ")}${reset}${bold}${value}${reset}`
  return [
    ...fittingWordmark(input.columns ?? process.stdout.columns ?? Number.POSITIVE_INFINITY),
    "",
    // LocalCode has no self-updater, so no "run the new version" line.
    ...(input.session
      ? [row("Session", input.session.title), row("Continue", `localcode --resume ${input.session.sessionID}`), ""]
      : []),
  ].join("\n")
}

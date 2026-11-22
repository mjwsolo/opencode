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

// Two-space indent + left half + gap + right half; wider than this and the block letters wrap.
const WORDMARK_WIDTH = 2 + (logo.left[0]?.length ?? 0) + 1 + (logo.right[0]?.length ?? 0)
const STACKED_WIDTH = 2 + (logoStacked.left[0]?.length ?? 0) + 1
const SMALL_WIDTH = 2 + (logoSmall.left[0]?.length ?? 0) + 1 + (logoSmall.right[0]?.length ?? 0)

export function sessionEpilogue(input: { title: string; sessionID?: string; columns?: number }) {
  const columns = input.columns ?? Infinity
  const mark =
    columns >= WORDMARK_WIDTH
      ? wordmark("  ")
      : columns >= SMALL_WIDTH
        ? wordmark("  ", logoSmall)
        : columns >= STACKED_WIDTH
          ? wordmark("  ", logoStacked)
        : [`  \x1b[38;2;95;135;255m${bold}localcode${reset}`]
  const weak = (text: string) => `${dim}${text.padEnd(10, " ")}${reset}`
  return [
    ...mark,
    "",
    `  ${weak("Session")}${bold}${input.title}${reset}`,
    `  ${weak("Continue")}${bold}localcode --resume ${input.sessionID}${reset}`,
    "",
  ].join("\n")
}

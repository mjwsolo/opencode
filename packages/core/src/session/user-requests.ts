export * as SessionUserRequests from "./user-requests.js"

/**
 * localcode: the user's own messages, carried across compactions verbatim by code.
 *
 * A summary written by the model paraphrases what the user asked for, and a weaker model can then
 * keep working on a paraphrased old objective after the user changed direction. So a compaction
 * also stores every user message since the session started (the newest that fit an allowance,
 * oldest dropped first), and the checkpoint shows them after the summary, verbatim, with the latest
 * one labelled as the current request. The model never writes or edits this list.
 */
import type { SessionMessage } from "./message.js"
import { Token } from "../util/token.js"

export type UserRequests = {
  /** Older user messages left out to fit the allowance. */
  readonly omitted: number
  /** Verbatim user messages, oldest first. */
  readonly messages: ReadonlyArray<string>
}

/** Key in a completed compaction's metadata. */
export const METADATA_KEY = "userRequests"

const ELIDED = (count: number) => `\n[... ${count} characters of this message omitted to fit the context ...]\n`

/** The text of one user message as typed, with attachments named. Empty for nothing to show. */
export const userText = (message: SessionMessage.Info): string => {
  if (message.type !== "user") return ""
  const files =
    message.files?.map((file) => {
      const name = file.name ?? (file.source.type === "uri" ? file.source.uri : "inline attachment")
      return `[Attached ${file.mime}: ${name}]`
    }) ?? []
  return [message.text.trim(), ...files].filter(Boolean).join("\n")
}

/** The list a completed compaction stored, if it stored one. */
export const of = (message: SessionMessage.Info | undefined): UserRequests | undefined => {
  if (message?.type !== "compaction" || message.status !== "completed") return undefined
  const value = message.metadata?.[METADATA_KEY] as Partial<UserRequests> | undefined
  if (!value || !Array.isArray(value.messages)) return undefined
  const messages = value.messages.filter((text): text is string => typeof text === "string")
  return { omitted: typeof value.omitted === "number" && value.omitted > 0 ? value.omitted : 0, messages }
}

/** Keep the head and tail of a message that alone exceeds the allowance. */
const shorten = (text: string, allowance: number) => {
  const chars = Math.max(200, allowance * 4)
  if (text.length <= chars) return text
  const head = Math.floor(chars * 0.6)
  const tail = chars - head
  return text.slice(0, head) + ELIDED(text.length - head - tail) + text.slice(text.length - tail)
}

/**
 * Every user message since the session started: the ones the previous compaction kept, then those
 * after it. Oldest are dropped first to fit `allowance` tokens; the latest is always kept (shortened
 * in the middle only if it alone is larger than the allowance).
 */
export const collect = (messages: ReadonlyArray<SessionMessage.Info>, allowance: number): UserRequests => {
  const previous = of(messages[0])
  const all = [...(previous?.messages ?? []), ...messages.map(userText).filter(Boolean)]
  if (all.length === 0) return { omitted: previous?.omitted ?? 0, messages: [] }
  const budget = Math.max(0, Math.floor(allowance))
  const latest = shorten(all[all.length - 1], budget)
  let total = Token.estimate(latest)
  let start = all.length - 1
  while (start > 0) {
    const next = total + Token.estimate(all[start - 1])
    if (next > budget) break
    total = next
    start--
  }
  return {
    omitted: (previous?.omitted ?? 0) + start,
    messages: [...all.slice(start, all.length - 1), latest],
  }
}

/** The block the checkpoint shows after the summary. Empty when there are no user messages. */
export const render = (requests: UserRequests): string => {
  if (requests.messages.length === 0) return ""
  const count = requests.messages.length
  const lines = [
    "<user-messages>",
    `The user's messages in this session, verbatim, oldest first.${
      requests.omitted
        ? ` ${requests.omitted} earlier ${requests.omitted === 1 ? "message is" : "messages are"} not shown.`
        : ""
    } When they conflict with the summary or with an earlier message, the later message wins.`,
  ]
  requests.messages.forEach((text, index) => {
    lines.push(
      "",
      index === count - 1
        ? "[Latest user message: the current request, unless a newer user message follows]"
        : `[User message ${requests.omitted + index + 1}]`,
      text,
    )
  })
  lines.push("</user-messages>")
  return lines.join("\n")
}

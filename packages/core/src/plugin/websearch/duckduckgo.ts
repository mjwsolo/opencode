export * as WebSearchDuckDuckGo from "./duckduckgo.js"

import { define } from "@opencode/plugin/effect/plugin"
import { Effect } from "effect"

export const endpoint = "https://html.duckduckgo.com/html/"

const entities: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'", "&#39;": "'" }

export function text(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#x27;|&#39;/g, (match) => entities[match] ?? match)
    .replace(/\s+/g, " ")
    .trim()
}

/** Title, URL and snippet of each organic result on DuckDuckGo's HTML results page. */
export function parse(html: string, limit = 8) {
  const pattern =
    /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
  return Array.from(html.matchAll(pattern))
    .slice(0, limit)
    .map((match) => {
      const href = match[1] ?? ""
      const redirect = href.match(/[?&]uddg=([^&]+)/)?.[1]
      return {
        url: redirect ? decodeURIComponent(redirect) : href.startsWith("//") ? `https:${href}` : href,
        title: text(match[2] ?? ""),
        content: text(match[3] ?? ""),
        time: {},
      }
    })
    .filter((item) => item.url.startsWith("http"))
}

// Keyless search: no account, no API key, and nothing is sent until the model calls the web search tool.
export const Plugin = define({
  id: "localcode.websearch.duckduckgo",
  effect: Effect.fn("WebSearchDuckDuckGo.Plugin")(function* (ctx) {
    yield* ctx.websearch.transform((editor) => {
      editor.add({
        id: "duckduckgo",
        name: "DuckDuckGo",
        execute: (input) =>
          Effect.tryPromise({
            try: async (signal) => {
              const response = await fetch(`${endpoint}?q=${encodeURIComponent(input.query)}`, {
                headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
                signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
              })
              if (!response.ok) throw new Error(`DuckDuckGo search failed: HTTP ${response.status}`)
              return parse(await response.text())
            },
            catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
          }),
      })
      // The keyless default: the model can search without a consent form that offers cloud search APIs.
      if (editor.default.get() === undefined) editor.default.set("duckduckgo")
    })
  }),
})

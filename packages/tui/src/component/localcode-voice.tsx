/**
 * localcode voice: push-to-talk speech-to-text and read-aloud, entirely local.
 * The launcher's supervisor records the mic (ffmpeg), transcribes with
 * whisper.cpp in a private venv, and speaks with macOS `say`; the TUI only
 * calls its control API. Nothing here touches the network.
 */
import { createSignal } from "solid-js"
import { controlUrl } from "./dialog-localcode-model"

const [recording, setRecording] = createSignal(false)
export const voiceRecording = recording

async function post<T>(path: string, body: unknown = {}): Promise<T & { error?: string }> {
  const r = await fetch(controlUrl() + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20 * 60_000), // first use installs whisper + downloads the speech model
  })
  return (await r.json().catch(() => ({ error: `HTTP ${r.status}` }))) as T & { error?: string }
}

/** Returns an error message, or undefined when recording started. */
export async function voiceStart(): Promise<string | undefined> {
  if (!controlUrl()) return "Voice needs the localcode launcher (no control URL)"
  const res = await post<{ ok?: boolean }>("/voice/start").catch((e) => ({ error: String(e) }))
  if (res.error) return res.error
  setRecording(true)
  return undefined
}

export async function voiceStop(): Promise<{ text?: string; error?: string }> {
  setRecording(false)
  return post<{ text?: string }>("/voice/stop").catch((e) => ({ error: String(e) }))
}

export async function voiceSpeak(text: string): Promise<string | undefined> {
  if (!controlUrl()) return "Voice needs the localcode launcher (no control URL)"
  const res = await post<{ ok?: boolean }>("/voice/speak", { text }).catch((e) => ({ error: String(e) }))
  return res.error
}

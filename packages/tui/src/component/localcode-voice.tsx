/**
 * localcode voice: push-to-talk speech-to-text and read-aloud, entirely local.
 * The launcher's supervisor records the mic (PortAudio), transcribes with
 * whisper.cpp in a private venv, and speaks with macOS `say`; the TUI only
 * calls its control API. Nothing here touches the network.
 */
import { createSignal } from "solid-js"
import { controlUrl } from "./dialog-localcode-model"
import { DialogConfirm } from "../ui/dialog-confirm"
import type { DialogContext } from "../ui/dialog"

type VoiceStatus = {
  ready: boolean
  setup_needed?: boolean
  needs?: { runtime_mb: number; model_mb: number }
  recording: boolean
  detail?: string
}

export async function voiceStatus(): Promise<VoiceStatus | undefined> {
  if (!controlUrl()) return undefined
  try {
    const r = await fetch(controlUrl() + "/voice/status", { signal: AbortSignal.timeout(5000) })
    return (await r.json()) as VoiceStatus
  } catch {
    return undefined
  }
}

/**
 * Voice needs two one-time downloads (whisper runtime + speech model). Nothing is
 * fetched until the user confirms here, with the sizes in front of them.
 * Resolves true when voice is ready to use.
 */
export async function ensureVoiceReady(
  dialog: DialogContext,
  toast: { show: (t: { variant: "info" | "success" | "error" | "warning"; title?: string; message: string; duration?: number }) => void },
): Promise<boolean> {
  const st = await voiceStatus()
  if (!st) {
    toast.show({ variant: "error", title: "Voice", message: "Voice needs the localcode launcher (no control URL)", duration: 5000 })
    return false
  }
  if (st.ready) return true
  const needs = st.needs ?? { runtime_mb: 60, model_mb: 514 }
  const parts = [
    needs.runtime_mb ? `whisper.cpp runtime (~${needs.runtime_mb} MB, into the launcher's own folder)` : "",
    needs.model_mb ? `speech model (~${needs.model_mb} MB, kept for every localcode front end)` : "",
  ].filter(Boolean)
  const ok = await new Promise<boolean>((resolve) => {
    dialog.replace(() => (
      <DialogConfirm
        title="Set up voice?"
        message={`Voice runs entirely on this Mac, but needs a one-time download:\n• ${parts.join("\n• ")}\nRecording uses the bundled PortAudio recorder; no ffmpeg is needed. Read-aloud uses macOS say.`}
        confirmLabel="Download and enable"
        onConfirm={() => resolve(true)}
        onCancel={() => resolve(false)}
      />
    ), () => resolve(false))
  })
  dialog.clear()
  if (!ok) return false
  toast.show({ variant: "info", title: "Voice", message: "Setting up… (see progress here)", duration: 15 * 60_000 })
  let last = ""
  const timer = setInterval(async () => {
    const s = await voiceStatus()
    if (s?.detail && s.detail !== last) {
      last = s.detail
      toast.show({ variant: "info", title: "Voice", message: s.detail, duration: 15 * 60_000 })
    }
  }, 2000)
  const res = await post<{ ok?: boolean }>("/voice/setup").catch((e) => ({ error: String(e) }))
  clearInterval(timer)
  if (res.error) {
    toast.show({ variant: "error", title: "Voice", message: res.error, duration: 8000 })
    return false
  }
  toast.show({ variant: "success", title: "Voice", message: "Voice is ready — hold space or run /voice", duration: 4000 })
  return true
}

const [recording, setRecording] = createSignal(false)
export const voiceRecording = recording

async function post<T>(path: string, body: unknown = {}): Promise<T & { error?: string }> {
  // One retry on a dropped connection: the supervisor answers with Connection: close,
  // and a stale keep-alive socket surfaces as "socket connection was closed".
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(controlUrl() + path, {
        method: "POST",
        headers: { "content-type": "application/json", connection: "close" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20 * 60_000), // first use installs whisper + downloads the speech model
      })
      return (await r.json().catch(() => ({ error: `HTTP ${r.status}` }))) as T & { error?: string }
    } catch (e) {
      const msg = String(e)
      if (attempt === 0 && /socket|ECONNRESET|closed|reset/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 150))
        continue
      }
      return { error: `voice service unreachable (${msg.replace(/^Error:\s*/, "")}); restart the launcher if it persists` } as T & { error?: string }
    }
  }
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

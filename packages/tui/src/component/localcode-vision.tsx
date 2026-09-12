/**
 * localcode vision: a model can only take images once its projector (mmproj
 * sidecar) is on disk. It is never fetched silently — /vision asks, with the
 * size, then the supervisor downloads it and restarts the server with it.
 */
import { DialogConfirm } from "../ui/dialog-confirm"
import type { DialogContext } from "../ui/dialog"
import { controlUrl } from "./dialog-localcode-model"

type Toast = { show: (t: { variant: "info" | "success" | "error" | "warning"; title?: string; message: string; duration?: number }) => void }
type Status = { state: string; current?: string | null; vision?: boolean; vision_available?: boolean; vision_size_gb?: number; detail?: string }

export async function visionStatus(): Promise<Status | undefined> {
  if (!controlUrl()) return undefined
  try {
    const r = await fetch(controlUrl() + "/status", { signal: AbortSignal.timeout(5000) })
    return (await r.json()) as Status
  } catch {
    return undefined
  }
}

/** One-line hint after a model loads without its projector. Never downloads. */
export async function visionHint(toast: Toast) {
  const st = await visionStatus()
  if (!st?.current || st.vision || !st.vision_available) return
  toast.show({
    variant: "info",
    title: "Images",
    message: `${st.current} can read images with a ${st.vision_size_gb ?? "?"} GB projector — run /vision to download it`,
    duration: 8000,
  })
}

export async function ensureVision(dialog: DialogContext, toast: Toast): Promise<boolean> {
  const st = await visionStatus()
  if (!st?.current) {
    toast.show({ variant: "warning", title: "Vision", message: "Load a model first (/models)", duration: 4000 })
    return false
  }
  if (st.vision) {
    toast.show({ variant: "success", title: "Vision", message: `${st.current} already reads images — drop or paste one`, duration: 4000 })
    return true
  }
  if (!st.vision_available) {
    toast.show({ variant: "warning", title: "Vision", message: `${st.current} has no image projector; pick a vision-capable model in /models`, duration: 5000 })
    return false
  }
  const ok = await new Promise<boolean>((resolve) => {
    dialog.replace(() => (
      <DialogConfirm
        title="Enable images for this model?"
        message={`Download the ${st.vision_size_gb} GB vision projector for ${st.current} from Hugging Face and restart the local server with it?`}
        label="Download and enable"
        onConfirm={() => resolve(true)}
        onCancel={() => resolve(false)}
      />
    ))
  })
  dialog.clear()
  if (!ok) return false
  try {
    const r = await fetch(controlUrl() + "/vision/install", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
    const res = (await r.json()) as { error?: string }
    if (res.error) throw new Error(res.error)
  } catch (e) {
    toast.show({ variant: "error", title: "Vision", message: String(e), duration: 6000 })
    return false
  }
  toast.show({ variant: "info", title: "Vision", message: "Downloading projector…", duration: 10 * 60_000 })
  return await new Promise<boolean>((resolve) => {
    let last = ""
    const timer = setInterval(async () => {
      const s = await visionStatus()
      if (!s) return
      const line = s.state === "downloading" ? `${s.detail ?? "downloading…"}` : s.state === "loading" ? "restarting with vision…" : ""
      if (line && line !== last) {
        last = line
        toast.show({ variant: "info", title: "Vision", message: line, duration: 10 * 60_000 })
      }
      if (s.state === "ready") {
        clearInterval(timer)
        toast.show({ variant: s.vision ? "success" : "error", title: "Vision", message: s.vision ? "Images enabled — drop or paste one" : "Projector download failed (see .run/supervisor.log)", duration: 6000 })
        resolve(!!s.vision)
      }
      if (s.state === "error") {
        clearInterval(timer)
        toast.show({ variant: "error", title: "Vision", message: s.detail ?? "failed", duration: 8000 })
        resolve(false)
      }
    }, 1000)
  })
}

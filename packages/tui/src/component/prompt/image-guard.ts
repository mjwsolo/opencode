/**
 * A message with an image must not go to a model that cannot see it: the image would be
 * dropped silently and the model would answer as if nothing was attached. This decides, from
 * the composer's files and the supervisor's /status, whether to send or to stop and ask.
 */
export type GuardStatus = {
  current?: string | null
  vision?: boolean
  vision_available?: boolean
  vision_size_gb?: number
}

export type GuardDecision =
  | { action: "send" }
  | { action: "block"; model: string; canDownload: boolean; sizeGb?: number }

type FileLike = { mime?: string; uri?: string }

export function hasImagePart(files: readonly FileLike[] | undefined) {
  return (files ?? []).some((f) => (f.mime ?? "").startsWith("image/") || (f.uri ?? "").startsWith("data:image/"))
}

/** Blocks only on a definite "no": an unreachable or older supervisor never stops a send. */
export function imageGuard(files: readonly FileLike[] | undefined, status: GuardStatus | undefined): GuardDecision {
  if (!hasImagePart(files)) return { action: "send" }
  if (!status || !status.current || status.vision !== false) return { action: "send" }
  return {
    action: "block",
    model: status.current,
    canDownload: status.vision_available === true,
    sizeGb: status.vision_size_gb,
  }
}

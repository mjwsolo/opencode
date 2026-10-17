export interface ModelProgress {
  phase?: string
  warmup?: boolean
  context_ready?: boolean
  request_id?: string
  done?: number
  todo?: number
  decoded?: number
}

export function firstResponseNote(progress: ModelProgress): string {
  if (progress.phase !== "reading") return ""
  // Do not explain cached turns, background compaction or an unknown readiness state.
  if (!progress.warmup && (progress.context_ready !== false || !progress.request_id?.startsWith("0:") || (progress.todo ?? 0) < 512)) return ""
  return "Preparing this model’s instructions and tools on your Mac.\nThe first response may take longer; follow-up messages usually start faster."
}

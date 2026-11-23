/**
 * Per-reply speed for a local model, from what the session already records for each
 * assistant step: its token counts and three timestamps (step start, first token, end of
 * streaming). The numbers are exact counts over measured intervals, not estimates, but
 * they include the client round trip to the local server, which is negligible on
 * localhost.
 */
type Step = {
  time: { created: number; firstToken?: number; streamed?: number }
  tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
}

export type StepSpeed = { genTps?: number; ttftS?: number; promptTps?: number }

// Below these a rate is mostly noise (a one-line tool call), so it is left out.
const MIN_OUTPUT_TOKENS = 8
const MIN_GEN_SECONDS = 0.25
const MIN_PROMPT_TOKENS = 200

export function stepSpeed(step: Step): StepSpeed | undefined {
  const { created, firstToken, streamed } = step.time
  if (firstToken === undefined || firstToken < created) return undefined
  const ttftS = (firstToken - created) / 1000
  const out: StepSpeed = { ttftS }
  const tokens = step.tokens
  if (tokens && tokens.input >= MIN_PROMPT_TOKENS && ttftS > 0) out.promptTps = tokens.input / ttftS
  const generated = (tokens?.output ?? 0) + (tokens?.reasoning ?? 0)
  // The first token arrives with the first generated token, so it is not part of the decode interval.
  const seconds = streamed !== undefined ? (streamed - firstToken) / 1000 : 0
  if (generated >= MIN_OUTPUT_TOKENS && seconds >= MIN_GEN_SECONDS) out.genTps = (generated - 1) / seconds
  return out
}

export function formatStepSpeed(speed: StepSpeed | undefined) {
  if (!speed) return undefined
  const parts: string[] = []
  if (speed.genTps !== undefined)
    parts.push(`${speed.genTps >= 100 ? Math.round(speed.genTps) : speed.genTps.toFixed(1)} tok/s`)
  if (speed.ttftS !== undefined) parts.push(`${speed.ttftS.toFixed(1)} s to first token`)
  if (speed.promptTps !== undefined) parts.push(`${Math.round(speed.promptTps).toLocaleString("en-US")} tok/s prompt`)
  return parts.length > 1 || (parts.length === 1 && speed.genTps !== undefined) ? parts.join(" · ") : undefined
}

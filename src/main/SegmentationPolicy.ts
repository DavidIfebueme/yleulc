export interface VadFrame {
  readonly speechProbability: number
  readonly timeMs: number
}

export interface SegmentationConfig {
  readonly maxSegmentMs: number
  readonly minSegmentMs: number
  readonly silenceHangoverMs: number
  readonly speechThreshold: number
}

export interface SegmentSpan {
  readonly endMs: number
  readonly startMs: number
}

export const defaultSegmentationConfig: SegmentationConfig = {
  maxSegmentMs: 15000,
  minSegmentMs: 300,
  silenceHangoverMs: 400,
  speechThreshold: 0.5
}

export function planSegments(
  timeOrderedFrames: ReadonlyArray<VadFrame>,
  config: SegmentationConfig
): ReadonlyArray<SegmentSpan> {
  const spans: Array<SegmentSpan> = []
  let openStartMs: number | undefined = undefined
  let lastSpeechMs = 0
  const closeOpen = (endMs: number): void => {
    if (openStartMs !== undefined && endMs - openStartMs >= config.minSegmentMs) {
      spans.push({ endMs, startMs: openStartMs })
    }
    openStartMs = undefined
  }
  for (const frame of timeOrderedFrames) {
    if (openStartMs === undefined) {
      if (frame.speechProbability >= config.speechThreshold) {
        openStartMs = frame.timeMs
        lastSpeechMs = frame.timeMs
      }
      continue
    }
    if (frame.speechProbability >= config.speechThreshold) {
      lastSpeechMs = frame.timeMs
      if (frame.timeMs - openStartMs >= config.maxSegmentMs) {
        closeOpen(frame.timeMs)
        openStartMs = frame.timeMs
        lastSpeechMs = frame.timeMs
      }
      continue
    }
    if (frame.timeMs - lastSpeechMs >= config.silenceHangoverMs) {
      closeOpen(lastSpeechMs)
    }
  }
  if (openStartMs !== undefined) {
    closeOpen(lastSpeechMs)
  }
  return spans
}

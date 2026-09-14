import type { TranscriptSegment } from "../ask/AskMockGateway"

interface TranscriptViewProps {
  readonly segments: ReadonlyArray<TranscriptSegment>
}

export function TranscriptView(props: TranscriptViewProps) {
  return (
    <ol className="mt-2 space-y-1.5 rounded-xl border border-white/10 bg-black/40 p-2.5">
      {props.segments.map((segment) => (
        <li key={`${segment.time}-${segment.speaker}`} className="flex items-baseline gap-2 text-xs">
          <span className="shrink-0 font-mono text-white/40">{segment.time}</span>
          <span className="shrink-0 font-semibold text-sky-300">{segment.speaker}</span>
          <span className="text-white/80">{segment.text}</span>
        </li>
      ))}
    </ol>
  )
}

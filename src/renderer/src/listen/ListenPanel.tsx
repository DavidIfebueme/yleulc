import type { ListenTranscriptEntry } from "../../../shared/listenIpc"
import { ListenAutoAnswerCard } from "./ListenAutoAnswerCard"
import { ListenErrorBanner } from "./ListenErrorBanner"
import { ListenTranscriptBar } from "./ListenTranscriptBar"
import { ListenWaveMark } from "./ListenWaveMark"
import { useListenSession } from "./useListenSession"

interface ListenPanelProps {
  readonly onTranscriptChange?: (entries: ReadonlyArray<ListenTranscriptEntry>) => void
}

export function ListenPanel(props: ListenPanelProps) {
  const session = useListenSession({ onEntriesChange: props.onTranscriptChange })
  return (
    <div>
      <div className="mt-2 flex items-center gap-1.5">
        <ListenWaveMark />
        <p className="text-xs font-semibold text-white/80">Live transcript</p>
        {session.answers.length === 0 ? null : (
          <span className="rounded-full bg-teal-400/15 px-1.5 py-px text-[10px] font-semibold text-teal-200">
            {`${session.answers.length} auto-answer${session.answers.length === 1 ? "" : "s"}`}
          </span>
        )}
      </div>
      {session.engineError === undefined ? null : (
        <ListenErrorBanner message={session.engineError} onDismiss={session.dismissEngineError} />
      )}
      {session.running && session.systemAudio === "unsupported" ? (
        <p className="mt-1 text-[11px] text-white/50">
          System audio capture is not available on this machine. Mic transcript continues.
        </p>
      ) : null}
      <ListenTranscriptBar entries={session.entries} />
      {session.answers.length === 0 ? null : (
        <div className="mt-2 space-y-2">
          {session.answers.map((answer) => (
            <ListenAutoAnswerCard
              key={answer.requestId}
              answer={answer}
              onRetry={session.retryAnswer}
              onStop={session.stopAnswer}
            />
          ))}
        </div>
      )}
    </div>
  )
}

import type { ListenTranscriptEntry, SystemAudioSupport } from "../../../shared/listenIpc"
import { ListenAutoAnswerCard } from "./ListenAutoAnswerCard"
import { ListenErrorBanner } from "./ListenErrorBanner"
import { ListenTranscriptBar } from "./ListenTranscriptBar"
import { ListenWaveMark } from "./ListenWaveMark"
import type { ListenAutoAnswer } from "./useListenSession"

interface ListenPanelProps {
  readonly answers: ReadonlyArray<ListenAutoAnswer>
  readonly entries: ReadonlyArray<ListenTranscriptEntry>
  readonly engineError: string | undefined
  readonly onDismissEngineError: () => void
  readonly onRetryAnswer: (requestId: string) => void
  readonly onStopAnswer: (requestId: string) => void
  readonly running: boolean
  readonly systemAudio: SystemAudioSupport
}

export function ListenPanel(props: ListenPanelProps) {
  return (
    <div className="min-w-0 w-full">
      <div className="mt-1 flex min-w-0 items-center gap-1.5">
        <ListenWaveMark />
        <p className="text-xs font-semibold text-white/85">Live transcript</p>
        {props.answers.length === 0 ? null : (
          <span className="overlay-badge bg-teal-400/15 text-teal-100">
            {`${props.answers.length} auto-answer${props.answers.length === 1 ? "" : "s"}`}
          </span>
        )}
      </div>
      {props.engineError === undefined ? null : (
        <ListenErrorBanner message={props.engineError} onDismiss={props.onDismissEngineError} />
      )}
      {props.running && props.systemAudio === "unsupported" ? (
        <p className="mt-1 text-[11px] text-white/50">
          System audio capture is not available on this machine. Mic transcript continues.
        </p>
      ) : null}
      <ListenTranscriptBar entries={props.entries} />
      {props.answers.length === 0 ? null : (
        <div className="mt-2 min-w-0 space-y-1.5">
          {props.answers.map((answer) => (
            <ListenAutoAnswerCard
              key={answer.requestId}
              answer={answer}
              onRetry={props.onRetryAnswer}
              onStop={props.onStopAnswer}
            />
          ))}
        </div>
      )}
    </div>
  )
}

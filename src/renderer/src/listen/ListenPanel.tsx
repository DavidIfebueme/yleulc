import { ListenAutoAnswerCard } from "./ListenAutoAnswerCard"
import { ListenErrorBanner } from "./ListenErrorBanner"
import { ListenTranscriptBar } from "./ListenTranscriptBar"
import { ListenWaveMark } from "./ListenWaveMark"
import { useListenSession } from "./useListenSession"

export function ListenPanel() {
  const session = useListenSession()
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

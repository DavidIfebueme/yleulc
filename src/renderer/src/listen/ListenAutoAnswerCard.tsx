import { emptyAskFallback, toAskBullets } from "../../../shared/askIpc"
import { AskAnswerBullets } from "../ask/AskAnswerBullets"
import type { ListenAutoAnswer } from "./useListenSession"

interface ListenAutoAnswerCardProps {
  readonly answer: ListenAutoAnswer
  readonly onRetry: (requestId: string) => void
  readonly onStop: (requestId: string) => void
}

export function ListenAutoAnswerCard(props: ListenAutoAnswerCardProps) {
  const bullets = toAskBullets(props.answer.answer)
  return (
    <div className="rounded-xl border border-teal-400/20 bg-teal-400/5 px-3 py-2">
      <p className="text-xs font-medium text-white/60">{props.answer.question}</p>
      {props.answer.status === "streaming" && props.answer.answer.trim() === "" ? (
        <p className="mt-1 animate-pulse text-xs text-white/50">Answering…</p>
      ) : null}
      {bullets.length > 0 ? (
        <div className="mt-1">
          <AskAnswerBullets bullets={bullets} />
        </div>
      ) : null}
      {props.answer.status === "done" && bullets.length === 0 ? (
        <p className="mt-1 text-xs text-white/50">{emptyAskFallback}</p>
      ) : null}
      {props.answer.status === "streaming" ? (
        <button
          type="button"
          onClick={() => {
            props.onStop(props.answer.requestId)
          }}
          className="mt-2 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
        >
          Stop
        </button>
      ) : null}
      {props.answer.status === "error" ? (
        <div className="mt-2">
          <p className="text-xs text-red-200/80">{props.answer.errorMessage}</p>
          <button
            type="button"
            onClick={() => {
              props.onRetry(props.answer.requestId)
            }}
            className="mt-1.5 rounded-lg border border-red-400/30 bg-red-500/20 px-2.5 py-1 text-xs font-medium text-red-100 hover:bg-red-500/30"
          >
            Retry
          </button>
        </div>
      ) : null}
      {props.answer.status === "done" && bullets.length === 0 ? (
        <button
          type="button"
          onClick={() => {
            props.onRetry(props.answer.requestId)
          }}
          className="mt-2 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
        >
          Retry
        </button>
      ) : null}
    </div>
  )
}

import { formatListenDuration } from "./ListenTimer"

interface ListenStatusPillProps {
  readonly audioOn: boolean
  readonly listenSeconds: number
  readonly onEndListen: () => void
  readonly onHideOverlay: () => void
  readonly onResume: () => void
  readonly onToggleAudio: () => void
  readonly running: boolean
}

export function ListenStatusPill(props: ListenStatusPillProps) {
  const stateText = props.running ? "Listening" : "Stopped"
  const stateDot = props.running ? "bg-emerald-400" : "bg-amber-400"
  const audioText = props.audioOn ? "Mute" : "Unmute"
  return (
    <section className="live-status-bar" aria-label="Live session status">
      <span className="live-status-label">
        <span className={`h-1.5 w-1.5 rounded-full ${stateDot}`} aria-hidden="true" />
        {stateText}
      </span>
      <span className="live-status-time">{formatListenDuration(props.listenSeconds)}</span>
      <div className="ml-auto flex items-center gap-1.5">
      <button
        type="button"
        onClick={props.onToggleAudio}
        className="overlay-button rounded-full px-2 py-0.5"
      >
        {audioText}
      </button>
      {props.running ? (
        <button
          type="button"
          onClick={props.onEndListen}
          className="overlay-primary-button rounded-full px-2 py-0.5"
        >
          End
        </button>
      ) : (
        <button
          type="button"
          onClick={props.onResume}
          className="overlay-button rounded-full px-2 py-0.5"
        >
          Resume
        </button>
      )}
      <button
        type="button"
        onClick={props.onHideOverlay}
        aria-label="Hide overlay"
        className="rounded-full px-1.5 py-0.5 text-xs text-white/60 hover:bg-white/10 hover:text-white"
      >
        {"\u00D7"}
      </button>
      </div>
    </section>
  )
}

import { OverlayLogoMark } from "../overlay/OverlayLogoMark"
import { formatListenDuration } from "./ListenTimer"

interface ListenStatusPillProps {
  readonly listening: boolean
  readonly audioOn: boolean
  readonly listenSeconds: number
  readonly onToggleAudio: () => void
  readonly onEndListen: () => void
  readonly onHideOverlay: () => void
}

const dragDots: ReadonlyArray<number> = [0, 1, 2, 3, 4, 5]

export function ListenStatusPill(props: ListenStatusPillProps) {
  const stateText = props.listening ? "Listening" : "Paused"
  const stateDot = props.listening ? "bg-emerald-400" : "bg-amber-400"
  const audioText = props.audioOn ? "Mute" : "Unmute"
  return (
    <div className="overlay-drag flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
      <span className="grid grid-cols-2 gap-0.5" aria-hidden="true">
        {dragDots.map((dot) => (
          <span key={dot} className="h-1 w-1 rounded-full bg-white/40" />
        ))}
      </span>
      <OverlayLogoMark />
      <span className="flex items-center gap-1.5 text-xs font-medium text-white/90">
        <span className={`h-1.5 w-1.5 rounded-full ${stateDot}`} aria-hidden="true" />
        {stateText}
      </span>
      <button
        type="button"
        onClick={props.onToggleAudio}
        className="overlay-no-drag rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10"
      >
        {audioText}
      </button>
      <button
        type="button"
        onClick={props.onEndListen}
        className="overlay-no-drag rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/90 hover:bg-white/15"
      >
        {`End ${formatListenDuration(props.listenSeconds)}`}
      </button>
      <button
        type="button"
        onClick={props.onHideOverlay}
        aria-label="Hide overlay"
        className="overlay-no-drag rounded-full px-1.5 py-0.5 text-xs text-white/60 hover:bg-white/10 hover:text-white"
      >
        {"\u00D7"}
      </button>
    </div>
  )
}

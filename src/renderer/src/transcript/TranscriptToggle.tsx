interface TranscriptToggleProps {
  readonly open: boolean
  readonly onToggle: () => void
}

export function TranscriptToggle(props: TranscriptToggleProps) {
  return (
    <button
      type="button"
      onClick={props.onToggle}
      className="overlay-button rounded-full px-2 py-0.5 text-violet-100"
    >
      {props.open ? "Hide Transcript" : "Show Transcript"}
    </button>
  )
}

interface TranscriptToggleProps {
  readonly open: boolean
  readonly onToggle: () => void
}

export function TranscriptToggle(props: TranscriptToggleProps) {
  return (
    <button
      type="button"
      onClick={props.onToggle}
      className="text-xs font-medium text-sky-300 hover:text-sky-200"
    >
      {props.open ? "Hide Transcript" : "Show Transcript"}
    </button>
  )
}

interface AssistActionsProps {
  readonly onTellMore: () => void
  readonly onCopy: () => void
  readonly copied: boolean
}

export function AssistActions(props: AssistActionsProps) {
  return (
    <div className="flex flex-none items-center gap-2">
      <button
        type="button"
        onClick={props.onTellMore}
        className="overlay-button"
      >
        Tell Me More
      </button>
      <button
        type="button"
        onClick={props.onCopy}
        className="overlay-button"
      >
        {props.copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}

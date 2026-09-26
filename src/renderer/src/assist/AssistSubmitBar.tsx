interface AssistSubmitBarProps {
  readonly onAssist: () => void
  readonly onSubmit: () => void
  readonly canSubmit: boolean
}

export function AssistSubmitBar(props: AssistSubmitBarProps) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={props.onAssist}
        className="overlay-button border-dashed"
      >
        Get Answer
      </button>
      <button
        type="button"
        onClick={props.onSubmit}
        disabled={props.canSubmit === false}
        className="overlay-primary-button disabled:opacity-40"
      >
        Submit
      </button>
    </div>
  )
}

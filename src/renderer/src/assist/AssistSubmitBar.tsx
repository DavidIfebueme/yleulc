interface AssistSubmitBarProps {
  readonly onAssist: () => void
  readonly onSubmit: () => void
  readonly canSubmit: boolean
}

export function AssistSubmitBar(props: AssistSubmitBarProps) {
  return (
    <div className="mt-2 flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={props.onAssist}
        className="overlay-button min-w-0 flex-1 border-dashed py-2 text-sm"
      >
        Get Answer
      </button>
      <button
        type="button"
        onClick={props.onSubmit}
        disabled={props.canSubmit === false}
        className="overlay-primary-button shrink-0 py-2 text-sm disabled:opacity-40"
      >
        Submit
      </button>
    </div>
  )
}

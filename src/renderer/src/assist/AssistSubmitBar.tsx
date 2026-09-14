interface AssistSubmitBarProps {
  readonly onAssist: () => void
  readonly onSubmit: () => void
  readonly canSubmit: boolean
}

export function AssistSubmitBar(props: AssistSubmitBarProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={props.onAssist}
        className="flex-1 rounded-xl border border-dashed border-white/25 px-3 py-2 text-sm text-white/80 hover:border-white/40 hover:text-white"
      >
        Get Answer
      </button>
      <button
        type="button"
        onClick={props.onSubmit}
        disabled={props.canSubmit === false}
        className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
      >
        Submit
      </button>
    </div>
  )
}

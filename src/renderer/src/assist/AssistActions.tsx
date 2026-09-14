interface AssistActionsProps {
  readonly onTellMore: () => void
  readonly onCopy: () => void
  readonly copied: boolean
}

export function AssistActions(props: AssistActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={props.onTellMore}
        className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
      >
        Tell Me More
      </button>
      <button
        type="button"
        onClick={props.onCopy}
        className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
      >
        {props.copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}

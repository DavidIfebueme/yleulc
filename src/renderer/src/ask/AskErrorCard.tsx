interface AskErrorCardProps {
  readonly message: string
  readonly onRetry: () => void
}

export function AskErrorCard(props: AskErrorCardProps) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
      <p className="text-sm font-medium text-red-200">Answer failed</p>
      <p className="mt-0.5 text-xs text-red-200/80">{props.message}</p>
      <button
        type="button"
        onClick={props.onRetry}
        className="mt-2 rounded-lg border border-red-400/30 bg-red-500/20 px-2.5 py-1 text-xs font-medium text-red-100 hover:bg-red-500/30"
      >
        Retry
      </button>
    </div>
  )
}

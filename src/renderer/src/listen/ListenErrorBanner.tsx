interface ListenErrorBannerProps {
  readonly message: string
  readonly onDismiss: () => void
}

export function ListenErrorBanner(props: ListenErrorBannerProps) {
  return (
    <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-amber-200">Transcription engine issue</p>
        <button
          type="button"
          onClick={props.onDismiss}
          aria-label="Dismiss engine notice"
          className="rounded-full px-1.5 py-0.5 text-xs text-amber-200/70 hover:bg-amber-500/20 hover:text-amber-100"
        >
          {"\u00D7"}
        </button>
      </div>
      <p className="mt-0.5 text-xs text-amber-200/80">{props.message}</p>
    </div>
  )
}

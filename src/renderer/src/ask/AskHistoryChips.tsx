interface AskHistoryChipsProps {
  readonly questions: ReadonlyArray<string>
  readonly onSelect: (question: string) => void
}

export function AskHistoryChips(props: AskHistoryChipsProps) {
  if (props.questions.length === 0) {
    return null
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {props.questions.map((question) => (
        <button
          key={question}
          type="button"
          onClick={() => props.onSelect(question)}
          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/10 hover:text-white/90"
        >
          {question}
        </button>
      ))}
    </div>
  )
}

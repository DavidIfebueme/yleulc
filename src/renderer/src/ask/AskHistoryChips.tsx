interface AskHistoryChipsProps {
  readonly questions: ReadonlyArray<string>
  readonly onSelect: (question: string) => void
}

export function AskHistoryChips(props: AskHistoryChipsProps) {
  if (props.questions.length === 0) {
    return null
  }
  return (
    <div className="overlay-action-strip">
      {props.questions.map((question) => (
        <button
          key={question}
          type="button"
          onClick={() => props.onSelect(question)}
          className="overlay-button shrink-0 rounded-full font-normal text-white/65"
        >
          {question}
        </button>
      ))}
    </div>
  )
}

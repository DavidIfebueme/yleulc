interface AssistQuickChipsProps {
  readonly chips: ReadonlyArray<string>
  readonly onSelect: (chip: string) => void
}

export function AssistQuickChips(props: AssistQuickChipsProps) {
  return (
    <div className="overlay-action-strip">
      {props.chips.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => props.onSelect(chip)}
          className="overlay-button shrink-0 text-left text-sky-100/90"
        >
          {chip}
        </button>
      ))}
    </div>
  )
}

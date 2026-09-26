interface AssistQuickChipsProps {
  readonly chips: ReadonlyArray<string>
  readonly onSelect: (chip: string) => void
}

export function AssistQuickChips(props: AssistQuickChipsProps) {
  return (
    <div className="overlay-action-strip min-w-0 flex-1">
      {props.chips.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => props.onSelect(chip)}
          className="overlay-button shrink-0 text-left text-violet-100/90"
        >
          {chip}
        </button>
      ))}
    </div>
  )
}

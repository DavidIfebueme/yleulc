interface AssistQuickChipsProps {
  readonly chips: ReadonlyArray<string>
  readonly onSelect: (chip: string) => void
}

export function AssistQuickChips(props: AssistQuickChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {props.chips.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => props.onSelect(chip)}
          className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-sky-200/90 hover:bg-white/15"
        >
          {chip}
        </button>
      ))}
    </div>
  )
}

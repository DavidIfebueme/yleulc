interface AssistQuickChipsProps {
  readonly chips: ReadonlyArray<string>
  readonly onSelect: (chip: string) => void
}

export function AssistQuickChips(props: AssistQuickChipsProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {props.chips.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => props.onSelect(chip)}
          className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-left text-[11px] text-sky-200/90 hover:bg-white/10"
        >
          {chip}
        </button>
      ))}
    </div>
  )
}

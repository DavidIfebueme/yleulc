export interface StealthToggleValue {
  readonly autoHideOnPortalScreencast: boolean
  readonly showSingleWindowGuidance: boolean
}

interface StealthTogglesProps {
  readonly onChange: (value: StealthToggleValue) => void
  readonly value: StealthToggleValue
}

export function StealthToggles(props: StealthTogglesProps) {
  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between text-xs text-white/70">
        <span>Auto-hide while portal screencast is active</span>
        <input
          type="checkbox"
          checked={props.value.autoHideOnPortalScreencast}
          onChange={() => {
            props.onChange({
              autoHideOnPortalScreencast: !props.value.autoHideOnPortalScreencast,
              showSingleWindowGuidance: props.value.showSingleWindowGuidance
            })
          }}
        />
      </label>
      <label className="flex items-center justify-between text-xs text-white/70">
        <span>Show share-a-single-window guidance</span>
        <input
          type="checkbox"
          checked={props.value.showSingleWindowGuidance}
          onChange={() => {
            props.onChange({
              autoHideOnPortalScreencast: props.value.autoHideOnPortalScreencast,
              showSingleWindowGuidance: !props.value.showSingleWindowGuidance
            })
          }}
        />
      </label>
    </div>
  )
}

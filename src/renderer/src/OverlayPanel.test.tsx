import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { defaultSettingsSnapshot } from "../../shared/settingsIpc"
import { MeetingPanel } from "./history/MeetingPanel"
import { ListenPanel } from "./listen/ListenPanel"
import { OverlayPanel } from "./OverlayPanel"
import { ProtectionDashboard } from "./protection/ProtectionDashboard"
import { SettingsPanel } from "./settings/SettingsPanel"

Object.defineProperty(globalThis, "window", { value: {} })

describe("OverlayPanel", () => {
  it("keeps the overlay viewport bounded and assigns scrolling to content panels", () => {
    const markup = renderToStaticMarkup(<OverlayPanel />)
    expect(markup).toContain('class="overlay-viewport" data-overlay-viewport="bounded"')
    expect(markup).toContain('class="overlay-surface"')
    expect(markup).toContain('class="overlay-ask-content" data-scroll-region="ask"')
  })

  it("renders every overlay panel with the shared control system", () => {
    const settings = renderToStaticMarkup(
      <SettingsPanel
        keybinds={defaultSettingsSnapshot.keybinds}
        modesPrompts={defaultSettingsSnapshot.modesPrompts}
        onKeybindRebind={() => undefined}
        onModesPromptsChange={() => undefined}
        onReset={() => undefined}
        providerOptions={[]}
      />
    )
    const activity = renderToStaticMarkup(<MeetingPanel transcript={[]} />)
    const listen = renderToStaticMarkup(<ListenPanel />)
    const protection = renderToStaticMarkup(<ProtectionDashboard />)

    expect(settings).toContain('class="overlay-section')
    expect(settings).toContain('class="overlay-input')
    expect(activity).toContain('class="overlay-card"')
    expect(listen).toContain('class="overlay-card')
    expect(protection).toContain('class="overlay-section')
  })
})

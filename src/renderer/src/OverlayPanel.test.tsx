import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { defaultSettingsSnapshot } from "../../shared/settingsIpc"
import { MeetingPanel } from "./history/MeetingPanel"
import { ListenPanel } from "./listen/ListenPanel"
import { ListenStatusPill } from "./listen/ListenStatusPill"
import { OverlayPanel } from "./OverlayPanel"
import { ProtectionDashboard } from "./protection/ProtectionDashboard"
import { SettingsPanel } from "./settings/SettingsPanel"

Object.defineProperty(globalThis, "window", { value: {} })

describe("OverlayPanel", () => {
  it("keeps the release viewport bounded and assigns scrolling to content panels", () => {
    const markup = renderToStaticMarkup(<OverlayPanel />)
    expect(markup).toContain('class="overlay-viewport" data-overlay-viewport="bounded" data-release-size="420x320"')
    expect(markup).toContain('class="overlay-surface"')
    expect(markup).toContain('class="overlay-app-header overlay-drag"')
    expect(markup).toContain('class="live-status-bar" aria-label="Live session status"')
    expect(markup).toContain('class="overlay-main-region" data-overlay-main="bounded"')
    expect(markup).toContain('class="overlay-ask-content" data-scroll-region="ask"')
  })

  it("keeps the 420 by 320 visual hierarchy in the renderer DOM", () => {
    const markup = renderToStaticMarkup(<OverlayPanel />)

    expect(markup).toContain('data-release-size="420x320"')
    expect(markup).toContain('class="ask-panel-shell text-white" data-overlay-panel="ask"')
    expect(markup).toContain('class="live-status-bar" aria-label="Live session status"')
    expect(markup).toContain('class="ask-context-bar"')
    expect(markup).toContain('class="overlay-ask-content" data-scroll-region="ask"')
    expect(markup).toContain('class="ask-composer"')
  })

  it("shows stopped with resume when the session is not running", () => {
    const running = renderToStaticMarkup(
      <ListenStatusPill
        audioOn
        listenSeconds={5}
        onEndListen={() => undefined}
        onHideOverlay={() => undefined}
        onResume={() => undefined}
        onToggleAudio={() => undefined}
        running
      />
    )
    const stopped = renderToStaticMarkup(
      <ListenStatusPill
        audioOn
        listenSeconds={5}
        onEndListen={() => undefined}
        onHideOverlay={() => undefined}
        onResume={() => undefined}
        onToggleAudio={() => undefined}
        running={false}
      />
    )
    expect(running).toContain("Listening")
    expect(running).toContain("End")
    expect(stopped).toContain("Stopped")
    expect(stopped).toContain("Resume")
  })

  it("renders every overlay panel with the shared control system", () => {
    const settings = renderToStaticMarkup(
      <SettingsPanel
        autoAnswer={defaultSettingsSnapshot.listen.autoAnswer}
        keybinds={defaultSettingsSnapshot.keybinds}
        modesPrompts={defaultSettingsSnapshot.modesPrompts}
        onAutoAnswerChange={() => undefined}
        onKeybindRebind={() => undefined}
        onModesPromptsChange={() => undefined}
        onProviderRemove={() => undefined}
        onProviderSave={() => undefined}
        onProviderTest={() => undefined}
        onReset={() => undefined}
        providerOptions={[]}
        providerRows={[]}
        providerTestMessages={{}}
        testingProviderIds={[]}
      />
    )
    const activity = renderToStaticMarkup(<MeetingPanel transcript={[]} />)
    const listen = renderToStaticMarkup(
      <ListenPanel
        answers={[]}
        entries={[]}
        engineError={undefined}
        onDismissEngineError={() => undefined}
        onRetryAnswer={() => undefined}
        onStopAnswer={() => undefined}
        running={false}
        systemAudio="unsupported"
      />
    )
    const protection = renderToStaticMarkup(<ProtectionDashboard />)

    expect(settings).toContain('class="overlay-section')
    expect(settings).toContain('class="overlay-input')
    expect(activity).toContain('class="overlay-card"')
    expect(listen).toContain('class="overlay-card')
    expect(protection).toContain('class="overlay-section')
  })

  it("keeps quick actions and answer actions from clipping the composer", () => {
    const markup = renderToStaticMarkup(<OverlayPanel />)
    expect(markup).toContain('class="overlay-action-strip min-w-0 flex-1"')
    expect(markup).toContain('class="flex flex-none items-center gap-2"')
    expect(markup).toContain('class="ask-composer"')
    expect(markup).toContain('class="ask-action-strip"')
  })

  it("keeps tell me more and copy actions in the empty state", () => {
    const markup = renderToStaticMarkup(<OverlayPanel />)
    expect(markup).toContain("Tell Me More")
    expect(markup).toContain("Copy")
    expect(markup).toContain("Ask for the next answer, a recap, or help with what is on screen.")
  })
})

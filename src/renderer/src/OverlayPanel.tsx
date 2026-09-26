import { useEffect, useRef, useState } from "react"
import type { ListenTranscriptEntry } from "../../shared/listenIpc"
import { toMeetingTranscript, type MeetingTranscript } from "../../shared/meeting"
import { defaultSettingsSnapshot, type SettingsSnapshot } from "../../shared/settingsIpc"
import type { ProviderSettingsProvider } from "../../shared/providerIpc"
import { describeSettingsSaveFailure, makeSettingsSaveQueue, type SettingsUpdate } from "../../shared/settingsSaveQueue"
import { AskPanel } from "./ask/AskPanel"
import { MeetingPanel } from "./history/MeetingPanel"
import { SettingsDashboard } from "./settings/SettingsDashboard"
import { ProtectionDashboard } from "./protection/ProtectionDashboard"

export function OverlayPanel() {
  const [settings, setSettings] = useState<SettingsSnapshot | undefined>(() =>
    typeof window.yleulc === "undefined" ? defaultSettingsSnapshot : undefined
  )
  const [settingsSaveError, setSettingsSaveError] = useState("")
  const [providers, setProviders] = useState<ReadonlyArray<ProviderSettingsProvider>>([])
  const [activePanel, setActivePanel] = useState<"ask" | "activity" | "settings" | "protection">("ask")
  const [meetingTranscript, setMeetingTranscript] = useState<MeetingTranscript>([])
  const saveQueue = useRef(
    makeSettingsSaveQueue(defaultSettingsSnapshot, (snapshot) =>
      typeof window.yleulc === "undefined" ? Promise.resolve(snapshot) : window.yleulc.saveSettings(snapshot)
    )
  )

  useEffect(() => {
    if (typeof window.yleulc === "undefined") {
      return
    }
    void window.yleulc.getSettings().then(
      (snapshot) => {
        if (saveQueue.current.hydrate(snapshot)) {
          setSettings(snapshot)
          setSettingsSaveError("")
        }
      },
      () => {
        setSettingsSaveError("settings could not be loaded")
      }
    )
  }, [])

  useEffect(() => {
    if (typeof window.yleulc === "undefined") {
      return
    }
    void window.yleulc.getProviderSettings().then(setProviders)
  }, [])

  const saveSettings = (update: SettingsUpdate): void => {
    void saveQueue.current.enqueue(update).then(
      (saved) => {
        setSettings(saved)
        setSettingsSaveError("")
      },
      (cause: unknown) => {
        setSettingsSaveError(describeSettingsSaveFailure(cause))
      }
    )
  }

  const handleTranscriptChange = (entries: ReadonlyArray<ListenTranscriptEntry>): void => {
    setMeetingTranscript(toMeetingTranscript(entries))
  }

  return (
    <div className="overlay-viewport" data-overlay-viewport="bounded" data-release-size="420x320">
      <div className="overlay-surface">
        <header className="overlay-app-header overlay-drag">
          <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-white/80">
            <span className="truncate">yleulc</span>
          </div>
          <nav className="overlay-no-drag overlay-app-nav" aria-label="Overlay navigation">
            {(["ask", "activity", "settings", "protection"] as const).map((panel) => (
              <button
                key={panel}
                type="button"
                onClick={() => {
                  setActivePanel(panel)
                }}
                aria-current={activePanel === panel ? "page" : undefined}
                className="overlay-nav-button"
              >
                {panel}
              </button>
            ))}
          </nav>
        </header>
        <main className="overlay-main-region" data-overlay-main="bounded">
          {activePanel === "protection" ? (
            <div className="overlay-content-panel">
              <ProtectionDashboard />
            </div>
          ) : activePanel === "activity" ? (
            <div className="overlay-content-panel">
              <MeetingPanel transcript={meetingTranscript} />
            </div>
          ) : activePanel === "settings" ? (
            settings === undefined ? (
              <p className="overlay-empty-state">
                {settingsSaveError === "" ? "Loading settings..." : settingsSaveError}
              </p>
            ) : (
              <div className="overlay-content-panel">
                <SettingsDashboard
                  settings={settings}
                  errorMessage={settingsSaveError}
                  onSettingsChange={saveSettings}
                  providers={providers}
                  onProviderSave={(providerId, key) => window.yleulc.saveProviderKey(providerId, key).then(setProviders)}
                  onProviderRemove={(providerId) => window.yleulc.removeProviderKey(providerId).then(setProviders)}
                  onProviderTest={(providerId) => window.yleulc.testProviderKey(providerId).then((result) => result.models)}
                />
              </div>
            )
          ) : settings === undefined ? (
            <p className="overlay-empty-state">
              {settingsSaveError === "" ? "Loading settings..." : settingsSaveError}
            </p>
          ) : (
            <AskPanel
              activePromptModeId={settings.modesPrompts.activePromptModeId}
              initialMode={settings.modesPrompts.defaultMode}
              keybinds={settings.keybinds}
              settingsSaveError={settingsSaveError}
              promptModes={settings.modesPrompts.promptModes}
              onTranscriptChange={handleTranscriptChange}
              onActivePromptModeChange={(activePromptModeId) => {
                saveSettings((snapshot) => ({
                  ...snapshot,
                  modesPrompts: { ...snapshot.modesPrompts, activePromptModeId }
                }))
              }}
            />
          )}
        </main>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from "react"
import type { ListenTranscriptEntry } from "../../shared/listenIpc"
import { toMeetingTranscript, type MeetingTranscript } from "../../shared/meeting"
import { defaultSettingsSnapshot, type SettingsSnapshot } from "../../shared/settingsIpc"
import type { ProviderSettingsProvider } from "../../shared/providerIpc"
import { makeSettingsSaveQueue, type SettingsUpdate } from "../../shared/settingsSaveQueue"
import { AskPanel } from "./ask/AskPanel"
import { MeetingPanel } from "./history/MeetingPanel"
import { OverlayLogoMark } from "./overlay/OverlayLogoMark"
import { SettingsDashboard } from "./settings/SettingsDashboard"
import { ProtectionDashboard } from "./protection/ProtectionDashboard"

export function OverlayPanel() {
  const [settings, setSettings] = useState<SettingsSnapshot | undefined>(() =>
    typeof window.yleulc === "undefined" ? defaultSettingsSnapshot : undefined
  )
  const [settingsSaveError, setSettingsSaveError] = useState("")
  const [providers, setProviders] = useState<ReadonlyArray<ProviderSettingsProvider>>([])
  const [showSettings, setShowSettings] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [showProtection, setShowProtection] = useState(false)
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
      () => {
        setSettingsSaveError("settings could not be saved")
      }
    )
  }

  const handleTranscriptChange = (entries: ReadonlyArray<ListenTranscriptEntry>): void => {
    setMeetingTranscript(toMeetingTranscript(entries))
  }

  return (
    <div className="overlay-viewport" data-overlay-viewport="bounded">
      <div className="overlay-surface">
        <div className="overlay-nav overlay-drag">
          <div className="flex items-center gap-2 text-xs font-medium text-white/80">
            <span className="grid grid-cols-2 gap-0.5" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((dot) => (
                <span key={dot} className="h-1 w-1 rounded-full bg-white/35" />
              ))}
            </span>
            <OverlayLogoMark />
            <span>{showActivity ? "Activity" : showSettings ? "Settings" : showProtection ? "Protection" : "Live insights"}</span>
          </div>
          <div className="overlay-no-drag flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setShowActivity((visible) => !visible)
                setShowSettings(false)
                setShowProtection(false)
              }}
              className="overlay-nav-button"
            >
              {showActivity ? "Back" : "Activity"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSettings((visible) => !visible)
                setShowActivity(false)
                setShowProtection(false)
              }}
              className="overlay-nav-button"
            >
              {showSettings ? "Back" : "Settings"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowProtection((visible) => !visible)
                setShowActivity(false)
                setShowSettings(false)
              }}
              className="overlay-nav-button"
            >
              {showProtection ? "Back" : "Protection"}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {showProtection ? (
            <div className="overlay-content-panel">
              <ProtectionDashboard />
            </div>
          ) : showActivity ? (
            <div className="overlay-content-panel">
              <MeetingPanel transcript={meetingTranscript} />
            </div>
          ) : showSettings ? (
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
        </div>
      </div>
    </div>
  )
}

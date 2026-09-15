import { useEffect, useRef, useState } from "react"
import { defaultSettingsSnapshot, type SettingsSnapshot } from "../../shared/settingsIpc"
import { makeSettingsSaveQueue, type SettingsUpdate } from "../../shared/settingsSaveQueue"
import { AskPanel } from "./ask/AskPanel"
import { SettingsDashboard } from "./settings/SettingsDashboard"

export function OverlayPanel() {
  const [settings, setSettings] = useState<SettingsSnapshot>(defaultSettingsSnapshot)
  const [settingsSaveError, setSettingsSaveError] = useState("")
  const [showSettings, setShowSettings] = useState(false)
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
        setSettings(snapshot)
        saveQueue.current.hydrate(snapshot)
        setSettingsSaveError("")
      },
      () => {
        setSettingsSaveError("settings could not be loaded")
      }
    )
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

  return (
    <div className="flex h-screen w-screen items-start justify-center bg-transparent p-4">
      <div className="space-y-2">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setShowSettings((visible) => !visible)
            }}
            className="rounded-lg border border-white/15 bg-slate-950/80 px-2 py-1 text-xs text-white/80 shadow-2xl backdrop-blur-xl hover:bg-white/10"
          >
            {showSettings ? "Back" : "Settings"}
          </button>
        </div>
        {showSettings ? (
          <SettingsDashboard settings={settings} errorMessage={settingsSaveError} onSettingsChange={saveSettings} />
        ) : (
          <AskPanel
            activePromptModeId={settings.modesPrompts.activePromptModeId}
            settingsSaveError={settingsSaveError}
            promptModes={settings.modesPrompts.promptModes}
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
  )
}

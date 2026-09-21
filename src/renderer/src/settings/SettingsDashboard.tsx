import { useRef, useState } from "react"
import { canRebindKeybind } from "../../../shared/keybinds"
import type { ProviderSettingsProvider } from "../../../shared/providerIpc"
import { defaultSettingsSnapshot, type SettingsSnapshot } from "../../../shared/settingsIpc"
import { makeSettingsDraft, type SettingsUpdate } from "../../../shared/settingsSaveQueue"
import { SettingsPanel } from "./SettingsPanel"

interface SettingsDashboardProps {
  readonly errorMessage: string
  readonly onSettingsChange: (update: SettingsUpdate) => void
  readonly onProviderRemove: (id: ProviderSettingsProvider["id"]) => Promise<void>
  readonly onProviderSave: (id: ProviderSettingsProvider["id"], key: string) => Promise<void>
  readonly onProviderTest: (id: ProviderSettingsProvider["id"]) => Promise<ReadonlyArray<string>>
  readonly providers: ReadonlyArray<ProviderSettingsProvider>
  readonly settings: SettingsSnapshot
}

export function SettingsDashboard(props: SettingsDashboardProps) {
  const [keybindError, setKeybindError] = useState("")
  const [providerMessages, setProviderMessages] = useState<Record<string, string>>({})
  const [providerModels, setProviderModels] = useState<Record<string, ReadonlyArray<string>>>({})
  const [testingProviderIds, setTestingProviderIds] = useState<ReadonlyArray<string>>([])
  const settingsDraft = useRef(makeSettingsDraft(props.settings))
  const save = (update: SettingsUpdate): void => {
    settingsDraft.current.apply(update)
    props.onSettingsChange(update)
  }
  const providerOptions = props.providers
    .filter((provider) => !provider.registryMissing)
    .map((provider) => ({
      displayName: provider.displayName,
      id: provider.id,
      models: providerModels[provider.id] ?? []
    }))

  return (
    <>
      <SettingsPanel
        keybinds={props.settings.keybinds}
        modesPrompts={props.settings.modesPrompts}
        onKeybindRebind={(action, combo) => {
          if (!canRebindKeybind(settingsDraft.current.current().keybinds, action, combo)) {
            setKeybindError("That shortcut is already assigned to another action.")
            return
          }
          setKeybindError("")
          save((snapshot) => ({ ...snapshot, keybinds: { ...snapshot.keybinds, [action]: combo } }))
        }}
        onModesPromptsChange={(update) => {
          save((snapshot) => ({ ...snapshot, modesPrompts: update(snapshot.modesPrompts) }))
        }}
        onProviderSave={(id, key) => {
          void props.onProviderSave(id, key).then(
            () => {
              setProviderMessages((messages) => ({ ...messages, [id]: "key saved" }))
            },
            () => {
              setProviderMessages((messages) => ({ ...messages, [id]: "key could not be saved" }))
            }
          )
        }}
        onProviderRemove={(id) => {
          void props.onProviderRemove(id).then(
            () => {
              setProviderMessages((messages) => ({ ...messages, [id]: "key removed" }))
              setProviderModels((models) => ({ ...models, [id]: [] }))
            },
            () => {
              setProviderMessages((messages) => ({ ...messages, [id]: "key could not be removed" }))
            }
          )
        }}
        onProviderTest={(id) => {
          setTestingProviderIds((ids) => [...ids, id])
          void props.onProviderTest(id).then(
            (models) => {
              setProviderModels((previous) => ({ ...previous, [id]: models }))
              setProviderMessages((messages) => ({ ...messages, [id]: `${String(models.length)} models available` }))
              setTestingProviderIds((ids) => ids.filter((testingId) => testingId !== id))
            },
            () => {
              setProviderMessages((messages) => ({ ...messages, [id]: "provider key could not be tested" }))
              setTestingProviderIds((ids) => ids.filter((testingId) => testingId !== id))
            }
          )
        }}
        onReset={() => {
          save(() => defaultSettingsSnapshot)
        }}
        providerOptions={providerOptions}
        providerRows={props.providers}
        providerTestMessages={providerMessages}
        testingProviderIds={testingProviderIds}
      />
      {props.errorMessage === "" ? null : <p className="mt-2 text-xs text-red-300/80">{props.errorMessage}</p>}
      {keybindError === "" ? null : <p className="mt-2 text-xs text-red-300/80">{keybindError}</p>}
    </>
  )
}

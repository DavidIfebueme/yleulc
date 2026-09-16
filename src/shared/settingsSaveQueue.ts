import type { SettingsSnapshot } from "./settingsIpc"

export type SettingsUpdate = (snapshot: SettingsSnapshot) => SettingsSnapshot

export interface SettingsSaveQueue {
  readonly current: () => SettingsSnapshot
  readonly enqueue: (update: SettingsUpdate) => Promise<SettingsSnapshot>
  readonly hydrate: (snapshot: SettingsSnapshot) => boolean
}

export interface SettingsDraft {
  readonly apply: (update: SettingsUpdate) => SettingsSnapshot
  readonly current: () => SettingsSnapshot
}

export function makeSettingsDraft(initial: SettingsSnapshot): SettingsDraft {
  let current = initial
  return {
    apply: (update) => {
      current = update(current)
      return current
    },
    current: () => current
  }
}

export function makeSettingsSaveQueue(
  initial: SettingsSnapshot,
  save: (snapshot: SettingsSnapshot) => Promise<SettingsSnapshot>
): SettingsSaveQueue {
  let current = initial
  let writes = Promise.resolve()
  let localGeneration = 0
  const enqueue = (update: SettingsUpdate): Promise<SettingsSnapshot> => {
    localGeneration = localGeneration + 1
    const write = writes.then(() =>
      save(update(current)).then((saved) => {
        current = saved
        return saved
      })
    )
    writes = write.then(() => undefined, () => undefined)
    return write
  }
  const hydrate = (snapshot: SettingsSnapshot): boolean => {
    if (localGeneration === 0) {
      current = snapshot
      return true
    }
    return false
  }
  return { current: () => current, enqueue, hydrate }
}

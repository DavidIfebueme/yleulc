import type { SettingsSnapshot } from "./settingsIpc"

export type SettingsUpdate = (snapshot: SettingsSnapshot) => SettingsSnapshot

export interface SettingsSaveQueue {
  readonly current: () => SettingsSnapshot
  readonly enqueue: (update: SettingsUpdate) => Promise<SettingsSnapshot>
  readonly hydrate: (snapshot: SettingsSnapshot) => void
}

export function makeSettingsSaveQueue(
  initial: SettingsSnapshot,
  save: (snapshot: SettingsSnapshot) => Promise<SettingsSnapshot>
): SettingsSaveQueue {
  let current = initial
  let writes = Promise.resolve()
  let pending = 0
  const enqueue = (update: SettingsUpdate): Promise<SettingsSnapshot> => {
    pending = pending + 1
    const write = writes.then(() =>
      save(update(current)).then((saved) => {
        current = saved
        return saved
      })
    )
    writes = write.then(
      () => {
        pending = pending - 1
      },
      () => {
        pending = pending - 1
      }
    )
    return write
  }
  const hydrate = (snapshot: SettingsSnapshot): void => {
    if (pending === 0) {
      current = snapshot
    }
  }
  return { current: () => current, enqueue, hydrate }
}

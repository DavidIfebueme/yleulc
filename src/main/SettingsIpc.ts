import { Effect, Schema } from "effect"
import { SettingsSnapshotSchema, type SettingsSnapshot } from "../shared/settingsIpc"
import type { SettingsStoreShape } from "./SettingsStore"

const decodeSettingsSnapshot = Schema.decodeUnknownEffect(SettingsSnapshotSchema)

export function getSettings(store: SettingsStoreShape): Effect.Effect<SettingsSnapshot> {
  return store.getSnapshot()
}

export function saveSettings(raw: unknown, store: SettingsStoreShape): Effect.Effect<SettingsSnapshot, Error> {
  return Effect.gen(function* () {
    const snapshot = yield* decodeSettingsSnapshot(raw).pipe(
      Effect.mapError(() => new Error("invalid settings snapshot"))
    )
    yield* store.setSnapshot(snapshot)
    return yield* store.getSnapshot()
  })
}

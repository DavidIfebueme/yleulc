import { Effect, Schema } from "effect"
import { SettingsSnapshotSchema, isValidSettingsSnapshot, type SettingsSnapshot } from "../shared/settingsIpc"
import { SettingsStoreError, type SettingsStoreShape } from "./SettingsStore"

const decodeSettingsSnapshot = Schema.decodeUnknownEffect(SettingsSnapshotSchema)

export function getSettings(store: SettingsStoreShape): Effect.Effect<SettingsSnapshot> {
  return store.getSnapshot()
}

export function saveSettings(
  raw: unknown,
  store: SettingsStoreShape
): Effect.Effect<SettingsSnapshot, Error | SettingsStoreError> {
  return Effect.gen(function* () {
    const snapshot = yield* decodeSettingsSnapshot(raw).pipe(
      Effect.mapError(() => new Error("invalid settings snapshot"))
    )
    if (!isValidSettingsSnapshot(snapshot)) {
      return yield* Effect.fail(new Error("invalid prompt modes"))
    }
    yield* store.setSnapshot(snapshot)
    return yield* store.getSnapshot()
  })
}

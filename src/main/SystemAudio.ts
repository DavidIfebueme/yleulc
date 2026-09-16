import { Config, Effect } from "effect"
import type { ConfigError } from "effect/Config"
import type { SystemAudioSupport } from "../shared/listenIpc"

export const systemAudioSourceEnv = "YLEULC_SYSTEM_AUDIO_SOURCE"

export function resolveSystemAudioSupport(loopbackSource: string | undefined): SystemAudioSupport {
  if (loopbackSource !== undefined && loopbackSource.trim().length > 0) {
    return "supported"
  }
  return "unsupported"
}

export const systemAudioSupport: Effect.Effect<SystemAudioSupport, ConfigError> = Effect.map(
  Config.withDefault(Config.String(systemAudioSourceEnv), ""),
  (source) => resolveSystemAudioSupport(source)
)

import { Layer } from "effect"
import { AskService } from "./AskService"
import { Keychain } from "./Keychain"
import { ProviderRegistry } from "./providers/ProviderRegistry"

export function makeAskServiceLive(keychain: Layer.Layer<Keychain>): Layer.Layer<AskService> {
  return AskService.Live.pipe(Layer.provide(ProviderRegistry.Live.pipe(Layer.provide(keychain))))
}

export const AskServiceLive = makeAskServiceLive(Keychain.Live)

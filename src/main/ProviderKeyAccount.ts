import type { ProviderId } from "./providers/Provider"

export const providerKeyService = "yleulc"

export function providerKeyAccount(id: ProviderId): string {
  return id
}

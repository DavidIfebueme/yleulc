import { Schema } from "effect"
import { ProviderIdSchema } from "./settingsIpc"

export const providerSettingsGetChannel = "yleulc:provider-settings-get"

export const providerKeySaveChannel = "yleulc:provider-key-save"

export const providerKeyRemoveChannel = "yleulc:provider-key-remove"

export const providerKeyTestChannel = "yleulc:provider-key-test"

export const ProviderKeyRequestSchema = Schema.Struct({
  providerId: ProviderIdSchema
})

export type ProviderKeyRequest = typeof ProviderKeyRequestSchema.Type

export const ProviderKeySaveRequestSchema = Schema.Struct({
  key: Schema.String,
  providerId: ProviderIdSchema
})

export type ProviderKeySaveRequest = typeof ProviderKeySaveRequestSchema.Type

export const ProviderSettingsProviderSchema = Schema.Struct({
  displayName: Schema.String,
  hasKeychainKey: Schema.Boolean,
  id: ProviderIdSchema,
  registryMissing: Schema.Boolean
})

export type ProviderSettingsProvider = typeof ProviderSettingsProviderSchema.Type

export const ProviderKeyTestResultSchema = Schema.Struct({
  models: Schema.Array(Schema.String),
  providerId: ProviderIdSchema
})

export type ProviderKeyTestResult = typeof ProviderKeyTestResultSchema.Type

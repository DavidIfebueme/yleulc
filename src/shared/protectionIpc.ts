import { Schema } from "effect"

export const ProtectionAppIdSchema = Schema.Literals(["chrome", "firefox", "zoom", "discord"])

export type ProtectionAppId = typeof ProtectionAppIdSchema.Type

export const ProtectionStateSchema = Schema.Literals(["not installed", "running unwrapped", "running wrapped", "verified"])

export type ProtectionState = typeof ProtectionStateSchema.Type

export const ProtectionAppSchema = Schema.Struct({
  id: ProtectionAppIdSchema,
  label: Schema.String,
  pids: Schema.Array(Schema.Number),
  state: ProtectionStateSchema
})

export type ProtectionApp = typeof ProtectionAppSchema.Type

export const ProtectionDashboardSchema = Schema.Struct({ apps: Schema.Array(ProtectionAppSchema) })

export type ProtectionDashboard = typeof ProtectionDashboardSchema.Type

export const ProtectionAppRequestSchema = Schema.Struct({ id: ProtectionAppIdSchema })

export type ProtectionAppRequest = typeof ProtectionAppRequestSchema.Type

export const ProtectionActionSchema = Schema.Struct({ apps: Schema.Array(ProtectionAppSchema) })

export type ProtectionAction = typeof ProtectionActionSchema.Type

export const protectionGetChannel = "yleulc:protection-get"

export const protectionRelaunchChannel = "yleulc:protection-relaunch"

export const protectionProtectAllChannel = "yleulc:protection-protect-all"

export const protectionUnwrappedChannel = "yleulc:protection-unwrapped"

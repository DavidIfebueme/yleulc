import { Effect, Schema } from "effect"
import { ProtectionAppRequestSchema, type ProtectionDashboard } from "../shared/protectionIpc"
import { type WrapperAppId } from "./WrapperRegistry"
import { ProtectionError, type ProtectionServiceShape } from "./ProtectionService"

const decodeProtectionAppRequest = Schema.decodeUnknownEffect(ProtectionAppRequestSchema)

export const getProtectionDashboard = (service: ProtectionServiceShape): Effect.Effect<ProtectionDashboard, ProtectionError> => service.dashboard()

export const relaunchProtectedApp = (raw: unknown, service: ProtectionServiceShape): Effect.Effect<ProtectionDashboard, Error> =>
  Effect.gen(function* () {
    const request = yield* decodeProtectionAppRequest(raw).pipe(Effect.mapError(() => new Error("invalid protection app request")))
    return yield* service.relaunch(request.id as WrapperAppId).pipe(Effect.mapError((error) => new Error(error.reason)))
  })

export const protectAllApps = (service: ProtectionServiceShape): Effect.Effect<ProtectionDashboard, Error> =>
  service.protectAll().pipe(Effect.mapError((error) => new Error(error.reason)))

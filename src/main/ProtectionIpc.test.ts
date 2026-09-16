import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { getProtectionDashboard, protectAllApps, relaunchProtectedApp } from "./ProtectionIpc"
import { ProtectionError, type ProtectionServiceShape } from "./ProtectionService"

const dashboard = { apps: [{ id: "firefox" as const, label: "Firefox", pids: [12], state: "running unwrapped" as const }] }

const service: ProtectionServiceShape = {
  dashboard: () => Effect.succeed(dashboard),
  protectAll: () => Effect.succeed(dashboard),
  relaunch: () => Effect.succeed(dashboard),
  watchUnwrapped: () => Effect.succeed(() => undefined)
}

describe("ProtectionIpc", () => {
  it("returns dashboard and action results", async () => {
    const result = await Effect.runPromise(
      Effect.all([getProtectionDashboard(service), relaunchProtectedApp({ id: "firefox" }, service), protectAllApps(service)])
    )
    expect(result).toEqual([dashboard, dashboard, dashboard])
  })

  it("rejects malformed relaunch requests", async () => {
    const error = await Effect.runPromise(Effect.flip(relaunchProtectedApp({ id: "brave" }, service)))
    expect(error.message).toBe("invalid protection app request")
  })

  it("preserves service errors", async () => {
    const failing: ProtectionServiceShape = { ...service, protectAll: () => Effect.fail(new ProtectionError({ reason: "read-proc" })) }
    const error = await Effect.runPromise(Effect.flip(protectAllApps(failing)))
    expect(error.reason).toBe("read-proc")
  })
})

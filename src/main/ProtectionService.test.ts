import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { ProtectionApp } from "../shared/protectionIpc"
import { ProtectionError, ProtectionService, ProtectionSystem, ProtectionTicker, type ProtectionProcess } from "./ProtectionService"
import { WrapperRegistry, type WrapperAppId } from "./WrapperRegistry"

const registryLayer = (started: Array<WrapperAppId> = []): Layer.Layer<WrapperRegistry> =>
  Layer.succeed(WrapperRegistry, {
    ...Effect.runSync(Effect.provide(Effect.gen(function* () {
      return yield* WrapperRegistry
    }), WrapperRegistry.Test)),
    startWrapped: (id) => {
      started.push(id)
      return Effect.succeed(true)
    }
  })

const systemLayer = (processes: ReadonlyArray<ProtectionProcess>, log = "", installed = false): Layer.Layer<ProtectionSystem> =>
  Layer.succeed(ProtectionSystem, {
    binaryExists: () => Effect.succeed(installed),
    listProcesses: () => Effect.succeed(processes),
    readRewriterLogTail: () => Effect.succeed(log)
  })

function serviceLayer(processes: ReadonlyArray<ProtectionProcess>, log = "", installed = false) {
  return Layer.provide(
    ProtectionService.Live,
    Layer.mergeAll(
    registryLayer(),
    systemLayer(processes, log, installed),
    Layer.succeed(ProtectionTicker, { every: () => Effect.succeed(() => undefined) })
    )
  )
}

const dashboard = (processes: ReadonlyArray<ProtectionProcess>, log = "", installed = false) =>
  Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        return yield* (yield* ProtectionService).dashboard()
      }),
      serviceLayer(processes, log, installed)
    )
  )

describe("ProtectionService", () => {
  it("reports not installed", async () => {
    const result = await dashboard([])
    expect(result.apps.map((app) => app.state)).toEqual(["not installed", "not installed", "not installed", "not installed"])
  })

  it("reports running unwrapped", async () => {
    const result = await dashboard([{ cmdline: "/usr/bin/firefox", environment: "PATH=/usr/bin", pid: 14 }])
    expect(result.apps.find((app) => app.id === "firefox")).toEqual({ id: "firefox", label: "Firefox", pids: [14], state: "running unwrapped" })
  })

  it("reports running wrapped", async () => {
    const result = await dashboard([{ cmdline: "/usr/bin/firefox", environment: "LD_PRELOAD=/tmp/capture_rewriter.so", pid: 14 }])
    expect(result.apps.find((app) => app.id === "firefox")?.state).toBe("running wrapped")
  })

  it("reports verified only for a hook line matching the process pid", async () => {
    const processes = [{ cmdline: "/usr/bin/firefox", environment: "LD_PRELOAD=/tmp/capture_rewriter.so", pid: 14 }]
    const verified = await dashboard(processes, "capture hook fired (pid=14)")
    const unmatched = await dashboard(processes, "capture hook fired (pid=15)")
    expect(verified.apps.find((app) => app.id === "firefox")?.state).toBe("verified")
    expect(unmatched.apps.find((app) => app.id === "firefox")?.state).toBe("running wrapped")
  })

  it("returns a process scan error", async () => {
    const layer = Layer.provide(
      ProtectionService.Live,
      Layer.mergeAll(
        registryLayer(),
        Layer.succeed(ProtectionSystem, {
          binaryExists: () => Effect.succeed(false),
          listProcesses: () => Effect.fail(new ProtectionError({ reason: "read-proc" })),
          readRewriterLogTail: () => Effect.succeed("")
        }),
        Layer.succeed(ProtectionTicker, { every: () => Effect.succeed(() => undefined) })
      )
    )
    const error = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          return yield* Effect.flip((yield* ProtectionService).dashboard())
        }),
        layer
      )
    )
    expect(error.reason).toBe("read-proc")
  })

  it("relaunches one app and protects all registered apps", async () => {
    const started: Array<WrapperAppId> = []
    const layer = Layer.provide(
      ProtectionService.Live,
      Layer.mergeAll(
      registryLayer(started),
      systemLayer([]),
      Layer.succeed(ProtectionTicker, { every: () => Effect.succeed(() => undefined) })
      )
    )
    await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const service = yield* ProtectionService
          yield* service.relaunch("firefox")
          yield* service.protectAll()
        }),
        layer
      )
    )
    expect(started).toEqual(["firefox", "chrome", "firefox", "zoom", "discord"])
  })

  it("notifies only when an app becomes running unwrapped and cleans up the watcher", async () => {
    let tick: (() => void) | undefined
    let stopped = false
    let processes: ReadonlyArray<ProtectionProcess> = []
    const notifications: Array<ProtectionApp> = []
    const layer = Layer.provide(
      ProtectionService.Live,
      Layer.mergeAll(
      registryLayer(),
      Layer.succeed(ProtectionSystem, {
        binaryExists: () => Effect.succeed(false),
        listProcesses: () => Effect.succeed(processes),
        readRewriterLogTail: () => Effect.succeed("")
      }),
      Layer.succeed(ProtectionTicker, {
        every: (run) =>
          Effect.succeed(() => {
            stopped = true
          }).pipe(
            Effect.tap(() => Effect.sync(() => {
              tick = run
            }))
          )
      })
      )
    )
    const stop = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          return yield* (yield* ProtectionService).watchUnwrapped((app) =>
            Effect.sync(() => {
              notifications.push(app)
            })
          )
        }),
        layer
      )
    )
    processes = [{ cmdline: "/usr/bin/firefox", environment: "", pid: 22 }]
    tick?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    tick?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    stop()
    expect(notifications.map((app) => app.id)).toEqual(["firefox"])
    expect(stopped).toBe(true)
  })
})

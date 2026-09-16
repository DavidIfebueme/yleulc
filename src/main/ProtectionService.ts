import { Context, Data, Effect, Layer } from "effect"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { ProtectionApp, ProtectionDashboard } from "../shared/protectionIpc"
import { rewriterLogPath } from "./BraveWrapper"
import { WrapperRegistry, type WrapperAppId, type WrapperRegistryShape, isAppCmdline } from "./WrapperRegistry"

export class ProtectionError extends Data.TaggedError("ProtectionError")<{
  readonly reason: string
}> {}

export interface ProtectionProcess {
  readonly cmdline: string
  readonly environment: string
  readonly pid: number
}

export interface ProtectionSystemShape {
  readonly binaryExists: (paths: ReadonlyArray<string>) => Effect.Effect<boolean, ProtectionError>
  readonly listProcesses: () => Effect.Effect<ReadonlyArray<ProtectionProcess>, ProtectionError>
  readonly readRewriterLogTail: () => Effect.Effect<string, ProtectionError>
}

export class ProtectionSystem extends Context.Service<ProtectionSystem, ProtectionSystemShape>()("ProtectionSystem") {
  static readonly Live = Layer.succeed(ProtectionSystem, {
    binaryExists: (paths) =>
      Effect.sync(() => paths.some((path) => existsSync(path))).pipe(
        Effect.mapError(() => new ProtectionError({ reason: "read-binaries" }))
      ),
    listProcesses: () =>
      Effect.try({
        try: () => readdirSync("/proc").filter((entry) => /^\d+$/.test(entry)),
        catch: () => new ProtectionError({ reason: "read-proc" })
      }).pipe(
        Effect.flatMap((pids) =>
          Effect.forEach(pids, (pidText) =>
            Effect.try({
              try: () => ({
                cmdline: readFileSync(join("/proc", pidText, "cmdline"), "utf8").split(String.fromCharCode(0)).join(" ").trim(),
                environment: readFileSync(join("/proc", pidText, "environ"), "utf8"),
                pid: Number(pidText)
              }),
              catch: () => new ProtectionError({ reason: "read-process" })
            }).pipe(Effect.catch(() => Effect.succeed(null)))
          )
        ),
        Effect.map((processes) => processes.filter((process): process is ProtectionProcess => process !== null))
      ),
    readRewriterLogTail: () =>
      Effect.try({
        try: () => readFileSync(rewriterLogPath(process.env["HOME"] ?? ""), "utf8").slice(-65536),
        catch: () => new ProtectionError({ reason: "read-rewriter-log" })
      })
  })
  static readonly Test = Layer.succeed(ProtectionSystem, {
    binaryExists: () => Effect.succeed(false),
    listProcesses: () => Effect.succeed([]),
    readRewriterLogTail: () => Effect.succeed("")
  })
}

export interface ProtectionTickerShape {
  readonly every: (run: () => void) => Effect.Effect<() => void, ProtectionError>
}

export class ProtectionTicker extends Context.Service<ProtectionTicker, ProtectionTickerShape>()("ProtectionTicker") {
  static readonly Live = Layer.succeed(ProtectionTicker, {
    every: (run) =>
      Effect.sync(() => {
        const timer = setInterval(run, 2000)
        return () => clearInterval(timer)
      })
  })
}

export interface ProtectionServiceShape {
  readonly dashboard: () => Effect.Effect<ProtectionDashboard, ProtectionError>
  readonly protectAll: () => Effect.Effect<ProtectionDashboard, ProtectionError>
  readonly relaunch: (id: WrapperAppId) => Effect.Effect<ProtectionDashboard, ProtectionError>
  readonly watchUnwrapped: (notify: (app: ProtectionApp) => Effect.Effect<void>) => Effect.Effect<() => void, ProtectionError>
}

const hasHookEvidence = (log: string, pid: number): boolean => log.includes("capture hook fired (pid=" + String(pid) + ")")

const isWrapped = (environment: string): boolean => environment.includes("LD_PRELOAD=") && environment.includes("capture_rewriter.so")

const appState = (installed: boolean, processes: ReadonlyArray<ProtectionProcess>, log: string): ProtectionApp["state"] => {
  if (processes.some((process) => isWrapped(process.environment) && hasHookEvidence(log, process.pid))) {
    return "verified"
  }
  if (processes.some((process) => isWrapped(process.environment))) {
    return "running wrapped"
  }
  if (processes.length > 0) {
    return "running unwrapped"
  }
  return installed ? "running unwrapped" : "not installed"
}

const dashboard = (registry: WrapperRegistryShape, system: ProtectionSystemShape): Effect.Effect<ProtectionDashboard, ProtectionError> =>
  Effect.gen(function* () {
    const processes = yield* system.listProcesses()
    const log = yield* system.readRewriterLogTail().pipe(Effect.catch(() => Effect.succeed("")))
    const apps = yield* Effect.forEach(registry.listApps(), (id) =>
      Effect.gen(function* () {
        const entry = registry.getEntry(id)
        const matching = processes.filter((process) => isAppCmdline(entry, process.cmdline))
        const installed = matching.length > 0 || (yield* system.binaryExists(entry.binaries))
        return { id, label: entry.label, pids: matching.map((process) => process.pid), state: appState(installed, matching, log) }
      })
    )
    return { apps }
  })

export class ProtectionService extends Context.Service<ProtectionService, ProtectionServiceShape>()("ProtectionService") {
  static readonly Live = Layer.effect(
    ProtectionService,
    Effect.gen(function* () {
      const registry = yield* WrapperRegistry
      const system = yield* ProtectionSystem
      const ticker = yield* ProtectionTicker
      const getDashboard = (): Effect.Effect<ProtectionDashboard, ProtectionError> => dashboard(registry, system)
      return {
        dashboard: getDashboard,
        relaunch: (id) =>
          registry.startWrapped(id).pipe(
            Effect.mapError((error) => new ProtectionError({ reason: error.reason })),
            Effect.flatMap((started) => (started ? getDashboard() : Effect.fail(new ProtectionError({ reason: "launch-wrapped" }))))
          ),
        protectAll: () =>
          Effect.forEach(registry.listApps(), (id) => registry.startWrapped(id).pipe(Effect.mapError((error) => new ProtectionError({ reason: error.reason })))).pipe(
            Effect.andThen(getDashboard())
          ),
        watchUnwrapped: (notify) =>
          Effect.gen(function* () {
            let previous = new Set<WrapperAppId>()
            const check = (): void => {
              void Effect.runPromise(
                getDashboard().pipe(
                  Effect.flatMap((current) => {
                    const unwrapped = current.apps.filter((app) => app.state === "running unwrapped" && app.pids.length > 0)
                    const next = new Set(unwrapped.map((app) => app.id))
                    const fresh = unwrapped.filter((app) => !previous.has(app.id))
                    previous = next
                    return Effect.forEach(fresh, notify, { discard: true })
                  }),
                  Effect.catch(() => Effect.void)
                )
              )
            }
            const stop = yield* ticker.every(check)
            check()
            return stop
          })
      }
    })
  )
}

import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { AppConfig } from "./AppConfig"

describe("AppConfig", () => {
  it("resolves overlay values from the test layer", async () => {
    const program = Effect.gen(function* () {
      const config = yield* AppConfig
      return config
    })
    const config = await Effect.runPromise(Effect.provide(program, AppConfig.Test))
    expect(config.overlayWidth).toBe(420)
    expect(config.overlayHeight).toBe(320)
    expect(config.overlayTitle).toBe("yleulc overlay")
  })
  it("resolves overlay dimensions from the live layer", async () => {
    const program = Effect.gen(function* () {
      const config = yield* AppConfig
      return config
    })
    const config = await Effect.runPromise(Effect.provide(program, AppConfig.Live))
    expect(config.overlayWidth).toBeGreaterThan(0)
    expect(config.overlayHeight).toBeGreaterThan(0)
  })
})

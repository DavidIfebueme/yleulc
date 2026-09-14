import { Config, Context, Layer } from "effect"

export interface AppConfigShape {
  readonly overlayWidth: number
  readonly overlayHeight: number
  readonly overlayTitle: string
}

const defaultOverlayWidth = 420
const defaultOverlayHeight = 320
const defaultOverlayTitle = "yleulc overlay"

export class AppConfig extends Context.Service<AppConfig, AppConfigShape>()("AppConfig") {
  static readonly Live = Layer.effect(
    AppConfig,
    Config.all({
      overlayWidth: Config.withDefault(Config.Int("YLEULC_OVERLAY_WIDTH"), defaultOverlayWidth),
      overlayHeight: Config.withDefault(Config.Int("YLEULC_OVERLAY_HEIGHT"), defaultOverlayHeight),
      overlayTitle: Config.withDefault(Config.String("YLEULC_OVERLAY_TITLE"), defaultOverlayTitle)
    })
  )
  static readonly Test = Layer.succeed(AppConfig, {
    overlayWidth: defaultOverlayWidth,
    overlayHeight: defaultOverlayHeight,
    overlayTitle: defaultOverlayTitle
  })
}

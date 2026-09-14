export const appVersionChannel = "yleulc:app-version"

export interface YleulcBridge {
  readonly appVersion: () => Promise<string>
}

import type { IpcRenderer, IpcRendererEvent } from "electron"
import { describe, expect, it } from "vitest"
import { protectionGetChannel, protectionRelaunchChannel, protectionUnwrappedChannel } from "../shared/protectionIpc"
import { makeYleulcBridge } from "./index"

describe("preload protection bridge", () => {
  it("invokes protection channels and removes the notification listener", async () => {
    const invoked: Array<{ channel: string; payload: unknown }> = []
    let subscription: ((event: IpcRendererEvent, app: { id: "firefox"; label: string; pids: Array<number>; state: "running unwrapped" }) => void) | undefined
    let removed: unknown
    const renderer = {
      invoke: (channel: string, payload?: unknown) => {
        invoked.push({ channel, payload })
        return Promise.resolve({ apps: [] })
      },
      on: (_channel: string, listener: typeof subscription) => {
        subscription = listener
      },
      removeListener: (_channel: string, listener: unknown) => {
        removed = listener
      },
      send: () => undefined
    } as unknown as Pick<IpcRenderer, "invoke" | "on" | "removeListener" | "send">
    const bridge = makeYleulcBridge(renderer)
    await bridge.getProtectionDashboard()
    await bridge.relaunchProtectedApp("firefox")
    const stop = bridge.onProtectionUnwrapped(() => undefined)
    subscription?.({} as IpcRendererEvent, { id: "firefox", label: "Firefox", pids: [12], state: "running unwrapped" })
    stop()
    expect(invoked).toEqual([
      { channel: protectionGetChannel, payload: undefined },
      { channel: protectionRelaunchChannel, payload: { id: "firefox" } }
    ])
    expect(removed).toBe(subscription)
    expect(protectionUnwrappedChannel).toBe("yleulc:protection-unwrapped")
  })
})

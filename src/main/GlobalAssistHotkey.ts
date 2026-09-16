export interface GlobalShortcutAdapter {
  readonly register: (accelerator: string, callback: () => void) => boolean
  readonly unregister: (accelerator: string) => void
}

export interface GlobalAssistHotkeyShape {
  readonly register: (accelerator: string) => boolean
  readonly unregister: () => void
}

export function makeGlobalAssistHotkey(adapter: GlobalShortcutAdapter, onAssist: () => void): GlobalAssistHotkeyShape {
  let active: string | undefined
  const unregister = (): void => {
    if (active === undefined) {
      return
    }
    adapter.unregister(active)
    active = undefined
  }
  return {
    register: (accelerator) => {
      if (active === accelerator) {
        return true
      }
      unregister()
      const registered = adapter.register(accelerator, onAssist)
      if (registered) {
        active = accelerator
      }
      return registered
    },
    unregister
  }
}

import { useEffect, useState } from "react"
import type { ProtectionApp, ProtectionDashboard } from "../../../shared/protectionIpc"

const emptyDashboard: ProtectionDashboard = { apps: [] }

export function ProtectionDashboard() {
  const [dashboard, setDashboard] = useState<ProtectionDashboard>(emptyDashboard)
  const [message, setMessage] = useState("")

  const refresh = (): void => {
    if (typeof window.yleulc === "undefined") {
      return
    }
    void window.yleulc.getProtectionDashboard().then(setDashboard, () => setMessage("protection status could not be loaded"))
  }

  useEffect(() => {
    refresh()
    if (typeof window.yleulc === "undefined") {
      return
    }
    return window.yleulc.onProtectionUnwrapped((app) => {
      setMessage(app.label + " is running unwrapped")
      refresh()
    })
  }, [])

  const relaunch = (app: ProtectionApp): void => {
    if (typeof window.yleulc === "undefined") {
      return
    }
    void window.yleulc.relaunchProtectedApp(app.id).then(
      (next) => {
        setDashboard(next)
        setMessage("")
      },
      () => setMessage(app.label + " could not be relaunched")
    )
  }

  const protectAll = (): void => {
    if (typeof window.yleulc === "undefined") {
      return
    }
    void window.yleulc.protectAllApps().then(
      (next) => {
        setDashboard(next)
        setMessage("")
      },
      () => setMessage("apps could not be protected")
    )
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-white shadow-2xl backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Protection</h2>
          <p className="text-xs text-white/55">Wrapped apps exclude the overlay from X11 captures.</p>
        </div>
        <button type="button" onClick={protectAll} className="rounded-lg bg-white px-2 py-1 text-xs font-medium text-slate-950 hover:bg-white/85">
          Protect all
        </button>
      </div>
      <div className="space-y-2">
        {dashboard.apps.map((app) => (
          <div key={app.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-2 py-2">
            <div>
              <p className="text-xs font-medium">{app.label}</p>
              <p className="text-xs text-white/55">{app.state}</p>
            </div>
            <button type="button" onClick={() => relaunch(app)} className="rounded-md border border-white/20 px-2 py-1 text-xs hover:bg-white/10">
              Relaunch
            </button>
          </div>
        ))}
      </div>
      {message === "" ? null : <p className="mt-3 text-xs text-amber-200">{message}</p>}
    </section>
  )
}

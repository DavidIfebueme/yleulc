import { useEffect, useState } from "react"

const fallbackVersion = "unknown"

export function OverlayPanel() {
  const [appVersion, setAppVersion] = useState(fallbackVersion)
  useEffect(() => {
    window.yleulc.appVersion().then(
      (version) => {
        setAppVersion(version)
      },
      () => {
        setAppVersion(fallbackVersion)
      }
    )
  }, [])
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent">
      <div className="w-[420px] rounded-xl border border-white/10 bg-black/70 p-4 text-white shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold tracking-wide">yleulc overlay</span>
          <span className="text-xs text-white/50">{appVersion}</span>
        </div>
        <p className="mt-2 text-sm text-white/80">Ask panel placeholder</p>
      </div>
    </div>
  )
}

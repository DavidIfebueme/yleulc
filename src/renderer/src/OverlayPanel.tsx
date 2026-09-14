import { AskPanel } from "./ask/AskPanel"

export function OverlayPanel() {
  return (
    <div className="flex h-screen w-screen items-start justify-center bg-transparent p-4">
      <AskPanel />
    </div>
  )
}

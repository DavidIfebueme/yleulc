import type { ScreenshotAttachment } from "./screenshotAttachments"

interface ScreenshotTrayProps {
  readonly attachments: ReadonlyArray<ScreenshotAttachment>
  readonly onRemove: (id: string) => void
}

export function ScreenshotTray(props: ScreenshotTrayProps) {
  if (props.attachments.length === 0) {
    return null
  }
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-1" aria-label="Attached screenshots">
      {props.attachments.map((attachment) => (
        <div key={attachment.id} className="relative shrink-0">
          <img
            src={attachment.dataUrl}
            alt="Attached screenshot"
            className="h-12 w-20 rounded-lg border border-white/15 object-cover"
          />
          <button
            type="button"
            aria-label={`Remove screenshot ${attachment.id}`}
            onClick={() => {
              props.onRemove(attachment.id)
            }}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-slate-900 text-[11px] leading-none text-white/80 hover:bg-slate-700 hover:text-white"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

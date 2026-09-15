import { screenshotMaxAttachments, toScreenshotDataUrl, type ScreenshotImage } from "../../../shared/screenshot"

export interface ScreenshotAttachment {
  readonly dataUrl: string
  readonly id: string
  readonly image: ScreenshotImage
}

export function createScreenshotAttachment(id: string, image: ScreenshotImage): ScreenshotAttachment {
  return { dataUrl: toScreenshotDataUrl(image), id, image }
}

export function appendScreenshotAttachments(
  current: ReadonlyArray<ScreenshotAttachment>,
  created: ReadonlyArray<ScreenshotAttachment>
): ReadonlyArray<ScreenshotAttachment> {
  return [...current, ...created].slice(0, screenshotMaxAttachments)
}

export function removeScreenshotAttachment(
  current: ReadonlyArray<ScreenshotAttachment>,
  id: string
): ReadonlyArray<ScreenshotAttachment> {
  return current.filter((attachment) => attachment.id !== id)
}

export function attachmentImages(
  attachments: ReadonlyArray<ScreenshotAttachment>
): ReadonlyArray<ScreenshotImage> {
  return attachments.map((attachment) => attachment.image)
}

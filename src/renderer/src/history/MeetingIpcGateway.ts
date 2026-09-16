import type { Meeting, MeetingSummary, SaveMeetingInput } from "../../../shared/meeting"
import type { MeetingIdRequest } from "../../../shared/meetingIpc"

export function isMeetingBridgeAvailable(): boolean {
  return (
    typeof window !== "undefined" && "yleulc" in window && typeof window.yleulc.listMeetings === "function"
  )
}

export function listMeetings(): Promise<Array<MeetingSummary>> {
  if (!isMeetingBridgeAvailable()) {
    return Promise.reject(new Error("meeting bridge unavailable"))
  }
  return window.yleulc.listMeetings()
}

export function saveMeeting(input: SaveMeetingInput): Promise<Meeting> {
  if (!isMeetingBridgeAvailable()) {
    return Promise.reject(new Error("meeting bridge unavailable"))
  }
  return window.yleulc.saveMeeting(input)
}

export function getMeeting(request: MeetingIdRequest): Promise<Meeting> {
  if (!isMeetingBridgeAvailable()) {
    return Promise.reject(new Error("meeting bridge unavailable"))
  }
  return window.yleulc.getMeeting(request)
}

export function exportMeetingMarkdown(request: MeetingIdRequest): Promise<string> {
  if (!isMeetingBridgeAvailable()) {
    return Promise.reject(new Error("meeting bridge unavailable"))
  }
  return window.yleulc.exportMeetingMarkdown(request)
}

export function deleteMeeting(request: MeetingIdRequest): Promise<void> {
  if (!isMeetingBridgeAvailable()) {
    return Promise.reject(new Error("meeting bridge unavailable"))
  }
  return window.yleulc.deleteMeeting(request)
}

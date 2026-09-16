import { Schema } from "effect"
import { MeetingIdSchema } from "./meeting"

export const meetingsListChannel = "yleulc:meetings-list"

export const meetingSaveChannel = "yleulc:meeting-save"

export const meetingGetChannel = "yleulc:meeting-get"

export const meetingExportChannel = "yleulc:meeting-export"

export const meetingDeleteChannel = "yleulc:meeting-delete"

export const MeetingIdRequestSchema = Schema.Struct({ id: MeetingIdSchema })

export type MeetingIdRequest = typeof MeetingIdRequestSchema.Type

export const decodeMeetingIdRequest = Schema.decodeUnknownSync(MeetingIdRequestSchema)

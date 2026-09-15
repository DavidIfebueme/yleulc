import { Schema } from "effect"

export const QuickActionIntentSchema = Schema.Union([
  Schema.Literal("say-next"),
  Schema.Literal("follow-ups"),
  Schema.Literal("who-talking"),
  Schema.Literal("fact-check"),
  Schema.Literal("recap")
])

export type QuickActionIntent = typeof QuickActionIntentSchema.Type

export interface QuickActionIntentDef {
  readonly id: QuickActionIntent
  readonly label: string
  readonly question: string
}

export const quickActionIntents: ReadonlyArray<QuickActionIntentDef> = [
  { id: "say-next", label: "What should I say next", question: "What should I say next?" },
  { id: "follow-ups", label: "Follow up questions", question: "What follow-up questions should I ask?" },
  { id: "who-talking", label: "Who am I talking to", question: "Who am I talking to and what do they care about?" },
  { id: "fact-check", label: "Fact check", question: "Fact-check the last claim from the transcript." },
  { id: "recap", label: "Recap", question: "Recap the meeting so far in three bullets." }
]

export function intentQuestion(intent: QuickActionIntent): string {
  for (const def of quickActionIntents) {
    if (def.id === intent) {
      return def.question
    }
  }
  return quickActionIntents[0]?.question ?? ""
}

export function intentLabel(intent: QuickActionIntent): string {
  for (const def of quickActionIntents) {
    if (def.id === intent) {
      return def.label
    }
  }
  return quickActionIntents[0]?.label ?? ""
}

export function intentDef(intent: QuickActionIntent): QuickActionIntentDef {
  return { id: intent, label: intentLabel(intent), question: intentQuestion(intent) }
}

const decodeIntentResult = Schema.decodeUnknownResult(QuickActionIntentSchema)

export function isQuickActionIntent(value: unknown): value is QuickActionIntent {
  return decodeIntentResult(value)._tag === "Success"
}

export function findIntentByQuestion(question: string): QuickActionIntent | undefined {
  const trimmed = question.trim()
  for (const intent of quickActionIntents) {
    if (intent.question === trimmed) {
      return intent.id
    }
  }
  return undefined
}

export interface AskAnswer {
  readonly question: string
  readonly bullets: ReadonlyArray<string>
}

export interface TranscriptSegment {
  readonly time: string
  readonly speaker: string
  readonly text: string
}

const defaultBullets: ReadonlyArray<string> = [
  "Lead with the conclusion in one crisp sentence.",
  "Support it with one concrete number or example from the transcript.",
  "Close with a one-line follow-up the user can say out loud."
]

const tellMoreBullets: ReadonlyArray<string> = [
  "Deeper cut: add one concrete example with a number attached.",
  "Counterpoint: name one risk or edge case in a single sentence.",
  "Handoff line: give a verbatim sentence the user can read aloud."
]

export const assistQuickChips: ReadonlyArray<string> = [
  "What should I say next",
  "Follow-up questions",
  "Who am I talking to",
  "Fact-check",
  "Recap"
]

export const askPreviousQuestions: ReadonlyArray<string> = [
  "What did we agree on pricing?",
  "Who owns the follow-up?",
  "What are the open risks?"
]

export const mockTranscriptSegments: ReadonlyArray<TranscriptSegment> = [
  { time: "00:01", speaker: "A", text: "Kickoff with scope and timeline review." },
  { time: "00:42", speaker: "B", text: "Pricing question raised with a deadline attached." },
  { time: "01:15", speaker: "A", text: "Owner assigned for the follow-up draft." }
]

export function answerAskQuestion(question: string): AskAnswer {
  const trimmed = question.trim()
  if (trimmed === "") {
    return { question: trimmed, bullets: defaultBullets }
  }
  return {
    question: trimmed,
    bullets: [
      "Lead with the conclusion in one crisp sentence.",
      "Support it with one concrete number or example from the transcript.",
      "Close with a one-line follow-up the user can say out loud."
    ]
  }
}

export function extendAskAnswer(answer: AskAnswer): AskAnswer {
  return { question: answer.question, bullets: [...answer.bullets, ...tellMoreBullets] }
}

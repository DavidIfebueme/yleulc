import { useEffect, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import type { AskEvent } from "../../../shared/askIpc"
import {
  appendListenEntry,
  shouldAutoAnswer,
  toAutoAnswerQuestion,
  type ListenTranscriptEntry,
  type SystemAudioSupport
} from "../../../shared/listenIpc"
import { answerAskQuestion } from "../ask/AskMockGateway"
import {
  cancelAskRequest,
  isAskBridgeAvailable,
  sendAskRequest,
  subscribeAskEvents
} from "../ask/AskIpcGateway"
import {
  isListenBridgeAvailable,
  startListenSession,
  stopListenSession,
  subscribeListenEvents
} from "./ListenIpcGateway"
import { streamMockListenEntries } from "./ListenMockEngine"

const listenSessionId = "listen-session"

export type ListenAnswerStatus = "done" | "error" | "streaming"

export interface ListenAutoAnswer {
  readonly answer: string
  readonly entryId: string
  readonly errorMessage: string
  readonly question: string
  readonly requestId: string
  readonly status: ListenAnswerStatus
}

export interface UseListenSessionResult {
  readonly answers: ReadonlyArray<ListenAutoAnswer>
  readonly dismissEngineError: () => void
  readonly engineError: string | undefined
  readonly entries: ReadonlyArray<ListenTranscriptEntry>
  readonly retryAnswer: (requestId: string) => void
  readonly running: boolean
  readonly stopAnswer: (requestId: string) => void
  readonly systemAudio: SystemAudioSupport
}

type SetListenAnswers = Dispatch<SetStateAction<ReadonlyArray<ListenAutoAnswer>>>

function applyAskEvent(
  answers: ReadonlyArray<ListenAutoAnswer>,
  event: AskEvent
): ReadonlyArray<ListenAutoAnswer> {
  return answers.map((answer) => {
    if (answer.requestId !== event.requestId) {
      return answer
    }
    if (event._tag === "text-delta") {
      return { ...answer, answer: `${answer.answer}${event.delta}` }
    }
    if (event._tag === "done") {
      return { ...answer, status: "done" as const }
    }
    if (event._tag === "error") {
      return { ...answer, errorMessage: event.message, status: "error" as const }
    }
    return answer
  })
}

function markAnswerError(setAnswers: SetListenAnswers, requestId: string, message: string): void {
  setAnswers((previous) =>
    previous.map((answer) =>
      answer.requestId === requestId
        ? { ...answer, errorMessage: message, status: "error" as const }
        : answer
    )
  )
}

function appendAnswer(
  setAnswers: SetListenAnswers,
  entry: ListenTranscriptEntry,
  question: string,
  answer: string,
  status: ListenAnswerStatus
): void {
  const requestId = `listen-${entry.id}`
  setAnswers((previous) => {
    if (previous.some((existing) => existing.requestId === requestId)) {
      return previous
    }
    return [
      ...previous,
      { answer, entryId: entry.id, errorMessage: "", question, requestId, status }
    ]
  })
}

function startAnswer(entry: ListenTranscriptEntry, setAnswers: SetListenAnswers): void {
  const question = toAutoAnswerQuestion(entry)
  const requestId = `listen-${entry.id}`
  if (!isAskBridgeAvailable()) {
    const mocked = answerAskQuestion(question)
    appendAnswer(setAnswers, entry, question, mocked.bullets.join("\n"), "done")
    return
  }
  appendAnswer(setAnswers, entry, question, "", "streaming")
  void sendAskRequest({ question, requestId }).then(
    () => {},
    () => {
      markAnswerError(setAnswers, requestId, "ask bridge unavailable")
    }
  )
}

export function useListenSession(): UseListenSessionResult {
  const [entries, setEntries] = useState<ReadonlyArray<ListenTranscriptEntry>>([])
  const [answers, setAnswers] = useState<ReadonlyArray<ListenAutoAnswer>>([])
  const [engineError, setEngineError] = useState<string | undefined>(undefined)
  const [running, setRunning] = useState(false)
  const [systemAudio, setSystemAudio] = useState<SystemAudioSupport>("unsupported")

  useEffect(
    () =>
      subscribeAskEvents((event) => {
        setAnswers((previous) => applyAskEvent(previous, event))
      }),
    []
  )

  useEffect(() => {
    if (!isListenBridgeAvailable()) {
      return
    }
    const unsubscribe = subscribeListenEvents((event) => {
      if (event._tag === "segment") {
        setEntries((previous) => appendListenEntry(previous, event.entry))
        if (shouldAutoAnswer(event.entry)) {
          startAnswer(event.entry, setAnswers)
        }
        return
      }
      if (event._tag === "error") {
        setEngineError(event.message)
        return
      }
      setRunning(event.state === "started")
      setSystemAudio(event.systemAudio)
    })
    void startListenSession({ sessionId: listenSessionId }).then(
      () => {},
      () => {
        setEngineError("listen could not start")
      }
    )
    return () => {
      stopListenSession({ sessionId: listenSessionId })
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (isAskBridgeAvailable()) {
      return
    }
    return streamMockListenEntries((entry) => {
      setEntries((previous) => appendListenEntry(previous, entry))
      if (shouldAutoAnswer(entry)) {
        startAnswer(entry, setAnswers)
      }
    })
  }, [])

  const retryAnswer = (requestId: string): void => {
    const target = answers.find((answer) => answer.requestId === requestId)
    if (target === undefined) {
      return
    }
    setAnswers((previous) =>
      previous.map((answer) =>
        answer.requestId === requestId
          ? { ...answer, answer: "", errorMessage: "", status: "streaming" as const }
          : answer
      )
    )
    if (!isAskBridgeAvailable()) {
      const mocked = answerAskQuestion(target.question)
      const text = mocked.bullets.join("\n")
      setAnswers((previous) =>
        previous.map((answer) =>
          answer.requestId === requestId ? { ...answer, answer: text, status: "done" as const } : answer
        )
      )
      return
    }
    void sendAskRequest({ question: target.question, requestId }).then(
      () => {},
      () => {
        markAnswerError(setAnswers, requestId, "ask bridge unavailable")
      }
    )
  }

  const stopAnswer = (requestId: string): void => {
    cancelAskRequest(requestId)
    setAnswers((previous) =>
      previous.map((answer) =>
        answer.requestId === requestId ? { ...answer, status: "done" as const } : answer
      )
    )
  }

  const dismissEngineError = (): void => {
    setEngineError(undefined)
  }

  return { answers, dismissEngineError, engineError, entries, retryAnswer, running, stopAnswer, systemAudio }
}

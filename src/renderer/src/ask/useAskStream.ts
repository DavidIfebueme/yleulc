import { useEffect, useRef, useState } from "react"
import type { AskEvent, AskTokenUsage } from "../../../shared/askIpc"
import { answerAskQuestion } from "./AskMockGateway"
import { cancelAskRequest, isAskBridgeAvailable, sendAskRequest, subscribeAskEvents } from "./AskIpcGateway"

export type AskStreamStatus = "done" | "empty" | "error" | "idle" | "streaming"

export interface UseAskStreamResult {
  readonly answer: string
  readonly ask: (question: string) => void
  readonly errorMessage: string
  readonly question: string
  readonly retry: () => void
  readonly status: AskStreamStatus
  readonly stop: () => void
  readonly usage: AskTokenUsage | undefined
}

export function useAskStream(): UseAskStreamResult {
  const [answer, setAnswer] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [question, setQuestion] = useState("")
  const [status, setStatus] = useState<AskStreamStatus>("idle")
  const [usage, setUsage] = useState<AskTokenUsage | undefined>(undefined)
  const activeRequestId = useRef<string | undefined>(undefined)
  const answerRef = useRef("")
  const requestCounter = useRef(0)

  useEffect(() => {
    const handleEvent = (event: AskEvent): void => {
      if (event.requestId !== activeRequestId.current) {
        return
      }
      if (event._tag === "text-delta") {
        answerRef.current = `${answerRef.current}${event.delta}`
        setAnswer(answerRef.current)
      } else if (event._tag === "usage") {
        setUsage(event.usage)
      } else if (event._tag === "done") {
        activeRequestId.current = undefined
        if (answerRef.current.trim().length === 0) {
          setStatus("empty")
        } else {
          setStatus("done")
        }
      } else if (event._tag === "error") {
        activeRequestId.current = undefined
        setErrorMessage(event.message)
        setStatus("error")
      }
    }
    return subscribeAskEvents(handleEvent)
  }, [])

  const ask = (next: string): void => {
    const trimmed = next.trim()
    if (trimmed === "") {
      return
    }
    requestCounter.current = requestCounter.current + 1
    const requestId = `ask-${Date.now()}-${requestCounter.current}`
    activeRequestId.current = requestId
    answerRef.current = ""
    setAnswer("")
    setErrorMessage("")
    setQuestion(trimmed)
    setUsage(undefined)
    setStatus("streaming")
    if (!isAskBridgeAvailable()) {
      const mocked = answerAskQuestion(trimmed)
      answerRef.current = mocked.bullets.join("\n")
      setAnswer(answerRef.current)
      setStatus("done")
      activeRequestId.current = undefined
      return
    }
    void sendAskRequest({ question: trimmed, requestId }).then(
      () => {},
      () => {
        if (activeRequestId.current !== requestId) {
          return
        }
        activeRequestId.current = undefined
        setErrorMessage("ask bridge unavailable")
        setStatus("error")
      }
    )
  }

  const stop = (): void => {
    const requestId = activeRequestId.current
    if (requestId === undefined) {
      return
    }
    activeRequestId.current = undefined
    cancelAskRequest(requestId)
    if (answerRef.current.trim().length === 0) {
      setStatus("empty")
    } else {
      setStatus("done")
    }
  }

  const retry = (): void => {
    if (question.trim() === "") {
      return
    }
    ask(question)
  }

  return { answer, ask, errorMessage, question, retry, status, stop, usage }
}

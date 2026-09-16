import { useEffect, useRef, useState } from "react"
import type { AskEvent, AskTokenUsage } from "../../../shared/askIpc"
import type { ListenTranscriptEntry } from "../../../shared/listenIpc"
import type { ScreenshotImage } from "../../../shared/screenshot"
import { answerAskQuestion } from "./AskMockGateway"
import {
  cancelAskRequest,
  isAskBridgeAvailable,
  sendAskRequest,
  sendAssistRequest,
  subscribeAskEvents
} from "./AskIpcGateway"

export type AskStreamStatus = "done" | "empty" | "error" | "idle" | "streaming"

export interface UseAskStreamResult {
  readonly answer: string
  readonly assist: (
    transcript: ReadonlyArray<ListenTranscriptEntry>,
    systemPrompt?: string,
    activePromptModeId?: string
  ) => void
  readonly ask: (
    question: string,
    images?: ReadonlyArray<ScreenshotImage>,
    systemPrompt?: string,
    activePromptModeId?: string
  ) => void
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
  const lastImages = useRef<ReadonlyArray<ScreenshotImage>>([])
  const lastAssistTranscript = useRef<ReadonlyArray<ListenTranscriptEntry> | undefined>(undefined)
  const lastSystemPrompt = useRef<string | undefined>(undefined)
  const lastActivePromptModeId = useRef<string | undefined>(undefined)

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

  const ask = (
    next: string,
    images?: ReadonlyArray<ScreenshotImage>,
    systemPrompt?: string,
    activePromptModeId?: string
  ): void => {
    if (activeRequestId.current !== undefined) {
      return
    }
    const trimmed = next.trim()
    if (trimmed === "") {
      return
    }
    requestCounter.current = requestCounter.current + 1
    const requestId = `ask-${Date.now()}-${requestCounter.current}`
    activeRequestId.current = requestId
    answerRef.current = ""
    lastImages.current = images ?? []
    lastAssistTranscript.current = undefined
    lastSystemPrompt.current = systemPrompt
    lastActivePromptModeId.current = activePromptModeId
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
    void sendAskRequest({ activePromptModeId, images: [...lastImages.current], question: trimmed, requestId, systemPrompt }).then(
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

  const assist = (
    transcript: ReadonlyArray<ListenTranscriptEntry>,
    systemPrompt?: string,
    activePromptModeId?: string
  ): void => {
    if (activeRequestId.current !== undefined) {
      return
    }
    requestCounter.current = requestCounter.current + 1
    const requestId = `assist-${Date.now()}-${requestCounter.current}`
    activeRequestId.current = requestId
    answerRef.current = ""
    lastImages.current = []
    lastAssistTranscript.current = transcript
    lastSystemPrompt.current = systemPrompt
    lastActivePromptModeId.current = activePromptModeId
    setAnswer("")
    setErrorMessage("")
    setQuestion("Analyze the current screen and give the user the answer they need.")
    setUsage(undefined)
    setStatus("streaming")
    void sendAssistRequest({ activePromptModeId, requestId, systemPrompt, transcript: [...transcript] }).then(
      () => {},
      () => {
        if (activeRequestId.current !== requestId) {
          return
        }
        activeRequestId.current = undefined
        setErrorMessage("assist bridge unavailable")
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
    if (lastAssistTranscript.current !== undefined) {
      assist(lastAssistTranscript.current, lastSystemPrompt.current, lastActivePromptModeId.current)
      return
    }
    ask(question, lastImages.current, lastSystemPrompt.current, lastActivePromptModeId.current)
  }

  return { answer, ask, assist, errorMessage, question, retry, status, stop, usage }
}

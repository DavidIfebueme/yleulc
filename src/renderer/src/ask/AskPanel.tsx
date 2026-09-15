import { useEffect, useState } from "react"
import { emptyAskFallback, toAskBullets } from "../../../shared/askIpc"
import type { AskAnswer } from "./AskMockGateway"
import {
  answerAskQuestion,
  askPreviousQuestions,
  assistQuickChips,
  extendAskAnswer,
  mockTranscriptSegments
} from "./AskMockGateway"
import { AskAnswerBullets } from "./AskAnswerBullets"
import { AskErrorCard } from "./AskErrorCard"
import { AskHistoryChips } from "./AskHistoryChips"
import { AskInput } from "./AskInput"
import { isAskBridgeAvailable } from "./AskIpcGateway"
import { AskModeSelect } from "./AskModeSelect"
import type { AskMode } from "./AskModeSelect"
import { AskQuestionBubble } from "./AskQuestionBubble"
import { useAskStream } from "./useAskStream"
import { AssistActions } from "../assist/AssistActions"
import { AssistQuickChips } from "../assist/AssistQuickChips"
import { AssistSubmitBar } from "../assist/AssistSubmitBar"
import { ListenStatusPill } from "../listen/ListenStatusPill"
import { registerOverlayHotkeys } from "../overlay/OverlayHotkeys"
import { TranscriptToggle } from "../transcript/TranscriptToggle"
import { TranscriptView } from "../transcript/TranscriptView"

export function AskPanel() {
  const [mode, setMode] = useState<AskMode>("ask")
  const [listening, setListening] = useState(true)
  const [audioOn, setAudioOn] = useState(true)
  const [listenSeconds, setListenSeconds] = useState(0)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [exchanges, setExchanges] = useState<ReadonlyArray<AskAnswer>>(() => [
    answerAskQuestion("What should I say next?")
  ])
  const [copied, setCopied] = useState(false)
  const [hidden, setHidden] = useState(false)
  const stream = useAskStream()

  useEffect(() => {
    if (listening === false) {
      return
    }
    const timerId = window.setInterval(() => {
      setListenSeconds((seconds) => seconds + 1)
    }, 1000)
    return () => {
      window.clearInterval(timerId)
    }
  }, [listening])

  const submitDraft = (): void => {
    const trimmed = draft.trim()
    if (trimmed === "") {
      return
    }
    if (isAskBridgeAvailable()) {
      stream.ask(trimmed)
      setDraft("")
      setCopied(false)
      return
    }
    setExchanges((previous) => [...previous, answerAskQuestion(trimmed)])
    setDraft("")
    setCopied(false)
  }

  useEffect(() => {
    return registerOverlayHotkeys({
      onToggleVisibility: () => {
        setHidden((value) => !value)
      },
      onSubmit: submitDraft
    })
  })

  const answerChip = (chip: string): void => {
    if (isAskBridgeAvailable()) {
      stream.ask(chip)
      setDraft("")
      setCopied(false)
      return
    }
    setExchanges((previous) => [...previous, answerAskQuestion(chip)])
    setDraft("")
    setCopied(false)
  }

  const tellMore = (): void => {
    setExchanges((previous) => {
      const last = previous[previous.length - 1]
      if (last === undefined) {
        return previous
      }
      return [...previous.slice(0, -1), extendAskAnswer(last)]
    })
  }

  const copyAnswer = (): void => {
    const streamed = stream.answer.trim()
    if (isAskBridgeAvailable() && streamed !== "") {
      void navigator.clipboard.writeText(streamed).then(
        () => {
          setCopied(true)
        },
        () => {
          setCopied(false)
        }
      )
      return
    }
    const last = exchanges[exchanges.length - 1]
    if (last === undefined) {
      return
    }
    void navigator.clipboard.writeText(last.bullets.join("\n")).then(
      () => {
        setCopied(true)
      },
      () => {
        setCopied(false)
      }
    )
  }

  const changeMode = (next: AskMode): void => {
    setMode(next)
    setListening(next === "listen")
  }

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => {
          setHidden(false)
        }}
        className="rounded-full border border-white/10 bg-slate-950/80 px-3 py-1.5 text-xs text-white/80 shadow-2xl backdrop-blur-xl"
      >
        Show overlay
      </button>
    )
  }

  return (
    <div className="w-[400px] rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-white shadow-2xl backdrop-blur-xl">
      <ListenStatusPill
        listening={listening}
        audioOn={audioOn}
        listenSeconds={listenSeconds}
        onToggleAudio={() => {
          setAudioOn((value) => !value)
        }}
        onEndListen={() => {
          setListening(false)
        }}
        onHideOverlay={() => {
          setHidden(true)
        }}
      />
      <div className="mt-2 flex items-center justify-between">
        <AskModeSelect mode={mode} onModeChange={changeMode} />
        <TranscriptToggle
          open={transcriptOpen}
          onToggle={() => {
            setTranscriptOpen((value) => !value)
          }}
        />
      </div>
      {transcriptOpen ? <TranscriptView segments={mockTranscriptSegments} /> : null}
      <div className="mt-2 space-y-3">
        {exchanges.map((exchange, index) => (
          <div key={`${index}-${exchange.question}`} className="space-y-1.5">
            <AskQuestionBubble question={exchange.question} />
            <AskAnswerBullets bullets={exchange.bullets} />
          </div>
        ))}
      </div>
      {stream.question === "" ? null : (
        <div className="mt-2 space-y-1.5">
          <AskQuestionBubble question={stream.question} />
          {stream.status === "streaming" && stream.answer.trim() === "" ? (
            <p className="text-xs text-white/50">Streaming answer…</p>
          ) : null}
          {stream.answer.trim() === "" ? null : <AskAnswerBullets bullets={toAskBullets(stream.answer)} />}
          {stream.status === "streaming" ? (
            <button
              type="button"
              onClick={stream.stop}
              className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
            >
              Stop
            </button>
          ) : null}
          {stream.status === "error" ? (
            <AskErrorCard message={stream.errorMessage} onRetry={stream.retry} />
          ) : null}
          {stream.status === "empty" ? (
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-sm text-white/70">{emptyAskFallback}</p>
              <button
                type="button"
                onClick={stream.retry}
                className="mt-2 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
              >
                Retry
              </button>
            </div>
          ) : null}
          {stream.usage !== undefined ? (
            <p className="text-[11px] text-white/40">
              {`${stream.usage.promptTokens} prompt · ${stream.usage.completionTokens} completion`}
            </p>
          ) : null}
        </div>
      )}
      <div className="mt-2">
        <AssistActions onTellMore={tellMore} onCopy={copyAnswer} copied={copied} />
      </div>
      <div className="mt-2">
        <AssistQuickChips chips={assistQuickChips} onSelect={answerChip} />
      </div>
      <div className="mt-2">
        <AskInput value={draft} onChange={setDraft} onSubmit={submitDraft} />
      </div>
      <div className="mt-2">
        <AssistSubmitBar onAssist={submitDraft} onSubmit={submitDraft} canSubmit={draft.trim() !== ""} />
      </div>
      <div className="mt-2">
        <AskHistoryChips questions={askPreviousQuestions} onSelect={answerChip} />
      </div>
    </div>
  )
}

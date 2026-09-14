import { useEffect, useState } from "react"
import type { AskAnswer } from "./AskMockGateway"
import {
  answerAskQuestion,
  askPreviousQuestions,
  assistQuickChips,
  extendAskAnswer,
  mockTranscriptSegments
} from "./AskMockGateway"
import { AskAnswerBullets } from "./AskAnswerBullets"
import { AskHistoryChips } from "./AskHistoryChips"
import { AskInput } from "./AskInput"
import { AskModeSelect } from "./AskModeSelect"
import type { AskMode } from "./AskModeSelect"
import { AskQuestionBubble } from "./AskQuestionBubble"
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

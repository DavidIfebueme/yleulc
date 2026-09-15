import { useEffect, useRef, useState } from "react"
import { quickActionIntents } from "../../../shared/askIntents"
import { emptyAskFallback, toAskBullets } from "../../../shared/askIpc"
import type { PromptMode } from "../../../shared/settingsIpc"
import type { AskAnswer } from "./AskMockGateway"
import {
  answerAskQuestion,
  askPreviousQuestions,
  extendAskAnswer
} from "./AskMockGateway"
import { AskAnswerBullets } from "./AskAnswerBullets"
import {
  CluelyPromptModeSelect,
  promptForCluelyMode,
} from "./CluelyPromptModeSelect"
import { AskErrorCard } from "./AskErrorCard"
import { AskHistoryChips } from "./AskHistoryChips"
import { AskInput } from "./AskInput"
import { isAskBridgeAvailable } from "./AskIpcGateway"
import { AskQuestionBubble } from "./AskQuestionBubble"
import { useAskStream } from "./useAskStream"
import { AssistActions } from "../assist/AssistActions"
import { AssistQuickChips } from "../assist/AssistQuickChips"
import { AssistSubmitBar } from "../assist/AssistSubmitBar"
import {
  appendScreenshotAttachments,
  attachmentImages,
  createScreenshotAttachment,
  removeScreenshotAttachment,
  type ScreenshotAttachment
} from "../capture/screenshotAttachments"
import { isScreenshotBridgeAvailable, requestFullscreenCapture } from "../capture/ScreenshotGateway"
import { ScreenshotTray } from "../capture/ScreenshotTray"
import { ListenPanel } from "../listen/ListenPanel"
import { ListenStatusPill } from "../listen/ListenStatusPill"
import { registerOverlayHotkeys } from "../overlay/OverlayHotkeys"
import { TranscriptToggle } from "../transcript/TranscriptToggle"

interface AskPanelProps {
  readonly activePromptModeId: string
  readonly onActivePromptModeChange: (modeId: string) => void
  readonly promptModes: ReadonlyArray<PromptMode>
}

export function AskPanel(props: AskPanelProps) {
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
  const [attachments, setAttachments] = useState<ReadonlyArray<ScreenshotAttachment>>([])
  const [captureError, setCaptureError] = useState("")
  const [smartMode, setSmartMode] = useState(false)
  const attachCounter = useRef(0)
  const stream = useAskStream()

  const askWithMode = (question: string, images = attachmentImages(attachments)): void => {
    stream.ask(question, images, promptForCluelyMode(props.promptModes, props.activePromptModeId, smartMode))
  }

  const getAnswerFromScreen = (): void => {
    if (!isScreenshotBridgeAvailable()) {
      setCaptureError("screen answers need the desktop app")
      return
    }
    setCaptureError("")
    void requestFullscreenCapture().then(
      (image) => {
        askWithMode("Analyze the current screen and give the user the answer they need.", [image])
      },
      () => {
        setCaptureError("screen capture failed")
      }
    )
  }

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
      askWithMode(trimmed)
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
      onSubmit: submitDraft,
      onGetAnswer: getAnswerFromScreen
    })
  })

  const answerChip = (chip: string): void => {
    if (isAskBridgeAvailable()) {
      askWithMode(chip)
      setDraft("")
      setCopied(false)
      return
    }
    setExchanges((previous) => [...previous, answerAskQuestion(chip)])
    setDraft("")
    setCopied(false)
  }

  const removeAttachment = (id: string): void => {
    setAttachments((previous) => removeScreenshotAttachment(previous, id))
  }

  const captureScreen = (): void => {
    if (!isScreenshotBridgeAvailable()) {
      setCaptureError("screenshots need the desktop app")
      return
    }
    setCaptureError("")
    void requestFullscreenCapture().then(
      (image) => {
        attachCounter.current = attachCounter.current + 1
        const created = createScreenshotAttachment(`shot-${Date.now()}-${attachCounter.current}`, image)
        setAttachments((previous) => appendScreenshotAttachments(previous, [created]))
      },
      () => {
        setCaptureError("screen capture failed")
      }
    )
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
        <CluelyPromptModeSelect
          modeId={props.activePromptModeId}
          modes={props.promptModes}
          onModeChange={props.onActivePromptModeChange}
        />
        <TranscriptToggle
          open={transcriptOpen}
          onToggle={() => {
            setTranscriptOpen((value) => !value)
          }}
        />
      </div>
      {transcriptOpen ? (
        <ListenPanel />
      ) : (
        <>
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
            <AssistQuickChips
              chips={quickActionIntents.map((intent) => intent.label)}
              onSelect={(label) => {
                const selected = quickActionIntents.find((intent) => intent.label === label)
                if (selected !== undefined) {
                  answerChip(selected.question)
                }
              }}
            />
          </div>
          <div className="mt-2">
            <ScreenshotTray attachments={attachments} onRemove={removeAttachment} />
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={captureScreen}
                className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
              >
                Capture screen
              </button>
              {captureError === "" ? null : <p className="text-[11px] text-red-300/80">{captureError}</p>}
            </div>
          </div>
          <div className="mt-2">
            <button
              type="button"
              aria-pressed={smartMode}
              onClick={() => {
                setSmartMode((value) => !value)
              }}
              className={`mb-1 rounded-lg border px-2 py-1 text-[11px] font-medium ${
                smartMode
                  ? "border-violet-300/50 bg-violet-400/20 text-violet-100"
                  : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              Smart Mode
            </button>
            <AskInput value={draft} onChange={setDraft} onSubmit={submitDraft} />
          </div>
          <div className="mt-2">
            <AssistSubmitBar onAssist={submitDraft} onSubmit={submitDraft} canSubmit={draft.trim() !== ""} />
          </div>
          <div className="mt-2">
            <AskHistoryChips questions={askPreviousQuestions} onSelect={answerChip} />
          </div>
        </>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from "react"
import { quickActionIntents } from "../../../shared/askIntents"
import type { KeybindMap } from "../../../shared/keybinds"
import type { ListenTranscriptEntry } from "../../../shared/listenIpc"
import { emptyAskFallback, toAskBullets } from "../../../shared/askIpc"
import { promptForSmartMode } from "../../../shared/askPrompts"
import type { PromptMode } from "../../../shared/settingsIpc"
import type { ScreenshotImage } from "../../../shared/screenshot"
import { AskAnswerBullets } from "./AskAnswerBullets"
import {
  CluelyPromptModeSelect,
} from "./CluelyPromptModeSelect"
import { AskErrorCard } from "./AskErrorCard"
import { AskInput } from "./AskInput"
import { isAskBridgeAvailable, subscribeAssistHotkey } from "./AskIpcGateway"
import { AskQuestionBubble } from "./AskQuestionBubble"
import { useAskStream } from "./useAskStream"
import { AssistActions } from "../assist/AssistActions"
import { AssistQuickChips } from "../assist/AssistQuickChips"
import { AssistSubmitBar } from "../assist/AssistSubmitBar"
import { AreaSelect } from "../capture/AreaSelect"
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
import { initialOverlayState } from "../../../shared/initialOverlayState"

interface AskPanelProps {
  readonly activePromptModeId: string
  readonly initialMode: "ask" | "listen"
  readonly keybinds: KeybindMap
  readonly onActivePromptModeChange: (modeId: string) => void
  readonly onTranscriptChange?: (entries: ReadonlyArray<ListenTranscriptEntry>) => void
  readonly promptModes: ReadonlyArray<PromptMode>
  readonly settingsSaveError: string
}

export function AskPanel(props: AskPanelProps) {
  const [listening, setListening] = useState(() => initialOverlayState(props.initialMode).listening)
  const [audioOn, setAudioOn] = useState(true)
  const [listenSeconds, setListenSeconds] = useState(0)
  const [transcriptOpen, setTranscriptOpen] = useState(() => initialOverlayState(props.initialMode).transcriptOpen)
  const [draft, setDraft] = useState("")
  const [copied, setCopied] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [attachments, setAttachments] = useState<ReadonlyArray<ScreenshotAttachment>>([])
  const [captureError, setCaptureError] = useState("")
  const [areaSelecting, setAreaSelecting] = useState(false)
  const [smartMode, setSmartMode] = useState(false)
  const [activePromptModeId, setActivePromptModeId] = useState(props.activePromptModeId)
  const [transcript, setTranscript] = useState<ReadonlyArray<ListenTranscriptEntry>>([])
  const attachCounter = useRef(0)
  const stream = useAskStream()

  const askWithMode = (question: string, images = attachmentImages(attachments)): void => {
    stream.ask(question, images, promptForSmartMode(smartMode), activePromptModeId)
  }

  useEffect(() => {
    setActivePromptModeId(props.activePromptModeId)
  }, [props.activePromptModeId])

  const getAnswerFromScreen = (): void => {
    if (isAskBridgeAvailable()) {
      stream.assist(transcript, promptForSmartMode(smartMode), activePromptModeId)
      return
    }
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

  useEffect(() => subscribeAssistHotkey(getAnswerFromScreen), [activePromptModeId, smartMode, transcript])

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
    askWithMode(trimmed)
    setDraft("")
    setCopied(false)
  }

  useEffect(() => {
    return registerOverlayHotkeys(props.keybinds, {
      onToggleVisibility: () => {
        setHidden((value) => !value)
      },
      onSubmit: submitDraft,
      onGetAnswer: () => {
        if (!isAskBridgeAvailable()) {
          getAnswerFromScreen()
        }
      },
      onToggleListen: () => {
        setListening((value) => !value)
      },
      onToggleTranscript: () => {
        setTranscriptOpen((value) => !value)
      }
    })
  })

  const answerChip = (chip: string): void => {
    askWithMode(chip)
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

  const captureAreaAttachment = (image: ScreenshotImage): void => {
    attachCounter.current = attachCounter.current + 1
    const created = createScreenshotAttachment(`area-${Date.now()}-${attachCounter.current}`, image)
    setAttachments((previous) => appendScreenshotAttachments(previous, [created]))
    setAreaSelecting(false)
    setCaptureError("")
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
    if (streamed === "") {
      return
    }
    void navigator.clipboard.writeText(streamed).then(
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
        className="overlay-button rounded-full px-3 py-1.5"
      >
        Show overlay
      </button>
    )
  }

  return (
    <>
    <div className="flex h-full min-h-0 flex-col text-white">
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
      <div className="mt-3 flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.025] px-2 py-1">
        <CluelyPromptModeSelect
          modeId={activePromptModeId}
          modes={props.promptModes}
          onModeChange={(modeId) => {
            setActivePromptModeId(modeId)
            props.onActivePromptModeChange(modeId)
          }}
        />
        {props.settingsSaveError === "" ? null : <p className="text-[11px] text-red-300/80">{props.settingsSaveError}</p>}
        <TranscriptToggle
          open={transcriptOpen}
          onToggle={() => {
            setTranscriptOpen((value) => !value)
          }}
        />
      </div>
      <div className="overlay-ask-content" data-scroll-region="ask">
      {transcriptOpen ? (
        <ListenPanel
          onTranscriptChange={(entries) => {
            setTranscript(entries)
            props.onTranscriptChange?.(entries)
          }}
        />
      ) : (
        <>
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
                  className="overlay-button"
                >
                  Stop
                </button>
              ) : null}
              {stream.status === "error" ? (
                <AskErrorCard message={stream.errorMessage} onRetry={stream.retry} />
              ) : null}
              {stream.status === "empty" ? (
                <div className="overlay-card">
                  <p className="text-sm text-white/70">{emptyAskFallback}</p>
                  <button
                    type="button"
                    onClick={stream.retry}
                    className="overlay-button mt-2"
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
            <AssistActions onTellMore={stream.retry} onCopy={copyAnswer} copied={copied} />
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
                className="overlay-button"
              >
                Capture screen
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isScreenshotBridgeAvailable()) {
                    setCaptureError("screenshots need the desktop app")
                    return
                  }
                  setCaptureError("")
                  setAreaSelecting(true)
                }}
                className="overlay-button"
              >
                Capture area
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
                className={`mb-1 rounded-lg border px-2 py-1 text-[11px] font-semibold ${
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
            <AssistSubmitBar onAssist={getAnswerFromScreen} onSubmit={submitDraft} canSubmit={draft.trim() !== ""} />
          </div>
        </>
      )}
      </div>
    </div>
    {areaSelecting ? (
      <AreaSelect
        onCancel={() => {
          setAreaSelecting(false)
        }}
        onCaptured={captureAreaAttachment}
      />
    ) : null}
    </>
  )
}

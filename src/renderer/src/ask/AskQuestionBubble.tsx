interface AskQuestionBubbleProps {
  readonly question: string
}

export function AskQuestionBubble(props: AskQuestionBubbleProps) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-2xl rounded-br-sm border border-violet-300/30 bg-violet-700/75 px-3 py-2 text-sm text-white shadow-sm">
        {props.question}
      </p>
    </div>
  )
}

interface AskQuestionBubbleProps {
  readonly question: string
}

export function AskQuestionBubble(props: AskQuestionBubbleProps) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-3 py-2 text-sm text-white">
        {props.question}
      </p>
    </div>
  )
}

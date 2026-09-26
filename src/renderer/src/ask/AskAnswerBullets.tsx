interface AskAnswerBulletsProps {
  readonly bullets: ReadonlyArray<string>
}

export function AskAnswerBullets(props: AskAnswerBulletsProps) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-100/90 marker:text-violet-300">
      {props.bullets.map((bullet, index) => (
        <li key={`${index}-${bullet.slice(0, 12)}`}>{bullet}</li>
      ))}
    </ul>
  )
}

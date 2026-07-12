import { Fragment, JSX } from 'react'

export type AssistantMessageContentProps = {
  text: string
  resolveCitationLabel: (blockId: string) => string
}

const lightweightMarkdown = /\*\*([^*\n]+)\*\*|\[([^\]\n]+)]\((https?:\/\/[^)\s]+)\)|\[block:([\w-]+)]/g

export const AssistantMessageContent = ({ text, resolveCitationLabel }: AssistantMessageContentProps): JSX.Element => {
  const parts: JSX.Element[] = []
  let from = 0
  let key = 0
  for (const match of text.matchAll(lightweightMarkdown)) {
    const index = match.index
    if (index > from) parts.push(<Fragment key={key++}>{text.slice(from, index)}</Fragment>)
    if (match[1]) {
      parts.push(<strong key={key++} className="font-semibold text-zinc-100">{match[1]}</strong>)
    } else if (match[3]) {
      parts.push(<a key={key++} href={match[3]} target="_blank" rel="noreferrer" className="text-yellow-400 underline decoration-yellow-500/40 underline-offset-2 hover:text-yellow-300">{match[2]}</a>)
    } else if (match[4]) {
      parts.push(<span key={key++} className="rounded border border-yellow-500/30 bg-yellow-500/5 px-1 py-0.5 text-[10px] text-yellow-400">{resolveCitationLabel(match[4])}</span>)
    }
    from = index + match[0].length
  }
  if (from < text.length) parts.push(<Fragment key={key++}>{text.slice(from)}</Fragment>)
  return <>{parts}</>
}

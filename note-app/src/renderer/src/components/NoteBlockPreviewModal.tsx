import { BlockMeta } from '@shared/models'
import { JSX, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { LuCheck, LuCopy, LuExternalLink, LuMessageSquarePlus, LuX } from 'react-icons/lu'

export type NoteBlockPreviewModalProps = {
  block: BlockMeta
  title: string
  onClose: () => void
  onAddToChat: (content: string) => void
  onGoToNote: () => void
}

export const NoteBlockPreviewModal = ({
  block,
  title,
  onClose,
  onAddToChat,
  onGoToNote
}: NoteBlockPreviewModalProps): JSX.Element => {
  const [content, setContent] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.context.readBlock(block.id).then((result) => {
      if (!cancelled) setContent(result.content)
    }).catch((reason: unknown) => {
      if (!cancelled) setLoadError(reason instanceof Error ? reason.message : 'Could not load this note block.')
    })
    return () => { cancelled = true }
  }, [block.id])

  useEffect(() => {
    const closeFromKeyboard = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeFromKeyboard)
    return () => window.removeEventListener('keydown', closeFromKeyboard)
  }, [onClose])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1_500)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copy = async (): Promise<void> => {
    if (content === null) return
    try {
      await navigator.clipboard.writeText(content)
      setCopyError(null)
      setCopied(true)
    } catch {
      setCopyError('Could not copy this note block.')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-5" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="flex max-h-[82vh] w-full max-w-3xl flex-col rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex min-w-0 items-start gap-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-zinc-100">{title}</h2>
          <button type="button" title={copied ? 'Copied' : 'Copy note block'} aria-label="Copy note block" disabled={content === null} onClick={() => { void copy() }} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-yellow-400 disabled:opacity-40">
            {copied ? <LuCheck className="h-4 w-4" /> : <LuCopy className="h-4 w-4" />}
          </button>
          <button type="button" title="Close" aria-label="Close note preview" onClick={onClose} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"><LuX className="h-4 w-4" /></button>
        </div>
        <div className="mt-3 min-h-40 flex-1 overflow-y-auto rounded border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-zinc-200">
          {loadError
            ? <p className="text-red-400" role="alert">{loadError}</p>
            : content === null
              ? <p className="text-zinc-500">Loading note block...</p>
              : <div className="select-text whitespace-pre-wrap break-words">{content}</div>}
        </div>
        {copyError && <p className="mt-2 text-right text-[10px] text-red-400" role="alert">{copyError}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" disabled={content === null || added} onClick={() => {
            if (content === null) return
            onAddToChat(content)
            setAdded(true)
          }} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-500/50 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-40">
            {added ? <LuCheck className="h-3.5 w-3.5" /> : <LuMessageSquarePlus className="h-3.5 w-3.5" />}
            {added ? 'Added to chat' : 'Add to chat'}
          </button>
          <button type="button" onClick={onGoToNote} className="inline-flex items-center gap-1.5 rounded-md border border-yellow-500/50 px-2 py-1 text-xs text-yellow-400 hover:bg-yellow-500/15">
            <LuExternalLink className="h-3.5 w-3.5" />Go to note
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

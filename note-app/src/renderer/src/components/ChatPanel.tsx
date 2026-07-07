import { ActionButton } from '@/components'
import { usePanelActions, usePanels } from '@renderer/context'
import { cn } from '@renderer/utils'
import { FormEvent, JSX, MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react'
import { LuPanelRightClose, LuPanelRightOpen, LuSend, LuSparkles } from 'react-icons/lu'

type ChatMessage = {
  id: number
  role: 'user' | 'assistant'
  text: string
}

// Placeholder reply until the assistant is wired to an AI backend that can
// query the note database.
const placeholderReply =
  "I can't look through your notes just yet — AI answers are coming soon. Your question is noted!"

// Shell of the AI assistant (roadmap: right-sidebar conversational
// assistant). UI only: local message list, input, canned placeholder reply.
// The left edge is a drag handle for resizing; the collapse control sits at
// the bottom, mirroring the goals sidebar.
export const ChatPanel = (): JSX.Element => {
  const { isRightPanelOpen, rightPanelWidth } = usePanels()
  const { toggleRightPanel, setRightPanelWidth } = usePanelActions()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isResizing, setIsResizing] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length])

  const handleResizeStart = (event: ReactMouseEvent): void => {
    event.preventDefault()
    setIsResizing(true)
  }

  // While a drag is active, track the pointer globally; the panel hugs the
  // right window edge, so its width is the distance from cursor to that edge.
  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (event: MouseEvent): void => {
      setRightPanelWidth(window.innerWidth - event.clientX)
    }
    const handleMouseUp = (): void => {
      setIsResizing(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
    }
  }, [isResizing, setRightPanelWidth])

  const handleSend = (event: FormEvent): void => {
    event.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed) return

    setMessages((prev) => [
      ...prev,
      { id: prev.length + 1, role: 'user', text: trimmed },
      { id: prev.length + 2, role: 'assistant', text: placeholderReply }
    ])
    setDraft('')
  }

  return (
    <aside
      className={cn(
        'relative mt-10 shrink-0 border-l border-l-white/10 p-2 flex flex-col',
        !isResizing && 'transition-[width] duration-200'
      )}
      style={{ width: isRightPanelOpen ? rightPanelWidth : 48 }}
    >
      {isRightPanelOpen && (
        <div
          onMouseDown={handleResizeStart}
          title="Drag to resize"
          className={cn(
            'absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize transition-colors duration-100 hover:bg-zinc-400/40',
            isResizing && 'bg-zinc-400/40'
          )}
        />
      )}
      {isRightPanelOpen ? (
        <>
          <div className="flex items-center px-1">
            <span className="flex items-center gap-1.5 text-sm font-bold text-zinc-300">
              <LuSparkles className="w-4 h-4 text-yellow-500/70" />
              Assistant
            </span>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto mt-2 px-1">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center px-3">
                <LuSparkles className="w-8 h-8 text-zinc-600" />
                <p className="text-sm text-zinc-400">Ask about your notes</p>
                <p className="text-xs text-zinc-600">
                  Soon you&apos;ll be able to ask things like &quot;Summarize my Work notes from
                  this week.&quot;
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm whitespace-pre-wrap',
                      message.role === 'user'
                        ? 'self-end bg-zinc-700/50'
                        : 'self-start border border-white/10 text-zinc-300'
                    )}
                  >
                    {message.text}
                  </div>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={handleSend}
            className="mt-2 flex items-center gap-1 rounded-lg border border-zinc-400/50 bg-zinc-900/40 px-1 py-1 transition-colors duration-100 focus-within:border-zinc-300/60"
          >
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about your notes..."
              className="flex-1 min-w-0 bg-transparent px-2 py-1 text-sm outline-none caret-yellow-500 placeholder:text-zinc-500"
            />
            <button
              type="submit"
              title="Send"
              disabled={draft.trim().length === 0}
              className="rounded p-1.5 text-zinc-300 hover:bg-zinc-600/50 transition-colors duration-100 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <LuSend className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-2 border-t border-white/10 pt-2">
            <ActionButton
              onClick={toggleRightPanel}
              title="Collapse assistant"
              className="border-yellow-500/50 hover:bg-yellow-500/10"
            >
              <LuPanelRightClose className="h-4 w-4 text-yellow-500" />
            </ActionButton>
          </div>
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-end gap-3 pb-1">
          <LuSparkles className="w-4 h-4 text-zinc-600" />
          <ActionButton onClick={toggleRightPanel} title="Open assistant">
            <LuPanelRightOpen className="h-4 w-4 text-zinc-300" />
          </ActionButton>
        </div>
      )}
    </aside>
  )
}

import { ActionButton } from '@/components'
import { useAssistant, useAssistantActions, useBlockActions, useBlocks, useGoals, usePanelActions, usePanels } from '@renderer/context'
import { blockLabel, cn } from '@renderer/utils'
import { FormEvent, JSX, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { LuCircleStop, LuPanelRightClose, LuPanelRightOpen, LuPlus, LuSend, LuSparkles } from 'react-icons/lu'

export const ChatPanel = (): JSX.Element => {
  const { isRightPanelOpen, rightPanelWidth } = usePanels()
  const { toggleRightPanel, setRightPanelWidth } = usePanelActions()
  const { conversations, activeConversationId, isStreaming, error, scopeGoalId, scopeDateRange, draft } = useAssistant()
  const { sendMessage, cancel, newConversation, selectConversation, setScopeGoalId, setScopeDateRange, setDraft } = useAssistantActions()
  const { selectedCategory } = useGoals()
  const { blocks } = useBlocks()
  const { selectBlock } = useBlockActions()
  const [isResizing, setIsResizing] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const active = useMemo(() => conversations.find((item) => item.id === activeConversationId) ?? null, [conversations, activeConversationId])
  const activeMessageCount = active?.messages.length
  const activeLastMessageText = active?.messages[activeMessageCount ? activeMessageCount - 1 : 0]?.text

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [activeMessageCount, activeLastMessageText])
  useEffect(() => {
    if (!isResizing) return
    const move = (event: MouseEvent): void => setRightPanelWidth(window.innerWidth - event.clientX)
    const up = (): void => setIsResizing(false)
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); document.body.style.cursor = 'col-resize'
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.style.cursor = '' }
  }, [isResizing, setRightPanelWidth])

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const message = draft.trim()
    if (!message) return
    setDraft('')
    void sendMessage(message)
  }
  const labelFor = (id: string): string => blockLabel(blocks?.find((block) => block.id === id)?.excerpt ?? 'note')

  return <aside className={cn('relative mt-10 shrink-0 border-l border-l-white/10 p-2 flex flex-col', !isResizing && 'transition-[width] duration-200')} style={{ width: isRightPanelOpen ? rightPanelWidth : 48 }}>
    {isRightPanelOpen && <div onMouseDown={(event: ReactMouseEvent) => { event.preventDefault(); setIsResizing(true) }} title="Drag to resize" className={cn('absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-zinc-400/40', isResizing && 'bg-zinc-400/40')} />}
    {isRightPanelOpen ? <>
      <div className="flex items-center gap-1 px-1"><span className="flex flex-1 items-center gap-1.5 text-sm font-bold text-zinc-300"><LuSparkles className="h-4 w-4 text-yellow-500/70" />Assistant</span><button type="button" title="New conversation" onClick={newConversation} className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"><LuPlus className="h-4 w-4" /></button></div>
      {conversations.length > 0 && <select value={activeConversationId ?? ''} onChange={(event) => selectConversation(event.target.value)} className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-300"><option value="">New conversation</option>{conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}</select>}
      <div className="mt-2 flex flex-wrap gap-1"><button type="button" onClick={() => setScopeGoalId(undefined)} className={cn('rounded px-1.5 py-0.5 text-xs', scopeGoalId === undefined ? 'bg-yellow-500/15 text-yellow-500' : 'text-zinc-500 hover:bg-zinc-700')}>All notes</button><button type="button" onClick={() => setScopeGoalId(selectedCategory)} className={cn('rounded px-1.5 py-0.5 text-xs', scopeGoalId === selectedCategory ? 'bg-yellow-500/15 text-yellow-500' : 'text-zinc-500 hover:bg-zinc-700')}>Current goal</button><button type="button" onClick={() => setScopeDateRange(scopeDateRange === 'week' ? 'all' : 'week')} className={cn('rounded px-1.5 py-0.5 text-xs', scopeDateRange === 'week' ? 'bg-yellow-500/15 text-yellow-500' : 'text-zinc-500 hover:bg-zinc-700')}>This week</button></div>
      <div ref={listRef} className="mt-2 flex-1 overflow-y-auto px-1">{!active || active.messages.length === 0 ? <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center"><LuSparkles className="h-8 w-8 text-zinc-600" /><p className="text-sm text-zinc-400">Ask about your notes</p></div> : <div className="flex flex-col gap-2">{active.messages.map((message) => <div key={message.id} className={cn('max-w-[92%] rounded-lg px-2.5 py-1.5 text-sm whitespace-pre-wrap', message.role === 'user' ? 'self-end bg-zinc-700/50' : 'self-start border border-white/10 text-zinc-300')}>
        {message.text || (isStreaming ? <span className="text-zinc-500">Thinking...</span> : '')}
        {message.citedBlockIds && message.citedBlockIds.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{message.citedBlockIds.map((id) => <button type="button" key={id} onClick={() => selectBlock(id)} title="Open cited note" className="rounded border border-yellow-500/30 px-1 py-0.5 text-xs text-yellow-500 hover:bg-yellow-500/10">{labelFor(id)}</button>)}</div>}
      </div>)}</div>}</div>
      {error && <p className="mt-1 px-1 text-xs text-red-400" role="alert">{error}</p>}
      <form onSubmit={submit} className="mt-2 flex items-center gap-1 rounded-lg border border-zinc-400/50 bg-zinc-900/40 px-1 py-1 focus-within:border-zinc-300/60"><input type="text" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about your notes..." className="min-w-0 flex-1 bg-transparent px-2 py-1 text-sm outline-none caret-yellow-500 placeholder:text-zinc-500" />{isStreaming ? <button type="button" title="Stop" onClick={cancel} className="rounded p-1.5 text-yellow-500 hover:bg-zinc-700"><LuCircleStop className="h-4 w-4" /></button> : <button type="submit" title="Send" disabled={!draft.trim()} className="rounded p-1.5 text-zinc-300 hover:bg-zinc-600/50 disabled:opacity-40"><LuSend className="h-4 w-4" /></button>}</form>
      <div className="mt-2 border-t border-white/10 pt-2"><ActionButton onClick={toggleRightPanel} title="Collapse assistant" className="border-yellow-500/50 hover:bg-yellow-500/10"><LuPanelRightClose className="h-4 w-4 text-yellow-500" /></ActionButton></div>
    </> : <div className="flex h-full flex-col items-center justify-end gap-3 pb-1"><LuSparkles className="h-4 w-4 text-zinc-600" /><ActionButton onClick={toggleRightPanel} title="Open assistant"><LuPanelRightOpen className="h-4 w-4 text-zinc-300" /></ActionButton></div>}
  </aside>
}

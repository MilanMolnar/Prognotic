import { ActionButton, AssistantSelect, AssistantSelectOption } from '@/components'
import { useAssistant, useAssistantActions, useBlockActions, useBlocks, useGoals, usePanelActions, usePanels, useSettings } from '@renderer/context'
import { blockLabel, cn } from '@renderer/utils'
import { researchCategory } from '@shared/constants'
import { LlmProvider } from '@shared/models'
import { LlmModel } from '@shared/types'
import { FormEvent, JSX, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { LuCircleStop, LuPanelRightClose, LuPanelRightOpen, LuPlus, LuSend, LuSparkles } from 'react-icons/lu'

const goalOptions: AssistantSelectOption[] = [
  { value: 'open', label: 'Currently open goal' },
  { value: 'all', label: 'All goals' },
  { value: 'relevant', label: 'All relevant goals' }
]

const timeOptions: AssistantSelectOption[] = [
  { value: 'today', label: 'Current notes' },
  { value: 'week', label: 'This week' },
  { value: 'custom', label: 'Custom' }
]

const modelValue = (provider: LlmProvider, model: string): string => JSON.stringify([provider, model])

export const ChatPanel = (): JSX.Element => {
  const { isRightPanelOpen, rightPanelWidth } = usePanels()
  const { toggleRightPanel, setRightPanelWidth } = usePanelActions()
  const {
    conversations,
    activeConversationId,
    isStreaming,
    error,
    goalMode,
    timeRange,
    customStartDate,
    customEndDate,
    conversationProvider,
    conversationModel,
    usesDefaultModel,
    draft
  } = useAssistant()
  const {
    sendMessage,
    cancel,
    newConversation,
    selectConversation,
    setGoalMode,
    setTimeRange,
    setCustomDateRange,
    setConversationModel,
    setDraft
  } = useAssistantActions()
  const { selectedCategory, goals } = useGoals()
  const { settings } = useSettings()
  const { blocks } = useBlocks()
  const { selectBlock } = useBlockActions()
  const [isResizing, setIsResizing] = useState(false)
  const [modelResult, setModelResult] = useState<{ provider: LlmProvider; models: LlmModel[]; error: string | null } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const active = useMemo(() => conversations.find((item) => item.id === activeConversationId) ?? null, [conversations, activeConversationId])
  const activeMessageCount = active?.messages.length
  const activeLastMessageText = active?.messages[activeMessageCount ? activeMessageCount - 1 : 0]?.text
  const retryPrompt = active ? [...active.messages].reverse().find((message) => message.role === 'user')?.text : undefined

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [activeMessageCount, activeLastMessageText])
  useEffect(() => {
    if (!isResizing) return
    const move = (event: MouseEvent): void => setRightPanelWidth(window.innerWidth - event.clientX)
    const up = (): void => setIsResizing(false)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    document.body.style.cursor = 'col-resize'
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
    }
  }, [isResizing, setRightPanelWidth])

  useEffect(() => {
    let cancelled = false
    void window.context.getLlmModels(settings.llm.provider).then((result) => {
      if (cancelled) return
      if ('error' in result) {
        setModelResult({ provider: settings.llm.provider, models: [], error: result.error ?? 'Could not load models.' })
        return
      }
      setModelResult({ provider: settings.llm.provider, models: result.models, error: null })
    })
    return () => { cancelled = true }
  }, [settings.llm.provider, settings.llm.model])

  const isLoadingModels = modelResult?.provider !== settings.llm.provider
  const models = useMemo(() => isLoadingModels ? [] : (modelResult?.models ?? []), [isLoadingModels, modelResult])
  const modelError = isLoadingModels ? null : modelResult?.error

  const customDatesValid = timeRange !== 'custom' || (
    customStartDate.length > 0 &&
    customEndDate.length > 0 &&
    customStartDate <= customEndDate
  )
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const message = draft.trim()
    if (!message || !customDatesValid) return
    setDraft('')
    void sendMessage(message)
  }
  const labelFor = (id: string): string => blockLabel(blocks?.find((block) => block.id === id)?.excerpt ?? 'note')
  const selectedGoalName = selectedCategory === null
    ? 'Quick Notes'
    : selectedCategory === researchCategory
      ? 'Research'
      : goals?.find((goal) => goal.id === selectedCategory)?.name ?? 'Goal'

  const conversationOptions = useMemo<AssistantSelectOption[]>(() => [
    { value: '', label: 'New conversation' },
    ...conversations.map((conversation) => ({ value: conversation.id, label: conversation.title }))
  ], [conversations])
  const scopedGoalOptions = useMemo<AssistantSelectOption[]>(() => goalOptions.map((option) => option.value === 'open'
    ? { ...option, label: `${option.label} (${selectedGoalName})` }
    : option), [selectedGoalName])
  const selectedModelValue = usesDefaultModel ? '__default__' : modelValue(conversationProvider, conversationModel)
  const modelOptions = useMemo<AssistantSelectOption[]>(() => {
    const options: AssistantSelectOption[] = [{
      value: '__default__',
      label: `Default · ${settings.llm.model || 'No model selected'}`,
      isDefault: true
    }]
    const selectedOverride = modelValue(conversationProvider, conversationModel)
    if (!usesDefaultModel && (conversationProvider !== settings.llm.provider || !models.some((model) => model.id === conversationModel))) {
      options.push({ value: selectedOverride, label: `${conversationModel} · ${conversationProvider}` })
    }
    for (const model of models) {
      const value = modelValue(settings.llm.provider, model.id)
      if (!options.some((option) => option.value === value)) options.push({ value, label: model.label })
    }
    return options
  }, [conversationModel, conversationProvider, models, settings.llm.model, settings.llm.provider, usesDefaultModel])

  const handleModelChange = (value: string): void => {
    if (value === '__default__') {
      setConversationModel(null)
      return
    }
    const [provider, model] = JSON.parse(value) as [LlmProvider, string]
    setConversationModel({ provider, model })
  }

  return <aside className={cn('relative mt-10 shrink-0 border-l border-l-white/10 p-2 flex flex-col', !isResizing && 'transition-[width] duration-200')} style={{ width: isRightPanelOpen ? rightPanelWidth : 48 }}>
    {isRightPanelOpen && <div onMouseDown={(event: ReactMouseEvent) => { event.preventDefault(); setIsResizing(true) }} title="Drag to resize" className={cn('absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-zinc-400/40', isResizing && 'bg-zinc-400/40')} />}
    {isRightPanelOpen ? <>
      <div className="flex items-center gap-1 px-1">
        <span className="flex flex-1 items-center gap-1.5 text-sm font-bold text-zinc-300"><LuSparkles className="h-4 w-4 text-yellow-500/70" />Assistant</span>
        <button type="button" title="New conversation" onClick={newConversation} className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"><LuPlus className="h-4 w-4" /></button>
      </div>
      <AssistantSelect ariaLabel="Conversation" value={activeConversationId ?? ''} options={conversationOptions} onChange={selectConversation} className="mt-2" />
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <AssistantSelect ariaLabel="Goal scope" value={goalMode} options={scopedGoalOptions} onChange={(value) => setGoalMode(value as typeof goalMode)} disabled={isStreaming} />
        <AssistantSelect ariaLabel="Time interval" value={timeRange} options={timeOptions} onChange={(value) => setTimeRange(value as typeof timeRange)} disabled={isStreaming} />
      </div>
      {timeRange === 'custom' && <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded border border-zinc-700 bg-zinc-900/60 p-1.5">
        <label className="text-[10px] text-zinc-500">Start
          <input type="date" value={customStartDate} max={customEndDate || undefined} onChange={(event) => setCustomDateRange(event.target.value, customEndDate)} className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-1 py-1 text-xs text-zinc-300 outline-none focus:border-yellow-500/60" />
        </label>
        <label className="text-[10px] text-zinc-500">End
          <input type="date" value={customEndDate} min={customStartDate || undefined} onChange={(event) => setCustomDateRange(customStartDate, event.target.value)} className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-1 py-1 text-xs text-zinc-300 outline-none focus:border-yellow-500/60" />
        </label>
        {!customDatesValid && <p className="col-span-2 text-[10px] text-yellow-500/80">Choose a valid start and end date.</p>}
      </div>}
      <div ref={listRef} className="mt-2 flex-1 overflow-y-auto px-1">
        {!active || active.messages.length === 0
          ? <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center"><LuSparkles className="h-8 w-8 text-zinc-600" /><p className="text-sm text-zinc-400">Ask about your notes</p></div>
          : <div className="flex flex-col gap-2">{active.messages.map((message) => <div key={message.id} className={cn('max-w-[92%] rounded-lg px-2.5 py-1.5 text-sm whitespace-pre-wrap', message.role === 'user' ? 'self-end bg-zinc-700/50' : 'self-start border border-white/10 text-zinc-300')}>
            {message.role === 'assistant' && message.readGoalLabels && <p className="mb-1 text-xs font-medium text-yellow-500/80">Read notes from: {message.readGoalLabels.join(', ')}</p>}
            {message.text || (isStreaming ? <span className="text-zinc-500">Thinking...</span> : '')}
            {message.citedBlockIds && message.citedBlockIds.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{message.citedBlockIds.map((id) => <button type="button" key={id} onClick={() => selectBlock(id)} title="Open cited note" className="rounded border border-yellow-500/30 px-1 py-0.5 text-xs text-yellow-500 hover:bg-yellow-500/10">{labelFor(id)}</button>)}</div>}
          </div>)}</div>}
      </div>
      {error && <div className="mt-1 flex items-center gap-2 px-1 text-xs" role="alert"><span className="text-red-400">{error}</span>{retryPrompt && <button type="button" onClick={() => setDraft(retryPrompt)} className="rounded border border-red-400/40 px-1.5 py-0.5 text-red-300 hover:bg-red-500/10">Retry</button>}</div>}
      <AssistantSelect ariaLabel="Conversation model" value={selectedModelValue} options={modelOptions} onChange={handleModelChange} disabled={isStreaming || isLoadingModels && modelOptions.length === 1} placement="up" maxVisibleOptions={6} searchableThreshold={10} searchPlaceholder="Filter models..." className="mt-1.5" />
      {modelError && <p className="mt-1 px-1 text-[10px] text-zinc-500">{modelError}</p>}
      <form onSubmit={submit} className="mt-2 flex items-center gap-1 rounded-lg border border-zinc-400/50 bg-zinc-900/40 px-1 py-1 focus-within:border-zinc-300/60">
        <input type="text" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about your notes..." className="min-w-0 flex-1 bg-transparent px-2 py-1 text-sm outline-none caret-yellow-500 placeholder:text-zinc-500" />
        {isStreaming
          ? <button type="button" title="Stop" onClick={cancel} className="rounded p-1.5 text-yellow-500 hover:bg-zinc-700"><LuCircleStop className="h-4 w-4" /></button>
          : <button type="submit" title="Send" disabled={!draft.trim() || !customDatesValid || !conversationModel} className="rounded p-1.5 text-zinc-300 hover:bg-zinc-600/50 disabled:opacity-40"><LuSend className="h-4 w-4" /></button>}
      </form>
      <div className="mt-2 border-t border-white/10 pt-2"><ActionButton onClick={toggleRightPanel} title="Collapse assistant" className="border-yellow-500/50 hover:bg-yellow-500/10"><LuPanelRightClose className="h-4 w-4 text-yellow-500" /></ActionButton></div>
    </> : <div className="flex h-full flex-col items-center justify-end gap-3 pb-1"><LuSparkles className="h-4 w-4 text-zinc-600" /><ActionButton onClick={toggleRightPanel} title="Open assistant"><LuPanelRightOpen className="h-4 w-4 text-zinc-300" /></ActionButton></div>}
  </aside>
}

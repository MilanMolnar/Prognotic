import { ActionButton, AssistantMessageContent, AssistantSelect, AssistantSelectOption, NoteBlockPreviewModal, UsageDoughnut } from '@/components'
import { useAssistant, useAssistantActions, useBlockActions, useBlockDrag, useBlocks, useGoalActions, useGoals, useI18n, usePanelActions, usePanels, useSettings } from '@renderer/context'
import { onboardingEvents } from '@renderer/onboarding/events'
import { blockLabel, cn } from '@renderer/utils'
import { assistantDisplayName, researchCategory } from '@shared/constants'
import { LlmUsageSummary } from '@shared/llmUsage'
import { AssistantMode, BlockMeta, LlmProvider } from '@shared/models'
import { LlmModel } from '@shared/types'
import { FormEvent, JSX, KeyboardEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { LuCheck, LuCircleStop, LuCopy, LuPanelRightClose, LuPanelRightOpen, LuPlus, LuSend, LuSparkles, LuX } from 'react-icons/lu'
import { showBlockToast } from './blockToast'

const modelValue = (provider: LlmProvider, model: string): string => JSON.stringify([provider, model])
const composerAttachmentLabel = (label: string): string => label.length > 15 ? `${label.slice(0, 15)}...` : label

type PreviewedBlock = {
  block: BlockMeta
  categoryId: string | null
  label: string
}

export const ChatPanel = (): JSX.Element => {
  const { isRightPanelOpen, rightPanelWidth } = usePanels()
  const { toggleRightPanel, setRightPanelWidth } = usePanelActions()
  const {
    conversations,
    activeConversationId,
    isStreaming,
    error,
    assistantMode,
    goalMode,
    timeRange,
    customStartDate,
    customEndDate,
    conversationProvider,
    conversationModel,
    usesDefaultModel,
    draft,
    attachedBlockIds
  } = useAssistant()
  const {
    sendMessage,
    cancel,
    newConversation,
    selectConversation,
    setAssistantMode,
    setGoalMode,
    setTimeRange,
    setCustomDateRange,
    setConversationModel,
    setDraft,
    appendToDraft,
    removeAttachedBlock
  } = useAssistantActions()
  const { selectedCategory, goals } = useGoals()
  const { selectCategory } = useGoalActions()
  const { settings } = useSettings()
  const { blocks } = useBlocks()
  const { selectBlock, focusBlockFromAssistant } = useBlockActions()
  const { activeDrag } = useBlockDrag()
  const { t } = useI18n()
  const goalOptions = useMemo<AssistantSelectOption[]>(() => [
    { value: 'open', label: t('assistant.currentlyOpenGoal') },
    { value: 'all', label: t('assistant.goal.all') },
    { value: 'relevant', label: t('assistant.allRelevantGoals') }
  ], [t])
  const timeOptions = useMemo<AssistantSelectOption[]>(() => [
    { value: 'today', label: t('assistant.currentNotes') },
    { value: 'week', label: t('assistant.time.week') },
    { value: 'custom', label: t('assistant.custom') },
    { value: 'all', label: t('assistant.time.all') }
  ], [t])
  const modeOptions = useMemo<AssistantSelectOption[]>(() => [
    { value: 'note-chat', label: t('assistant.mode.chat') },
    { value: 'research', label: t('assistant.mode.research') },
    { value: 'search', label: t('assistant.mode.search') }
  ], [t])
  const modePrompt: Record<AssistantMode, string> = {
    'note-chat': t('assistant.prompt.chat'),
    research: t('assistant.prompt.research'),
    search: t('assistant.prompt.search')
  }
  const [isResizing, setIsResizing] = useState(false)
  const [modelResult, setModelResult] = useState<{ provider: LlmProvider; models: LlmModel[]; error: string | null } | null>(null)
  const [preview, setPreview] = useState<PreviewedBlock | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [usageSummary, setUsageSummary] = useState<LlmUsageSummary | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const copyResetTimerRef = useRef<number | null>(null)
  const active = useMemo(() => conversations.find((item) => item.id === activeConversationId) ?? null, [conversations, activeConversationId])
  const activeMessageCount = active?.messages.length
  const activeLastMessageText = active?.messages[activeMessageCount ? activeMessageCount - 1 : 0]?.text
  const retryPrompt = active ? [...active.messages].reverse().find((message) => message.role === 'user')?.text : undefined

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [activeMessageCount, activeLastMessageText])
  useEffect(() => () => {
    if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current)
  }, [])
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
        setModelResult({ provider: settings.llm.provider, models: [], error: result.error ?? t('assistant.error.models') })
        return
      }
      setModelResult({ provider: settings.llm.provider, models: result.models, error: null })
    })
    return () => { cancelled = true }
  }, [settings.llm.provider, settings.llm.model, t])

  const usageBudget = settings.llm.usageBudget
  useEffect(() => {
    if (!isRightPanelOpen || !usageBudget.enabled || usageBudget.limitUsd <= 0) return
    let cancelled = false
    const refreshUsage = (): void => {
      void window.context.getLlmUsageSummary()
        .then((summary) => { if (!cancelled) setUsageSummary(summary) })
        .catch(() => { /* Keep the last locally loaded value. */ })
    }
    refreshUsage()
    const poll = window.setInterval(refreshUsage, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(poll)
    }
  }, [
    isRightPanelOpen,
    isStreaming,
    usageBudget.enabled,
    usageBudget.limitUsd,
    usageBudget.periodStartedAt,
    usageBudget.resetDays,
    usageBudget.resetInterval
  ])

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

  const submitFromComposer = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  const selectedGoalName = selectedCategory === null
    ? t('navigation.quickNotes')
    : selectedCategory === researchCategory
      ? t('navigation.research')
      : goals?.find((goal) => goal.id === selectedCategory)?.name ?? t('block.goalFallback')

  const categoryLabel = (categoryId: string | null): string => {
    if (categoryId === null) return t('navigation.quickNotes')
    if (categoryId === researchCategory) return t('navigation.research')
    return goals?.find((goal) => goal.id === categoryId)?.name ?? t('block.goalFallback')
  }

  const categoryForCitation = (block: BlockMeta, preferredCategories: Record<string, string | null> | undefined): string | null => {
    if (preferredCategories && Object.prototype.hasOwnProperty.call(preferredCategories, block.id)) {
      const preferred = preferredCategories[block.id]
      if (block.categories.includes(preferred) && (preferred === null || preferred === researchCategory || goals?.some((goal) => goal.id === preferred))) {
        return preferred
      }
    }
    const namedCategory = block.categories.find((category) => category !== null && (category === researchCategory || goals?.some((goal) => goal.id === category)))
    if (namedCategory !== undefined) return namedCategory
    if (block.categories.includes(null)) return null
    return block.categories[0] ?? null
  }

  const citationLabel = (id: string, preferredCategories: Record<string, string | null> | undefined): string => {
    const block = blocks?.find((item) => item.id === id)
    if (!block) return t('assistant.unknownNote')
    const categoryId = categoryForCitation(block, preferredCategories)
    return `${categoryLabel(categoryId)}/${blockLabel(block, settings.llm.aiBlockNameSummary)}`
  }

  const openCitation = (id: string, preferredCategories: Record<string, string | null> | undefined): void => {
    const block = blocks?.find((item) => item.id === id)
    if (!block) return
    const categoryId = categoryForCitation(block, preferredCategories)
    setPreview({
      block,
      categoryId,
      label: `${categoryLabel(categoryId)}/${blockLabel(block, settings.llm.aiBlockNameSummary)}`
    })
  }

  const conversationOptions = useMemo<AssistantSelectOption[]>(() => [
    { value: '', label: t('assistant.newConversation') },
    ...conversations.map((conversation) => ({ value: conversation.id, label: conversation.title }))
  ], [conversations, t])
  const scopedGoalOptions = useMemo<AssistantSelectOption[]>(() => goalOptions.map((option) => option.value === 'open'
    ? { ...option, label: `${option.label} (${selectedGoalName})` }
    : option), [goalOptions, selectedGoalName])
  const selectedModelValue = usesDefaultModel ? '__default__' : modelValue(conversationProvider, conversationModel)
  const modelOptions = useMemo<AssistantSelectOption[]>(() => {
    const options: AssistantSelectOption[] = [{
      value: '__default__',
      label: t('assistant.defaultModel', { model: settings.llm.model || t('assistant.noModel') }),
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
  }, [conversationModel, conversationProvider, models, settings.llm.model, settings.llm.provider, t, usesDefaultModel])

  const handleModelChange = (value: string): void => {
    if (value === '__default__') {
      setConversationModel(null)
      return
    }
    const [provider, model] = JSON.parse(value) as [LlmProvider, string]
    setConversationModel({ provider, model })
  }

  const goalIsModeLocked = assistantMode === 'research' || assistantMode === 'search'
  const timeIsModeLocked = assistantMode === 'search'
  const attachedBlocks = useMemo(() => attachedBlockIds
    .map((id) => blocks?.find((block) => block.id === id))
    .filter((block): block is BlockMeta => block !== undefined), [attachedBlockIds, blocks])

  const copyMessage = (messageId: string, text: string): void => {
    void window.context.writeClipboardText(text).then(() => {
      setCopiedMessageId(messageId)
      if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current)
      copyResetTimerRef.current = window.setTimeout(() => setCopiedMessageId(null), 1_500)
    }).catch(() => showBlockToast(t('assistant.error.copy')))
  }

  return <aside
    data-tour="chat-panel"
    data-chat-drop-target=""
    className={cn(
      'relative mt-10 shrink-0 border-l border-l-white/10 p-2 flex flex-col',
      !isResizing && 'transition-[width,border-color,background-color] duration-200',
      activeDrag && 'border-l-yellow-500/40 bg-yellow-500/[0.03]',
      activeDrag?.target?.type === 'chat' && 'border-l-yellow-300 bg-yellow-500/[0.08] shadow-[-8px_0_24px_rgb(234_179_8_/_0.12)]'
    )}
    style={{ width: isRightPanelOpen ? rightPanelWidth : 48 }}
  >
    {isRightPanelOpen && <div onMouseDown={(event: ReactMouseEvent) => { event.preventDefault(); setIsResizing(true) }} title={t('assistant.dragResize')} className={cn('absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-zinc-400/40', isResizing && 'bg-zinc-400/40')} />}
    {isRightPanelOpen ? <>
      <div className="flex items-center gap-1 px-1">
        <span className="flex flex-1 items-center gap-1.5 text-sm font-bold text-zinc-300"><LuSparkles className="h-4 w-4 text-yellow-500/70" />{assistantDisplayName}</span>
        <button type="button" title={t('assistant.newConversation')} onClick={newConversation} className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"><LuPlus className="h-4 w-4" /></button>
      </div>
      <AssistantSelect label={t('assistant.conversation')} ariaLabel={t('assistant.conversation')} value={activeConversationId ?? ''} options={conversationOptions} onChange={selectConversation} className="mt-2" />
      <div data-tour="assistant-scopes" className="mt-2 grid grid-cols-2 gap-1.5">
        <AssistantSelect label={goalIsModeLocked ? t('assistant.goalFixed') : t('assistant.goal')} ariaLabel={t('assistant.goalScope')} value={goalMode} options={scopedGoalOptions} onChange={(value) => setGoalMode(value as typeof goalMode)} disabled={isStreaming || goalIsModeLocked} />
        <AssistantSelect label={timeIsModeLocked ? t('assistant.timeFixed') : t('assistant.time')} ariaLabel={t('assistant.timeInterval')} value={timeRange} options={timeOptions} onChange={(value) => setTimeRange(value as typeof timeRange)} disabled={isStreaming || timeIsModeLocked} />
      </div>
      {timeRange === 'custom' && <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded border border-zinc-700 bg-zinc-900/60 p-1.5">
        <label className="text-[10px] text-zinc-500">{t('assistant.startDate')}
          <input type="date" value={customStartDate} max={customEndDate || undefined} onChange={(event) => setCustomDateRange(event.target.value, customEndDate)} className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-1 py-1 text-xs text-zinc-300 outline-none focus:border-yellow-500/60" />
        </label>
        <label className="text-[10px] text-zinc-500">{t('assistant.endDate')}
          <input type="date" value={customEndDate} min={customStartDate || undefined} onChange={(event) => setCustomDateRange(customStartDate, event.target.value)} className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-1 py-1 text-xs text-zinc-300 outline-none focus:border-yellow-500/60" />
        </label>
        {!customDatesValid && <p className="col-span-2 text-[10px] text-yellow-500/80">{t('assistant.chooseValidDates')}</p>}
      </div>}
      <div ref={listRef} className="mt-2 flex-1 overflow-y-auto px-1">
        {!active || active.messages.length === 0
          ? <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center"><LuSparkles className="h-8 w-8 text-zinc-600" /><p className="text-xs text-zinc-400">{modePrompt[assistantMode]}</p></div>
          : <div className="flex flex-col gap-2.5">{active.messages.map((message) => <div key={message.id} className={cn('group max-w-[92%]', message.role === 'user' ? 'self-end' : 'self-start')}>
            <div className={cn('mb-0.5 px-1 text-[9px] uppercase tracking-wider text-zinc-600', message.role === 'user' && 'text-right')}>{message.role === 'user' ? t('assistant.you') : assistantDisplayName}</div>
            <div className={cn(
              'relative rounded-xl border px-2.5 py-2 pr-7 text-xs leading-relaxed',
              message.role === 'user'
                ? 'rounded-br-sm border-yellow-500/20 bg-yellow-500/10 text-zinc-100'
                : 'rounded-bl-sm border-white/10 bg-zinc-900/55 text-zinc-300'
            )}>
              {message.text && <button
                type="button"
                title={copiedMessageId === message.id ? t('assistant.copied') : t('assistant.copyMessage')}
                aria-label={copiedMessageId === message.id ? t('assistant.messageCopied') : t('assistant.copyMessage')}
                onClick={() => copyMessage(message.id, message.text)}
                className="absolute right-1 top-1 rounded p-1 text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-zinc-200 focus:opacity-100 group-hover:opacity-100"
              >
                {copiedMessageId === message.id ? <LuCheck className="h-3 w-3 text-yellow-400" /> : <LuCopy className="h-3 w-3" />}
              </button>}
              <div className="select-text whitespace-pre-wrap cursor-text">
                {message.text ? <AssistantMessageContent text={message.text} resolveCitationLabel={(id) => citationLabel(id, message.citedBlockCategoryIds)} /> : (isStreaming ? <span className="text-zinc-500">{t('common.thinking')}</span> : '')}
              </div>
              {message.role === 'assistant' && message.citedBlockIds && message.citedBlockIds.length > 0 && <div className="mt-2 flex flex-wrap gap-1 border-t border-white/10 pt-1.5">{message.citedBlockIds.map((id) => {
                const block = blocks?.find((item) => item.id === id)
                if (!block) return null
                const categoryId = categoryForCitation(block, message.citedBlockCategoryIds)
                return <button type="button" key={id} onClick={() => openCitation(id, message.citedBlockCategoryIds)} title={t('assistant.previewSource')} className="max-w-full truncate rounded border border-yellow-500/30 px-1.5 py-0.5 text-[10px] text-yellow-400 hover:bg-yellow-500/10">{categoryLabel(categoryId)}/{blockLabel(block, settings.llm.aiBlockNameSummary)}</button>
              })}</div>}
            </div>
          </div>)}</div>}
      </div>
      {error && <div className="mt-1 flex items-center gap-2 px-1 text-xs" role="alert"><span className="text-red-400">{error}</span>{retryPrompt && <button type="button" onClick={() => setDraft(retryPrompt)} className="rounded border border-red-400/40 px-1.5 py-0.5 text-red-300 hover:bg-red-500/10">{t('common.retry')}</button>}</div>}
      <form onSubmit={submit} className="mt-2 flex flex-col rounded-lg border border-zinc-400/50 bg-zinc-900/40 px-1 py-1 focus-within:border-zinc-300/60">
        {attachedBlocks.length > 0 && <div data-tour="assistant-context" className="flex flex-wrap gap-1 px-1 pb-0.5 pt-0.5">
          {attachedBlocks.map((block) => {
            const label = blockLabel(block, settings.llm.aiBlockNameSummary)
            return <span key={block.id} title={label} className="flex max-w-full items-center gap-1 rounded-md border border-yellow-500/40 bg-yellow-500/10 py-0.5 pl-1.5 pr-0.5 text-[10px] text-yellow-300">
              <span className="truncate">{composerAttachmentLabel(label)}</span>
              <button
                type="button"
                title={t('assistant.removeAttachment', { label })}
                aria-label={t('assistant.removeAttached', { label })}
                onClick={() => removeAttachedBlock(block.id)}
                className="rounded p-0.5 text-yellow-500/70 hover:bg-yellow-500/15 hover:text-yellow-200"
              >
                <LuX className="h-3 w-3" />
              </button>
            </span>
          })}
        </div>}
        <div className="flex items-end gap-1">
          <textarea rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={submitFromComposer} placeholder={modePrompt[assistantMode]} className="max-h-28 min-h-12 min-w-0 flex-1 resize-none bg-transparent px-2 py-1 text-xs leading-relaxed outline-none caret-yellow-500 placeholder:text-xs placeholder:text-zinc-500" />
          {isStreaming
            ? <button type="button" title={t('common.stop')} onClick={cancel} className="rounded p-1.5 text-yellow-500 hover:bg-zinc-700"><LuCircleStop className="h-4 w-4" /></button>
            : <button type="submit" title={t('common.send')} disabled={!draft.trim() || !customDatesValid || !conversationModel} className="rounded p-1.5 text-zinc-300 hover:bg-zinc-600/50 disabled:opacity-40"><LuSend className="h-4 w-4" /></button>}
        </div>
      </form>
      <div data-tour="assistant-model-mode" className="mt-2 grid grid-cols-2 items-end gap-1.5">
        <AssistantSelect label={t('assistant.model')} ariaLabel={t('assistant.conversationModel')} value={selectedModelValue} options={modelOptions} onChange={handleModelChange} disabled={isStreaming || isLoadingModels && modelOptions.length === 1} placement="up" maxVisibleOptions={6} searchableThreshold={10} searchPlaceholder={t('assistant.filterModels')} />
        <AssistantSelect label={t('assistant.mode')} ariaLabel={t('assistant.modeAria')} value={assistantMode} options={modeOptions} onChange={(value) => setAssistantMode(value as AssistantMode)} disabled={isStreaming} placement="up" />
      </div>
      {modelError && <p className="mt-1 px-1 text-[10px] text-zinc-500">{modelError}</p>}
      <div className="mt-2 flex items-end justify-between border-t border-white/10 pt-2">
        <ActionButton onClick={toggleRightPanel} title={t('navigation.closeAssistant')} className="border-yellow-500/50 hover:bg-yellow-500/10"><LuPanelRightClose className="h-4 w-4 text-yellow-500" /></ActionButton>
        {usageBudget.enabled && usageBudget.limitUsd > 0 && <UsageDoughnut
          usedUsd={usageSummary?.currentPeriod?.estimatedUsd ?? 0}
          limitUsd={usageBudget.limitUsd}
          thresholds={usageBudget.thresholds}
          onClick={() => window.dispatchEvent(new CustomEvent(onboardingEvents.openSettingsModal, { detail: { section: 'ai-usage' } }))}
        />}
      </div>
    </> : <div className="flex h-full flex-col items-center justify-end gap-3 pb-1"><LuSparkles className="h-4 w-4 text-zinc-600" /><ActionButton onClick={toggleRightPanel} title={t('navigation.openAssistant')}><LuPanelRightOpen className="h-4 w-4 text-zinc-300" /></ActionButton></div>}
    {preview && <NoteBlockPreviewModal
      key={preview.block.id}
      block={preview.block}
      title={preview.label}
      onClose={() => setPreview(null)}
      onAddToChat={appendToDraft}
      onGoToNote={() => {
        selectCategory(preview.categoryId)
        selectBlock(preview.block.id)
        focusBlockFromAssistant(preview.block.id)
        setPreview(null)
      }}
    />}
  </aside>
}

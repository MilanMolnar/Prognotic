import { researchCategory } from '@shared/constants'
import { AssistantConversation, AssistantGoalMode, AssistantMessage, AssistantMode, AssistantTimeRange, LlmProvider } from '@shared/models'
import { AssistantModelSelection, AssistantScope, LlmMessage } from '@shared/types'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGoalActions, useGoals } from './GoalsContext'
import { usePanels, usePanelActions } from './PanelsContext'
import { useSettings } from './SettingsContext'
import { AssistantActions, AssistantActionsContext, AssistantState, AssistantStateContext } from './AssistantContext'
import { useI18n } from './I18nContext'

type ConversationPreferences = {
  mode: AssistantMode
  goalMode: AssistantGoalMode
  timeRange: AssistantTimeRange
  customStartDate: string
  customEndDate: string
  provider: LlmProvider
  model: string
  usesDefaultModel: boolean
}

const defaultPreferences = (provider: LlmProvider, model: string): ConversationPreferences => ({
  mode: 'note-chat',
  goalMode: 'open',
  timeRange: 'today',
  customStartDate: '',
  customEndDate: '',
  provider,
  model,
  usesDefaultModel: true
})

const normalizedMode = (mode: AssistantConversation['mode']): AssistantMode =>
  mode === 'research' || mode === 'search' ? mode : 'note-chat'

const modeConstraints = (mode: AssistantMode): Partial<ConversationPreferences> => {
  if (mode === 'research') return { goalMode: 'open' }
  if (mode === 'search') return { goalMode: 'all', timeRange: 'all' }
  return {}
}

const constrainPreferences = (preferences: ConversationPreferences): ConversationPreferences => ({
  ...preferences,
  ...modeConstraints(preferences.mode)
})

const preferencesFor = (
  conversation: AssistantConversation | undefined,
  pending: ConversationPreferences,
  defaultProvider: LlmProvider,
  defaultModel: string
): ConversationPreferences => {
  if (!conversation) {
    return constrainPreferences(pending.usesDefaultModel ? { ...pending, provider: defaultProvider, model: defaultModel } : pending)
  }
  const usesDefaultModel = conversation.usesDefaultModel !== false
  return constrainPreferences({
    mode: normalizedMode(conversation.mode),
    goalMode: conversation.goalMode ?? 'open',
    timeRange: conversation.timeRange ?? 'today',
    customStartDate: conversation.customStartDate ?? '',
    customEndDate: conversation.customEndDate ?? '',
    provider: usesDefaultModel ? defaultProvider : (conversation.provider ?? defaultProvider),
    model: usesDefaultModel ? defaultModel : (conversation.model ?? defaultModel),
    usesDefaultModel
  })
}

const createConversation = (preferences: ConversationPreferences, title: string): AssistantConversation => {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    ...preferences
  }
}

const citationIds = (text: string): string[] => [...new Set([...text.matchAll(/\[block:([\w-]+)]/g)].map((match) => match[1]))]

const withoutLeadingDisclosure = (text: string): string =>
  text.replace(/^\s*(?:\*\*)?Read notes from:\s*[^\r\n]*(?:\*\*)?\s*(?:\r?\n)*/i, '')

const scopeDates = (preferences: ConversationPreferences): Pick<AssistantScope, 'from' | 'to'> | null => {
  if (preferences.timeRange === 'all') return {}
  const now = new Date()
  if (preferences.timeRange === 'today') {
    const start = new Date(now)
    const end = new Date(now)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    return { from: start.getTime(), to: end.getTime() }
  }
  if (preferences.timeRange === 'week') {
    return { from: now.getTime() - 7 * 24 * 60 * 60 * 1000, to: now.getTime() }
  }
  if (!preferences.customStartDate || !preferences.customEndDate) return null
  const start = new Date(`${preferences.customStartDate}T00:00:00`)
  const end = new Date(`${preferences.customEndDate}T23:59:59.999`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return null
  return { from: start.getTime(), to: end.getTime() }
}

export const AssistantProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
  const { settings } = useSettings()
  const { t } = useI18n()
  const { selectedCategory } = useGoals()
  const { selectCategory } = useGoalActions()
  const [conversations, setConversations] = useState<AssistantConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [pendingPreferences, setPendingPreferences] = useState<ConversationPreferences>(() => defaultPreferences(settings.llm.provider, settings.llm.model))
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [attachedBlockIds, setAttachedBlockIds] = useState<string[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const requestIdRef = useRef<string | null>(null)
  const requestConversationIdRef = useRef<string | null>(null)
  const requestAttachedBlockIdsRef = useRef<string[]>([])
  const attachedBlockIdsRef = useRef(attachedBlockIds)
  const activeConversationIdRef = useRef(activeConversationId)
  const conversationsRef = useRef(conversations)
  const { isRightPanelOpen } = usePanels()
  const { toggleRightPanel } = usePanelActions()

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
    conversationsRef.current = conversations
  }, [activeConversationId, conversations])

  useEffect(() => {
    attachedBlockIdsRef.current = attachedBlockIds
  }, [attachedBlockIds])

  useEffect(() => {
    void window.context.getAssistantConversations().then((saved) => {
      const normalized = saved.map((conversation) => {
        const mode = normalizedMode(conversation.mode)
        return { ...conversation, mode, ...modeConstraints(mode) }
      })
      setConversations(normalized)
      setActiveConversationId(normalized[0]?.id ?? null)
      if (normalized[0]?.mode === 'research') selectCategory(researchCategory)
      setIsLoaded(true)
    })
  }, [selectCategory])

  useEffect(() => {
    if (!isLoaded) return
    void window.context.saveAssistantConversations(conversations)
  }, [conversations, isLoaded])

  useEffect(() => window.context.onAssistantStreamEvent((event) => {
    if (event.requestId !== requestIdRef.current) return
    if (event.type === 'token') {
      setConversations((previous) => previous.map((conversation) => conversation.id !== requestConversationIdRef.current ? conversation : {
        ...conversation, updatedAt: Date.now(), messages: conversation.messages.map((message, index) => index === conversation.messages.length - 1 ? { ...message, text: message.text + event.text } : message)
      }))
      return
    }
    if (event.type === 'done') {
      const completedAttachedBlockIds = requestAttachedBlockIdsRef.current
      setConversations((previous) => previous.map((conversation) => conversation.id !== requestConversationIdRef.current ? conversation : {
        ...conversation,
        updatedAt: Date.now(),
        readGoalLabels: event.readGoalLabels,
        messages: conversation.messages.map((message, index) => {
          if (index !== conversation.messages.length - 1) return message
          const citedBlockIds = citationIds(message.text).filter((id) => event.citedBlockIds.includes(id))
          return {
            ...message,
            text: withoutLeadingDisclosure(message.text),
            citedBlockIds,
            citedBlockCategoryIds: Object.fromEntries(citedBlockIds.map((id) => [id, event.citedBlockCategoryIds[id] ?? null])),
            readGoalLabels: event.readGoalLabels
          }
        })
      }))
      requestIdRef.current = null
      requestConversationIdRef.current = null
      requestAttachedBlockIdsRef.current = []
      const nextAttachedBlockIds = attachedBlockIdsRef.current.filter(
        (id) => !completedAttachedBlockIds.includes(id)
      )
      attachedBlockIdsRef.current = nextAttachedBlockIds
      setAttachedBlockIds(nextAttachedBlockIds)
      setIsStreaming(false)
      return
    }
    requestIdRef.current = null
    requestConversationIdRef.current = null
    requestAttachedBlockIdsRef.current = []
    setIsStreaming(false)
    setError(t('assistant.error.reach'))
  }), [t])

  const ensureOpen = useCallback(() => { if (!isRightPanelOpen) toggleRightPanel() }, [isRightPanelOpen, toggleRightPanel])

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId)
  const preferences = preferencesFor(activeConversation, pendingPreferences, settings.llm.provider, settings.llm.model)

  const updatePreferences = useCallback((patch: Partial<ConversationPreferences>): void => {
    const conversationId = activeConversationIdRef.current
    if (conversationId === null) {
      setPendingPreferences((previous) => ({ ...previous, ...patch }))
      return
    }
    setConversations((previous) => previous.map((conversation) => conversation.id === conversationId ? { ...conversation, ...patch } : conversation))
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return
    const dates = scopeDates(preferences)
    if (!dates) {
      setError(t('assistant.error.dates'))
      return
    }
    ensureOpen()
    setError(null)
    const requestAttachedBlockIds = [...attachedBlockIdsRef.current]
    requestAttachedBlockIdsRef.current = requestAttachedBlockIds
    const requestId = crypto.randomUUID()
    requestIdRef.current = requestId
    const userMessage: AssistantMessage = { id: crypto.randomUUID(), role: 'user', text: trimmed, createdAt: Date.now(), provider: preferences.provider, model: preferences.model }
    const assistantMessage: AssistantMessage = { id: crypto.randomUUID(), role: 'assistant', text: '', createdAt: Date.now(), provider: preferences.provider, model: preferences.model }
    const existing = activeConversation
    const newConversation = existing ?? createConversation(preferences, t('assistant.newConversation'))
    const conversationId = newConversation.id
    requestConversationIdRef.current = conversationId
    const history: LlmMessage[] = newConversation.messages.map((message) => ({ role: message.role, content: message.text })).filter((message) => message.content)
    setConversations((previous) => {
      const conversation = previous.find((item) => item.id === conversationId) ?? newConversation
      const next = {
        ...conversation,
        ...preferences,
        title: conversation.messages.length === 0 ? trimmed.slice(0, 48) : conversation.title,
        updatedAt: Date.now(),
        messages: [...conversation.messages, userMessage, assistantMessage]
      }
      return [next, ...previous.filter((item) => item.id !== next.id)].slice(0, 25)
    })
    if (!activeConversationId) setActiveConversationId(conversationId)
    setIsStreaming(true)
    const selection: AssistantModelSelection = { provider: preferences.provider, model: preferences.model }
    let response: Awaited<ReturnType<typeof window.context.startAssistantStream>>
    try {
      response = await window.context.startAssistantStream(requestId, trimmed, history, {
        mode: preferences.mode,
        goalMode: preferences.goalMode,
        openGoalId: preferences.mode === 'research' ? researchCategory : selectedCategory,
        ...(requestAttachedBlockIds.length > 0 ? { attachedBlockIds: requestAttachedBlockIds } : {}),
        ...dates
      }, selection)
    } catch {
      requestIdRef.current = null
      requestConversationIdRef.current = null
      requestAttachedBlockIdsRef.current = []
      setIsStreaming(false)
      setError(t('assistant.error.reach'))
      return
    }
    if (!response.ok) {
      requestIdRef.current = null
      requestConversationIdRef.current = null
      requestAttachedBlockIdsRef.current = []
      setIsStreaming(false)
      setError(t('assistant.error.start'))
      return
    }
  }, [activeConversation, activeConversationId, ensureOpen, isStreaming, preferences, selectedCategory, t])

  const cancel = useCallback(() => {
    if (!requestIdRef.current) return
    void window.context.cancelAssistantStream(requestIdRef.current)
    requestIdRef.current = null
    requestConversationIdRef.current = null
    requestAttachedBlockIdsRef.current = []
    setIsStreaming(false)
  }, [])
  const newConversation = useCallback(() => {
    setActiveConversationId(null)
    setPendingPreferences(defaultPreferences(settings.llm.provider, settings.llm.model))
    setError(null)
    ensureOpen()
  }, [ensureOpen, settings.llm.model, settings.llm.provider])
  const selectConversation = useCallback((id: string) => {
    const conversation = conversationsRef.current.find((item) => item.id === id)
    const mode = normalizedMode(conversation?.mode)
    if (conversation) {
      const constraints = modeConstraints(mode)
      setConversations((previous) => previous.map((item) => item.id === id ? { ...item, mode, ...constraints } : item))
      if (mode === 'research') selectCategory(researchCategory)
    }
    setActiveConversationId(id || null)
    setError(null)
    ensureOpen()
  }, [ensureOpen, selectCategory])
  const continueWithText = useCallback((text: string) => { ensureOpen(); setDraft(text) }, [ensureOpen])
  const appendToDraft = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    ensureOpen()
    setDraft((previous) => previous.trim() ? `${previous.trimEnd()}\n\n${trimmed}` : trimmed)
  }, [ensureOpen])
  const attachBlock = useCallback((blockId: string) => {
    ensureOpen()
    if (attachedBlockIdsRef.current.includes(blockId)) return
    const next = [...attachedBlockIdsRef.current, blockId]
    attachedBlockIdsRef.current = next
    setAttachedBlockIds(next)
  }, [ensureOpen])
  const removeAttachedBlock = useCallback((blockId: string) => {
    const next = attachedBlockIdsRef.current.filter((id) => id !== blockId)
    attachedBlockIdsRef.current = next
    setAttachedBlockIds(next)
  }, [])
  const setAssistantMode = useCallback((mode: AssistantMode) => {
    if (requestIdRef.current) return
    updatePreferences({ mode, ...modeConstraints(mode) })
    if (mode === 'research') selectCategory(researchCategory)
  }, [selectCategory, updatePreferences])
  const setGoalMode = useCallback((goalMode: AssistantGoalMode) => updatePreferences({ goalMode }), [updatePreferences])
  const setTimeRange = useCallback((timeRange: AssistantTimeRange) => updatePreferences({ timeRange }), [updatePreferences])
  const setCustomDateRange = useCallback((customStartDate: string, customEndDate: string) => updatePreferences({ customStartDate, customEndDate }), [updatePreferences])
  const setConversationModel = useCallback((selection: AssistantModelSelection | null) => {
    updatePreferences(selection
      ? { provider: selection.provider, model: selection.model, usesDefaultModel: false }
      : { provider: settings.llm.provider, model: settings.llm.model, usesDefaultModel: true })
  }, [settings.llm.model, settings.llm.provider, updatePreferences])

  const stateValue: AssistantState = useMemo(() => ({
    conversations,
    activeConversationId,
    isStreaming,
    error,
    assistantMode: preferences.mode,
    goalMode: preferences.goalMode,
    timeRange: preferences.timeRange,
    customStartDate: preferences.customStartDate,
    customEndDate: preferences.customEndDate,
    conversationProvider: preferences.provider,
    conversationModel: preferences.model,
    usesDefaultModel: preferences.usesDefaultModel,
    draft,
    attachedBlockIds
  }), [conversations, activeConversationId, isStreaming, error, preferences, draft, attachedBlockIds])
  const actionsValue: AssistantActions = useMemo(() => ({
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
    attachBlock,
    removeAttachedBlock,
    continueWithText
  }), [sendMessage, cancel, newConversation, selectConversation, setAssistantMode, setGoalMode, setTimeRange, setCustomDateRange, setConversationModel, appendToDraft, attachBlock, removeAttachedBlock, continueWithText])
  return <AssistantStateContext.Provider value={stateValue}><AssistantActionsContext.Provider value={actionsValue}>{children}</AssistantActionsContext.Provider></AssistantStateContext.Provider>
}

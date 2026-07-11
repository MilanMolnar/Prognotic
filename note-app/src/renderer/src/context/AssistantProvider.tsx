import { AssistantConversation, AssistantGoalMode, AssistantMessage, AssistantTimeRange, LlmProvider } from '@shared/models'
import { AssistantModelSelection, AssistantScope, LlmMessage } from '@shared/types'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGoals } from './GoalsContext'
import { usePanels, usePanelActions } from './PanelsContext'
import { useSettings } from './SettingsContext'
import { AssistantActions, AssistantActionsContext, AssistantState, AssistantStateContext } from './AssistantContext'

type ConversationPreferences = {
  goalMode: AssistantGoalMode
  timeRange: AssistantTimeRange
  customStartDate: string
  customEndDate: string
  provider: LlmProvider
  model: string
  usesDefaultModel: boolean
}

const defaultPreferences = (provider: LlmProvider, model: string): ConversationPreferences => ({
  goalMode: 'open',
  timeRange: 'today',
  customStartDate: '',
  customEndDate: '',
  provider,
  model,
  usesDefaultModel: true
})

const preferencesFor = (
  conversation: AssistantConversation | undefined,
  pending: ConversationPreferences,
  defaultProvider: LlmProvider,
  defaultModel: string
): ConversationPreferences => {
  if (!conversation) {
    return pending.usesDefaultModel ? { ...pending, provider: defaultProvider, model: defaultModel } : pending
  }
  const usesDefaultModel = conversation.usesDefaultModel !== false
  return {
    goalMode: conversation.goalMode ?? 'open',
    timeRange: conversation.timeRange ?? 'today',
    customStartDate: conversation.customStartDate ?? '',
    customEndDate: conversation.customEndDate ?? '',
    provider: usesDefaultModel ? defaultProvider : (conversation.provider ?? defaultProvider),
    model: usesDefaultModel ? defaultModel : (conversation.model ?? defaultModel),
    usesDefaultModel
  }
}

const createConversation = (preferences: ConversationPreferences): AssistantConversation => {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    title: 'New conversation',
    createdAt: now,
    updatedAt: now,
    messages: [],
    ...preferences
  }
}

const citationIds = (text: string): string[] => [...text.matchAll(/\[block:([\w-]+)]/g)].map((match) => match[1])

const withoutLeadingDisclosure = (text: string): string =>
  text.replace(/^\s*(?:\*\*)?Read notes from:\s*[^\r\n]*(?:\*\*)?\s*(?:\r?\n)*/i, '')

const scopeDates = (preferences: ConversationPreferences): Pick<AssistantScope, 'from' | 'to'> | null => {
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
  const { selectedCategory } = useGoals()
  const [conversations, setConversations] = useState<AssistantConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [pendingPreferences, setPendingPreferences] = useState<ConversationPreferences>(() => defaultPreferences(settings.llm.provider, settings.llm.model))
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [isLoaded, setIsLoaded] = useState(false)
  const requestIdRef = useRef<string | null>(null)
  const requestConversationIdRef = useRef<string | null>(null)
  const activeConversationIdRef = useRef(activeConversationId)
  const { isRightPanelOpen } = usePanels()
  const { toggleRightPanel } = usePanelActions()

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

  useEffect(() => {
    void window.context.getAssistantConversations().then((saved) => {
      setConversations(saved)
      setActiveConversationId(saved[0]?.id ?? null)
      setIsLoaded(true)
    })
  }, [])

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
      setConversations((previous) => previous.map((conversation) => conversation.id !== requestConversationIdRef.current ? conversation : {
        ...conversation,
        updatedAt: Date.now(),
        readGoalLabels: event.readGoalLabels,
        messages: conversation.messages.map((message, index) => index === conversation.messages.length - 1 ? {
          ...message,
          text: withoutLeadingDisclosure(message.text),
          citedBlockIds: citationIds(message.text).filter((id) => event.citedBlockIds.includes(id)),
          readGoalLabels: event.readGoalLabels
        } : message)
      }))
      requestIdRef.current = null
      requestConversationIdRef.current = null
      setIsStreaming(false)
      return
    }
    requestIdRef.current = null
    requestConversationIdRef.current = null
    setIsStreaming(false)
    setError(event.message)
  }), [])

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
      setError('Choose a valid custom start and end date before sending.')
      return
    }
    ensureOpen()
    setError(null)
    const requestId = crypto.randomUUID()
    requestIdRef.current = requestId
    const userMessage: AssistantMessage = { id: crypto.randomUUID(), role: 'user', text: trimmed, createdAt: Date.now(), provider: preferences.provider, model: preferences.model }
    const assistantMessage: AssistantMessage = { id: crypto.randomUUID(), role: 'assistant', text: '', createdAt: Date.now(), provider: preferences.provider, model: preferences.model }
    const existing = activeConversation
    const newConversation = existing ?? createConversation(preferences)
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
    const response = await window.context.startAssistantStream(requestId, trimmed, history, {
      goalMode: preferences.goalMode,
      openGoalId: selectedCategory,
      ...dates
    }, selection)
    if (!response.ok) {
      requestIdRef.current = null
      requestConversationIdRef.current = null
      setIsStreaming(false)
      setError(response.error ?? 'Could not start the assistant.')
    }
  }, [activeConversation, activeConversationId, ensureOpen, isStreaming, preferences, selectedCategory])

  const cancel = useCallback(() => {
    if (!requestIdRef.current) return
    void window.context.cancelAssistantStream(requestIdRef.current)
    requestIdRef.current = null
    requestConversationIdRef.current = null
    setIsStreaming(false)
  }, [])
  const newConversation = useCallback(() => {
    setActiveConversationId(null)
    setPendingPreferences(defaultPreferences(settings.llm.provider, settings.llm.model))
    setError(null)
    ensureOpen()
  }, [ensureOpen, settings.llm.model, settings.llm.provider])
  const selectConversation = useCallback((id: string) => { setActiveConversationId(id || null); setError(null); ensureOpen() }, [ensureOpen])
  const continueWithText = useCallback((text: string) => { ensureOpen(); setDraft(text) }, [ensureOpen])
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
    goalMode: preferences.goalMode,
    timeRange: preferences.timeRange,
    customStartDate: preferences.customStartDate,
    customEndDate: preferences.customEndDate,
    conversationProvider: preferences.provider,
    conversationModel: preferences.model,
    usesDefaultModel: preferences.usesDefaultModel,
    draft
  }), [conversations, activeConversationId, isStreaming, error, preferences, draft])
  const actionsValue: AssistantActions = useMemo(() => ({
    sendMessage,
    cancel,
    newConversation,
    selectConversation,
    setGoalMode,
    setTimeRange,
    setCustomDateRange,
    setConversationModel,
    setDraft,
    continueWithText
  }), [sendMessage, cancel, newConversation, selectConversation, setGoalMode, setTimeRange, setCustomDateRange, setConversationModel, continueWithText])
  return <AssistantStateContext.Provider value={stateValue}><AssistantActionsContext.Provider value={actionsValue}>{children}</AssistantActionsContext.Provider></AssistantStateContext.Provider>
}

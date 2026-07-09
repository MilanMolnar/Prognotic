import { AssistantConversation, AssistantMessage } from '@shared/models'
import { LlmMessage } from '@shared/types'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePanels, usePanelActions } from './PanelsContext'
import { AssistantActions, AssistantActionsContext, AssistantState, AssistantStateContext } from './AssistantContext'

const createConversation = (): AssistantConversation => {
  const now = Date.now()
  return { id: crypto.randomUUID(), title: 'New conversation', createdAt: now, updatedAt: now, messages: [] }
}

const citationIds = (text: string): string[] => [...text.matchAll(/\[block:([\w-]+)]/g)].map((match) => match[1])

export const AssistantProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
  const [conversations, setConversations] = useState<AssistantConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scopeGoalId, setScopeGoalId] = useState<string | null | undefined>(undefined)
  const [scopeDateRange, setScopeDateRange] = useState<'all' | 'week'>('all')
  const [draft, setDraft] = useState('')
  const [isLoaded, setIsLoaded] = useState(false)
  const requestIdRef = useRef<string | null>(null)
  const requestConversationIdRef = useRef<string | null>(null)
  const { isRightPanelOpen } = usePanels()
  const { toggleRightPanel } = usePanelActions()

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
        ...conversation, updatedAt: Date.now(), messages: conversation.messages.map((message, index) => index === conversation.messages.length - 1 ? { ...message, citedBlockIds: citationIds(message.text).filter((id) => event.citedBlockIds.includes(id)) } : message)
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

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return
    ensureOpen()
    setError(null)
    const requestId = crypto.randomUUID()
    requestIdRef.current = requestId
    const userMessage: AssistantMessage = { id: crypto.randomUUID(), role: 'user', text: trimmed, createdAt: Date.now() }
    const assistantMessage: AssistantMessage = { id: crypto.randomUUID(), role: 'assistant', text: '', createdAt: Date.now() }
    const existing = conversations.find((conversation) => conversation.id === activeConversationId)
    const newConversation = existing ?? createConversation()
    const conversationId = newConversation.id
    requestConversationIdRef.current = conversationId
    const history: LlmMessage[] = newConversation.messages.map((message) => ({ role: message.role, content: message.text })).filter((message) => message.content)
    setConversations((previous) => {
      const conversation = previous.find((item) => item.id === conversationId) ?? newConversation
      const next = { ...conversation, title: conversation.messages.length === 0 ? trimmed.slice(0, 48) : conversation.title, updatedAt: Date.now(), messages: [...conversation.messages, userMessage, assistantMessage] }
      return [next, ...previous.filter((item) => item.id !== next.id)].slice(0, 25)
    })
    if (!activeConversationId) setActiveConversationId(conversationId)
    setIsStreaming(true)
    const response = await window.context.startAssistantStream(requestId, trimmed, history, {
      ...(scopeGoalId !== undefined ? { goalId: scopeGoalId } : {}),
      ...(scopeDateRange === 'week' ? { from: Date.now() - 7 * 24 * 60 * 60 * 1000 } : {})
    })
    if (!response.ok) { requestIdRef.current = null; requestConversationIdRef.current = null; setIsStreaming(false); setError(response.error ?? 'Could not start the assistant.') }
  }, [activeConversationId, conversations, ensureOpen, isStreaming, scopeDateRange, scopeGoalId])

  const cancel = useCallback(() => {
    if (!requestIdRef.current) return
    void window.context.cancelAssistantStream(requestIdRef.current)
    requestIdRef.current = null
    requestConversationIdRef.current = null
    setIsStreaming(false)
  }, [])
  const newConversation = useCallback(() => { setActiveConversationId(null); setError(null); ensureOpen() }, [ensureOpen])
  const selectConversation = useCallback((id: string) => { setActiveConversationId(id); ensureOpen() }, [ensureOpen])
  const continueWithText = useCallback((text: string) => { ensureOpen(); setDraft(text) }, [ensureOpen])

  const stateValue: AssistantState = useMemo(() => ({ conversations, activeConversationId, isStreaming, error, scopeGoalId, scopeDateRange, draft }), [conversations, activeConversationId, isStreaming, error, scopeGoalId, scopeDateRange, draft])
  const actionsValue: AssistantActions = useMemo(() => ({ sendMessage, cancel, newConversation, selectConversation, setScopeGoalId, setScopeDateRange, setDraft, continueWithText }), [sendMessage, cancel, newConversation, selectConversation, continueWithText])
  return <AssistantStateContext.Provider value={stateValue}><AssistantActionsContext.Provider value={actionsValue}>{children}</AssistantActionsContext.Provider></AssistantStateContext.Provider>
}

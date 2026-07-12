import { AssistantConversation, AssistantGoalMode, AssistantMessage, AssistantMode, AssistantTimeRange, LlmProvider } from '@shared/models'
import { AssistantModelSelection } from '@shared/types'
import { createContext, useContext } from 'react'

export type AssistantState = {
  conversations: AssistantConversation[]
  activeConversationId: string | null
  isStreaming: boolean
  error: string | null
  assistantMode: AssistantMode
  goalMode: AssistantGoalMode
  timeRange: AssistantTimeRange
  customStartDate: string
  customEndDate: string
  conversationProvider: LlmProvider
  conversationModel: string
  usesDefaultModel: boolean
  draft: string
  attachedBlockIds: string[]
}

export type AssistantActions = {
  sendMessage: (text: string) => Promise<void>
  cancel: () => void
  newConversation: () => void
  selectConversation: (id: string) => void
  setAssistantMode: (mode: AssistantMode) => void
  setGoalMode: (mode: AssistantGoalMode) => void
  setTimeRange: (range: AssistantTimeRange) => void
  setCustomDateRange: (startDate: string, endDate: string) => void
  setConversationModel: (selection: AssistantModelSelection | null) => void
  setDraft: (draft: string) => void
  appendToDraft: (text: string) => void
  attachBlock: (blockId: string) => void
  removeAttachedBlock: (blockId: string) => void
  continueWithText: (text: string) => void
}

export const AssistantStateContext = createContext<AssistantState | null>(null)
export const AssistantActionsContext = createContext<AssistantActions | null>(null)

export const useAssistant = (): AssistantState => {
  const state = useContext(AssistantStateContext)
  if (!state) throw new Error('useAssistant must be used within an AssistantProvider')
  return state
}

export const useAssistantActions = (): AssistantActions => {
  const actions = useContext(AssistantActionsContext)
  if (!actions) throw new Error('useAssistantActions must be used within an AssistantProvider')
  return actions
}

export type { AssistantConversation, AssistantMessage }

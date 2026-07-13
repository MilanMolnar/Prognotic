import type { AppSettings, BlockMeta, Goal, LlmProvider } from '@shared/models'

export type AiSetupChoice = 'yes' | 'no' | null
export type TourPlacement = 'top' | 'bottom' | 'left' | 'right'

export type TourBranchState = {
  aiSetupChoice: AiSetupChoice
  selectedProvider: LlmProvider
  hasVisionModel: boolean
  tourStartedAt: number
}

export type TourRuntimeContext = TourBranchState & {
  settings: AppSettings
  goals: readonly Goal[]
  blocks: readonly BlockMeta[]
  selectedCategory: string | null
  workGoalId: string | null
  aiVerified: boolean
  imageRecognitionReady: boolean
}

export type TourControls = {
  ensureLeftPanelOpen: () => void
  ensureRightPanelOpen: () => void
  selectCategory: (category: string | null) => void
  clearSelectedBlock: () => void
  openGoalDialog: () => void
  closeGoalDialog: () => void
  openSettingsModal: () => void
  closeSettingsModal: () => void
  closePluginManager: () => void
}

export type TourTarget =
  | string
  | readonly string[]
  | ((context: TourRuntimeContext) => string | readonly string[] | null)

export type TourCopy = string | ((context: TourRuntimeContext) => string)

export type TourChoice = {
  id: string
  label: string
  branch: Partial<Pick<TourBranchState, 'aiSetupChoice'>>
  tone?: 'primary' | 'secondary'
}

export type TourExternalLink = {
  label: string
  href: string
}

export type TourStep = {
  id: string
  section: string
  title?: TourCopy
  body: TourCopy
  target?: TourTarget
  placement: TourPlacement
  arrow: boolean
  advance: 'next' | 'click-target' | 'event'
  event?: string
  when?: (context: TourRuntimeContext) => boolean
  skip?: (context: TourRuntimeContext) => boolean
  highlight?: number | false
  interactive?: (context: TourRuntimeContext) => boolean
  autoAdvanceWhenSatisfied?: boolean
  onEnter?: (controls: TourControls, context: TourRuntimeContext) => void
  onExit?: (controls: TourControls, context: TourRuntimeContext) => void
  choices?: readonly TourChoice[]
  secondaryActions?: readonly TourChoice[]
  externalLink?: TourExternalLink | ((context: TourRuntimeContext) => TourExternalLink)
  primaryLabel?: string
  allowBack?: boolean
  continueAfterMs?: number
}

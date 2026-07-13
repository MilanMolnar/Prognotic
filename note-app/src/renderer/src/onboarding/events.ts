import type { LlmProvider } from '@shared/models'

export const onboardingEvents = {
  settingsSaved: 'prognotic:onboarding-settings-saved',
  providerChanged: 'prognotic:onboarding-provider-changed',
  visionModelChanged: 'prognotic:onboarding-vision-model-changed',
  blockContextMenuOpened: 'prognotic:onboarding-block-context-menu-opened',
  blockSentToResearch: 'prognotic:onboarding-block-sent-to-research',
  blockDroppedToQuickNotes: 'prognotic:onboarding-block-dropped-to-quick-notes',
  blockMoveChoiceCompleted: 'prognotic:onboarding-block-move-choice-completed',
  blockAttachedToAssistant: 'prognotic:onboarding-block-attached-to-assistant',
  openGoalDialog: 'prognotic:onboarding-open-goal-dialog',
  closeGoalDialog: 'prognotic:onboarding-close-goal-dialog',
  openSettingsModal: 'prognotic:onboarding-open-settings-modal',
  closeSettingsModal: 'prognotic:onboarding-close-settings-modal',
  closePluginManager: 'prognotic:onboarding-close-plugin-manager'
} as const

export const dispatchOnboardingEvent = (
  event: string,
  detail?: { provider?: LlmProvider; hasVisionModel?: boolean; blockId?: string }
): void => {
  window.dispatchEvent(new CustomEvent(event, { detail }))
}

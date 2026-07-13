import type { LlmProvider } from '@shared/models'

export const onboardingEvents = {
  settingsSaved: 'prognotic:onboarding-settings-saved',
  providerChanged: 'prognotic:onboarding-provider-changed',
  visionModelChanged: 'prognotic:onboarding-vision-model-changed',
  openGoalDialog: 'prognotic:onboarding-open-goal-dialog',
  closeGoalDialog: 'prognotic:onboarding-close-goal-dialog',
  openSettingsModal: 'prognotic:onboarding-open-settings-modal',
  closeSettingsModal: 'prognotic:onboarding-close-settings-modal',
  closePluginManager: 'prognotic:onboarding-close-plugin-manager'
} as const

export const dispatchOnboardingEvent = (
  event: string,
  detail?: { provider?: LlmProvider; hasVisionModel?: boolean }
): void => {
  window.dispatchEvent(new CustomEvent(event, { detail }))
}

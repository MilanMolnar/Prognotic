import { createContext, useContext } from 'react'
import type { TourRuntimeContext, TourStep } from '@renderer/onboarding/types'

export type OnboardingPhase = 'loading' | 'hidden' | 'greeting' | 'tour'

export type OnboardingState = {
  phase: OnboardingPhase
  currentStep: TourStep | null
  runtime: TourRuntimeContext
  stepNumber: number
  totalSteps: number
  canGoBack: boolean
  gateSatisfied: boolean
  canContinueAnyway: boolean
  persistenceError: string | null
}

export type OnboardingActions = {
  startTour: () => void
  skipTour: () => Promise<void>
  nextStep: () => void
  previousStep: () => void
  continueAnyway: () => void
  choose: (choiceId: string) => void
}

export const OnboardingStateContext = createContext<OnboardingState | null>(null)
export const OnboardingActionsContext = createContext<OnboardingActions | null>(null)

export const useOnboarding = (): OnboardingState => {
  const state = useContext(OnboardingStateContext)
  if (!state) throw new Error('useOnboarding must be used within an OnboardingProvider')
  return state
}

export const useOnboardingActions = (): OnboardingActions => {
  const actions = useContext(OnboardingActionsContext)
  if (!actions) {
    throw new Error('useOnboardingActions must be used within an OnboardingProvider')
  }
  return actions
}

import { isImageRecognitionReady, isLlmSelectionVerified } from '@shared/llmSettings'
import type { Goal, LlmProvider, LlmSettings } from '@shared/models'
import type {
  TourBranchState,
  TourCopy,
  TourRuntimeContext,
  TourStep,
  TourTarget
} from './types'

export const normalizedGoalName = (name: string): string => name.trim().toLocaleLowerCase()

export const findWorkGoal = (goals: readonly Goal[]): Goal | undefined =>
  goals.find((goal) => normalizedGoalName(goal.name) === 'work')

export const resolveTourConnectionState = (
  llm: LlmSettings,
  selectedProvider: LlmProvider
): Pick<TourRuntimeContext, 'aiVerified' | 'imageRecognitionReady'> => ({
  aiVerified: selectedProvider === llm.provider && isLlmSelectionVerified(llm),
  imageRecognitionReady: selectedProvider === llm.provider && isImageRecognitionReady(llm)
})

export const hasTourSampleBlock = (context: TourRuntimeContext): boolean =>
  context.blocks.some((block) =>
    (block.createdAt >= context.tourStartedAt || block.updatedAt >= context.tourStartedAt) &&
    block.excerpt.trim().length > 0 &&
    (context.workGoalId === null || block.categories.includes(context.workGoalId))
  )

export const isTourStepEligible = (
  step: TourStep,
  context: TourRuntimeContext
): boolean => (step.when?.(context) ?? true) && !(step.skip?.(context) ?? false)

export const resolveTourSteps = (
  steps: readonly TourStep[],
  context: TourRuntimeContext
): TourStep[] => steps.filter((step) => isTourStepEligible(step, context))

export const nextTourStep = (
  steps: readonly TourStep[],
  currentStepId: string,
  context: TourRuntimeContext
): TourStep | null => {
  const currentIndex = steps.findIndex((step) => step.id === currentStepId)
  if (currentIndex < 0) return resolveTourSteps(steps, context)[0] ?? null
  return steps.slice(currentIndex + 1).find((step) => isTourStepEligible(step, context)) ?? null
}

export const previousTourStep = (
  steps: readonly TourStep[],
  currentStepId: string,
  context: TourRuntimeContext
): TourStep | null => {
  const currentIndex = steps.findIndex((step) => step.id === currentStepId)
  if (currentIndex <= 0) return null
  return [...steps.slice(0, currentIndex)].reverse()
    .find((step) => isTourStepEligible(step, context)) ?? null
}

export const withTourBranch = (
  context: TourRuntimeContext,
  branch: TourBranchState
): TourRuntimeContext => ({ ...context, ...branch })

export const resolveTourCopy = (copy: TourCopy | undefined, context: TourRuntimeContext): string =>
  typeof copy === 'function' ? copy(context) : (copy ?? '')

const looksLikeSelector = (target: string): boolean =>
  target.startsWith('[') || target.startsWith('.') || target.startsWith('#')

export const tourTargetSelector = (target: string): string =>
  looksLikeSelector(target) ? target : `[data-tour="${target.replaceAll('"', '\\"')}"]`

export const resolveTourTargetSelectors = (
  target: TourTarget | undefined,
  context: TourRuntimeContext
): string[] => {
  const resolved = typeof target === 'function' ? target(context) : target
  if (resolved === null || resolved === undefined) return []
  const targets = typeof resolved === 'string' ? [resolved] : resolved
  return targets.map(tourTargetSelector)
}

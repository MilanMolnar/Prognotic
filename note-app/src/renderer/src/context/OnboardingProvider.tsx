import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { onboardingEvents, dispatchOnboardingEvent } from '@renderer/onboarding/events'
import {
  findWorkGoal,
  nextTourStep,
  previousTourStep,
  resolveTourConnectionState,
  resolveTourSteps,
  resolveTourTargetSelectors,
  withTourBranch
} from '@renderer/onboarding/tourLogic'
import { tourSteps } from '@renderer/onboarding/tourSteps'
import type { TourBranchState, TourControls, TourRuntimeContext } from '@renderer/onboarding/types'
import { useBlockActions, useBlocks } from './BlocksContext'
import { useGoalActions, useGoals } from './GoalsContext'
import {
  OnboardingActions,
  OnboardingActionsContext,
  OnboardingPhase,
  OnboardingState,
  OnboardingStateContext
} from './OnboardingContext'
import { usePanelActions, usePanels } from './PanelsContext'
import { useSettings, useSettingsActions } from './SettingsContext'

const defaultContinueDelay = 10_000

export const OnboardingProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
  const { settings, isLoaded } = useSettings()
  const { updateSettings } = useSettingsActions()
  const { goals, selectedCategory } = useGoals()
  const { selectCategory } = useGoalActions()
  const { blocks } = useBlocks()
  const { selectBlock } = useBlockActions()
  const { isLeftPanelOpen, isRightPanelOpen } = usePanels()
  const { toggleLeftPanel, toggleRightPanel } = usePanelActions()

  const [phase, setPhase] = useState<OnboardingPhase>('loading')
  const [currentStepId, setCurrentStepId] = useState<string | null>(null)
  const [branch, setBranch] = useState<TourBranchState>(() => ({
    aiSetupChoice: null,
    selectedProvider: settings.llm.provider,
    hasVisionModel: settings.llm.imageRecognitionModel.length > 0,
    tourStartedAt: Date.now()
  }))
  const [canContinueAnyway, setCanContinueAnyway] = useState(false)
  const [persistenceError, setPersistenceError] = useState<string | null>(null)

  const workGoalId = findWorkGoal(goals ?? [])?.id ?? null
  const runtime: TourRuntimeContext = useMemo(() => ({
    ...branch,
    ...resolveTourConnectionState(settings.llm, branch.selectedProvider),
    settings,
    goals: goals ?? [],
    blocks: blocks ?? [],
    selectedCategory,
    workGoalId
  }), [blocks, branch, goals, selectedCategory, settings, workGoalId])

  const currentStep = useMemo(
    () => tourSteps.find((step) => step.id === currentStepId) ?? null,
    [currentStepId]
  )
  const gateSatisfied = currentStep?.interactive?.(runtime) ?? true

  const controls: TourControls = useMemo(() => ({
    ensureLeftPanelOpen: () => {
      if (!isLeftPanelOpen) toggleLeftPanel()
    },
    ensureRightPanelOpen: () => {
      if (!isRightPanelOpen) toggleRightPanel()
    },
    selectCategory,
    clearSelectedBlock: () => selectBlock(null),
    openGoalDialog: () => dispatchOnboardingEvent(onboardingEvents.openGoalDialog),
    closeGoalDialog: () => dispatchOnboardingEvent(onboardingEvents.closeGoalDialog),
    openSettingsModal: () => dispatchOnboardingEvent(onboardingEvents.openSettingsModal),
    closeSettingsModal: () => dispatchOnboardingEvent(onboardingEvents.closeSettingsModal),
    closePluginManager: () => dispatchOnboardingEvent(onboardingEvents.closePluginManager)
  }), [isLeftPanelOpen, isRightPanelOpen, selectBlock, selectCategory, toggleLeftPanel, toggleRightPanel])

  const phaseRef = useRef(phase)
  const currentStepRef = useRef(currentStep)
  const runtimeRef = useRef(runtime)
  const branchRef = useRef(branch)
  const gateSatisfiedRef = useRef(gateSatisfied)
  const controlsRef = useRef(controls)
  const activeStepIdRef = useRef(currentStep?.id ?? null)
  useLayoutEffect(() => {
    phaseRef.current = phase
    currentStepRef.current = currentStep
    runtimeRef.current = runtime
    branchRef.current = branch
    gateSatisfiedRef.current = gateSatisfied
    controlsRef.current = controls
    activeStepIdRef.current = currentStep?.id ?? null
  }, [branch, controls, currentStep, gateSatisfied, phase, runtime])

  useEffect(() => {
    if (!isLoaded || goals === undefined || blocks === undefined || phase !== 'loading') return
    const frame = requestAnimationFrame(() => {
      setPhase(settings.onboardingCompleted || settings.onboardingSkipped ? 'hidden' : 'greeting')
    })
    return () => cancelAnimationFrame(frame)
  }, [blocks, goals, isLoaded, phase, settings.onboardingCompleted, settings.onboardingSkipped])

  useEffect(() => {
    if (phase !== 'tour') return
    const handleProviderChange = (event: Event): void => {
      const provider = (event as CustomEvent<{ provider?: TourBranchState['selectedProvider'] }>).detail?.provider
      if (provider) setBranch((previous) => ({ ...previous, selectedProvider: provider }))
    }
    const handleVisionModelChange = (event: Event): void => {
      const hasVisionModel = (event as CustomEvent<{ hasVisionModel?: boolean }>).detail?.hasVisionModel
      if (typeof hasVisionModel === 'boolean') {
        setBranch((previous) => ({ ...previous, hasVisionModel }))
      }
    }
    window.addEventListener(onboardingEvents.providerChanged, handleProviderChange)
    window.addEventListener(onboardingEvents.visionModelChanged, handleVisionModelChange)
    return () => {
      window.removeEventListener(onboardingEvents.providerChanged, handleProviderChange)
      window.removeEventListener(onboardingEvents.visionModelChanged, handleVisionModelChange)
    }
  }, [phase])

  const enteredStepRef = useRef<string | null>(null)
  useEffect(() => {
    if (phase !== 'tour' || !currentStep) {
      enteredStepRef.current = null
      return
    }
    if (enteredStepRef.current === currentStep.id) return
    enteredStepRef.current = currentStep.id
    currentStep.onEnter?.(controls, runtime)
  }, [controls, currentStep, phase, runtime])

  const leaveCurrentStep = useCallback((): void => {
    currentStepRef.current?.onExit?.(controlsRef.current, runtimeRef.current)
  }, [])

  const completeTour = useCallback(async (): Promise<void> => {
    setPersistenceError(null)
    try {
      await updateSettings({
        onboardingCompleted: true,
        onboardingSkipped: false,
        onboardingCompletedAt: Date.now()
      })
      setPhase('hidden')
      setCurrentStepId(null)
    } catch (error) {
      setPersistenceError(error instanceof Error ? error.message : 'Could not save tour completion.')
    }
  }, [updateSettings])

  const moveTo = useCallback((stepId: string): void => {
    leaveCurrentStep()
    setCanContinueAnyway(false)
    setCurrentStepId(stepId)
  }, [leaveCurrentStep])

  const moveForward = useCallback((gateTriggered: boolean): void => {
    const currentStep = currentStepRef.current
    if (!currentStep) return
    if (!gateTriggered && (currentStep.advance !== 'next' || !gateSatisfiedRef.current)) return
    const next = nextTourStep(tourSteps, currentStep.id, runtimeRef.current)
    if (next) moveTo(next.id)
    else {
      leaveCurrentStep()
      void completeTour()
    }
  }, [completeTour, leaveCurrentStep, moveTo])
  useEffect(() => {
    if (phase !== 'tour' || !currentStep || currentStep.advance !== 'click-target') return
    const selectors = resolveTourTargetSelectors(currentStep.target, runtime)
    if (selectors.length === 0) return
    const handleClick = (event: MouseEvent): void => {
      const origin = event.target instanceof Element ? event.target : null
      if (origin && selectors.some((selector) => origin.closest(selector))) moveForward(true)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [currentStep, moveForward, phase, runtime])

  useEffect(() => {
    if (phase !== 'tour' || !currentStep || currentStep.advance !== 'event' || !currentStep.event) return
    const handleEvent = (): void => moveForward(true)
    window.addEventListener(currentStep.event, handleEvent)
    return () => window.removeEventListener(currentStep.event as string, handleEvent)
  }, [currentStep, moveForward, phase])

  const gateTransitionRef = useRef<{ stepId: string | null; satisfied: boolean }>({
    stepId: null,
    satisfied: false
  })
  useEffect(() => {
    if (phase !== 'tour' || !currentStep) return
    const previous = gateTransitionRef.current
    if (previous.stepId !== currentStep.id) {
      gateTransitionRef.current = { stepId: currentStep.id, satisfied: gateSatisfied }
      return
    }
    gateTransitionRef.current = { stepId: currentStep.id, satisfied: gateSatisfied }
    if (currentStep.autoAdvanceWhenSatisfied && !previous.satisfied && gateSatisfied) {
      const satisfiedStepId = currentStep.id
      queueMicrotask(() => {
        if (activeStepIdRef.current === satisfiedStepId) moveForward(true)
      })
    }
  }, [currentStep, gateSatisfied, moveForward, phase])

  useEffect(() => {
    if (phase !== 'tour' || !currentStep) return
    const isBlocked = currentStep.advance !== 'next' ||
      (currentStep.interactive !== undefined && !gateSatisfied)
    if (!isBlocked) return
    const timer = window.setTimeout(
      () => setCanContinueAnyway(true),
      currentStep.continueAfterMs ?? defaultContinueDelay
    )
    return () => window.clearTimeout(timer)
  }, [currentStep, gateSatisfied, phase])

  const startTour = useCallback((): void => {
    const currentRuntime = runtimeRef.current
    const nextBranch: TourBranchState = {
      aiSetupChoice: null,
      selectedProvider: currentRuntime.settings.llm.provider,
      hasVisionModel: currentRuntime.settings.llm.imageRecognitionModel.length > 0,
      tourStartedAt: Date.now()
    }
    const nextRuntime = withTourBranch(currentRuntime, nextBranch)
    const firstStep = resolveTourSteps(tourSteps, nextRuntime)[0]
    if (!firstStep) return
    if (phaseRef.current === 'tour') leaveCurrentStep()
    setPersistenceError(null)
    setBranch(nextBranch)
    setCanContinueAnyway(false)
    setCurrentStepId(firstStep.id)
    setPhase('tour')
  }, [leaveCurrentStep])

  const skipTour = useCallback(async (): Promise<void> => {
    setPersistenceError(null)
    try {
      await updateSettings({
        onboardingCompleted: false,
        onboardingSkipped: true,
        onboardingCompletedAt: undefined
      })
      setPhase('hidden')
      setCurrentStepId(null)
    } catch (error) {
      setPersistenceError(error instanceof Error ? error.message : 'Could not save the tour preference.')
    }
  }, [updateSettings])

  const nextStep = useCallback((): void => moveForward(false), [moveForward])
  const continueAnyway = useCallback((): void => moveForward(true), [moveForward])

  const previousStep = useCallback((): void => {
    const currentStep = currentStepRef.current
    if (!currentStep || currentStep.allowBack === false) return
    const previous = previousTourStep(tourSteps, currentStep.id, runtimeRef.current)
    if (previous) moveTo(previous.id)
  }, [moveTo])

  const choose = useCallback((choiceId: string): void => {
    const currentStep = currentStepRef.current
    if (!currentStep) return
    const choice = [...(currentStep.choices ?? []), ...(currentStep.secondaryActions ?? [])]
      .find((item) => item.id === choiceId)
    if (!choice) return
    const nextBranch = { ...branchRef.current, ...choice.branch }
    const nextRuntime = withTourBranch(runtimeRef.current, nextBranch)
    const next = nextTourStep(tourSteps, currentStep.id, nextRuntime)
    setBranch(nextBranch)
    if (next) moveTo(next.id)
    else {
      leaveCurrentStep()
      void completeTour()
    }
  }, [completeTour, leaveCurrentStep, moveTo])

  const eligibleSteps = resolveTourSteps(tourSteps, runtime)
  const currentEligibleIndex = currentStep
    ? eligibleSteps.findIndex((step) => step.id === currentStep.id)
    : -1
  const canGoBack = currentStep?.allowBack !== false && currentStep !== null &&
    previousTourStep(tourSteps, currentStep.id, runtime) !== null

  const stateValue: OnboardingState = useMemo(() => ({
    phase,
    currentStep,
    runtime,
    stepNumber: currentEligibleIndex >= 0 ? currentEligibleIndex + 1 : 0,
    totalSteps: eligibleSteps.length,
    canGoBack,
    gateSatisfied,
    canContinueAnyway,
    persistenceError
  }), [
    canContinueAnyway,
    canGoBack,
    currentEligibleIndex,
    currentStep,
    eligibleSteps.length,
    gateSatisfied,
    persistenceError,
    phase,
    runtime
  ])

  const actionsValue: OnboardingActions = useMemo(() => ({
    startTour,
    skipTour,
    nextStep,
    previousStep,
    continueAnyway,
    choose
  }), [choose, continueAnyway, nextStep, previousStep, skipTour, startTour])

  return (
    <OnboardingStateContext.Provider value={stateValue}>
      <OnboardingActionsContext.Provider value={actionsValue}>
        {children}
      </OnboardingActionsContext.Provider>
    </OnboardingStateContext.Provider>
  )
}

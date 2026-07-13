import { defaultSettings } from '@shared/constants'
import type { BlockMeta, Goal } from '@shared/models'
import { describe, expect, it } from 'vitest'
import { tourSteps } from './tourSteps'
import {
  findWorkGoal,
  hasTourSampleBlock,
  nextTourStep,
  resolveTourConnectionState,
  resolveTourSteps,
  resolveTourTargetSelectors
} from './tourLogic'
import type { TourRuntimeContext } from './types'

const workGoal: Goal = {
  id: 'work-id',
  name: ' Work ',
  description: 'Work tasks',
  createdAt: 1
}

const runtime = (overrides: Partial<TourRuntimeContext> = {}): TourRuntimeContext => ({
  aiSetupChoice: null,
  selectedProvider: 'gemini',
  hasVisionModel: false,
  tourStartedAt: 1_000,
  settings: { ...defaultSettings, llm: { ...defaultSettings.llm } },
  goals: [],
  blocks: [],
  selectedCategory: null,
  workGoalId: null,
  aiVerified: false,
  imageRecognitionReady: false,
  ...overrides
})

const block = (overrides: Partial<BlockMeta> = {}): BlockMeta => ({
  id: 'block-id',
  file: 'block.md',
  createdAt: 1_100,
  updatedAt: 1_100,
  categories: ['work-id'],
  excerpt: 'Contact HR about PTO',
  ...overrides
})

describe('onboarding tour logic', () => {
  it('keeps declarative step ids unique', () => {
    const ids = tourSteps.map((step) => step.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('finds Work case-insensitively after trimming', () => {
    expect(findWorkGoal([workGoal])?.id).toBe('work-id')
    expect(findWorkGoal([{ ...workGoal, name: 'Workshop' }])).toBeUndefined()
  })

  it('resolves the AI branch without changing engine logic', () => {
    const skippedIds = resolveTourSteps(tourSteps, runtime({ aiSetupChoice: 'no' })).map((step) => step.id)
    expect(skippedIds).toContain('ai-mention')
    expect(skippedIds).not.toContain('ai-providers')

    const setupIds = resolveTourSteps(tourSteps, runtime({ aiSetupChoice: 'yes' })).map((step) => step.id)
    expect(setupIds).toContain('ai-providers')
    expect(setupIds).not.toContain('ai-mention')
  })

  it('invalidates verified shortcuts when the draft provider changes', () => {
    const llm = {
      ...defaultSettings.llm,
      model: 'gemini-test',
      imageRecognitionModel: 'gemini-vision-test',
      verifiedConnection: { provider: 'gemini' as const, model: 'gemini-test' },
      verifiedImageRecognitionConnection: {
        provider: 'gemini' as const,
        model: 'gemini-vision-test'
      }
    }

    expect(resolveTourConnectionState(llm, 'gemini')).toEqual({
      aiVerified: true,
      imageRecognitionReady: true
    })
    expect(resolveTourConnectionState(llm, 'openai')).toEqual({
      aiVerified: false,
      imageRecognitionReady: false
    })
  })

  it('skips credential/model steps for an already verified AI selection', () => {
    const ids = resolveTourSteps(tourSteps, runtime({
      aiSetupChoice: 'yes',
      aiVerified: true,
      hasVisionModel: true
    })).map((step) => step.id)
    expect(ids).toContain('ai-providers')
    expect(ids).not.toContain('ai-key-link')
    expect(ids).not.toContain('ai-credential')
    expect(ids).not.toContain('ai-refresh-models')
    expect(ids).not.toContain('ai-active-model')
    expect(ids).not.toContain('ai-test-connection')
    expect(ids).toContain('ai-test-image')
  })

  it('jumps from the branch choice to the first eligible path step', () => {
    expect(nextTourStep(tourSteps, 'settings-ai-choice', runtime({ aiSetupChoice: 'no' }))?.id)
      .toBe('ai-mention')
    expect(nextTourStep(tourSteps, 'settings-ai-choice', runtime({ aiSetupChoice: 'yes' }))?.id)
      .toBe('ai-providers')
  })

  it('detects a new or updated non-empty capture in Work', () => {
    const context = runtime({ workGoalId: 'work-id' })
    expect(hasTourSampleBlock({ ...context, blocks: [block()] })).toBe(true)
    expect(hasTourSampleBlock({
      ...context,
      blocks: [block({ createdAt: 100, updatedAt: 1_200 })]
    })).toBe(true)
    expect(hasTourSampleBlock({
      ...context,
      blocks: [block({ createdAt: 100, updatedAt: 100 })]
    })).toBe(false)
    expect(hasTourSampleBlock({
      ...context,
      blocks: [block({ categories: [null] })]
    })).toBe(false)
    expect(hasTourSampleBlock({
      ...context,
      blocks: [block({ excerpt: '   ' })]
    })).toBe(false)
  })

  it('resolves the Work creation and selection gates from runtime state', () => {
    const createWork = tourSteps.find((step) => step.id === 'goals-create-work')
    const selectWork = tourSteps.find((step) => step.id === 'work-select')

    expect(createWork?.interactive?.(runtime())).toBe(false)
    expect(createWork?.interactive?.(runtime({ workGoalId: 'work-id' }))).toBe(true)
    expect(selectWork?.interactive?.(runtime({ workGoalId: 'work-id' }))).toBe(false)
    expect(selectWork?.interactive?.(runtime({
      workGoalId: 'work-id',
      selectedCategory: 'work-id'
    }))).toBe(true)
  })

  it('finishes after the final eligible step', () => {
    expect(nextTourStep(tourSteps, 'complete', runtime({ aiSetupChoice: 'no' }))).toBeNull()
  })

  it('normalizes data-tour keys while preserving CSS selectors and fallback order', () => {
    expect(resolveTourTargetSelectors(['newest-block', '#fallback'], runtime())).toEqual([
      '[data-tour="newest-block"]',
      '#fallback'
    ])
  })
})

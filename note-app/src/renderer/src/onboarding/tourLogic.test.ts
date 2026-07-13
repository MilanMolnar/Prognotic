import { defaultSettings } from '@shared/constants'
import type { BlockMeta, Goal } from '@shared/models'
import { describe, expect, it } from 'vitest'
import { tourSteps } from './tourSteps'
import {
  findTourSampleBlock,
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

  it('keeps every setup explanation visible for an already verified AI selection', () => {
    const ids = resolveTourSteps(tourSteps, runtime({
      aiSetupChoice: 'yes',
      aiVerified: true,
      hasVisionModel: true
    })).map((step) => step.id)
    expect(ids).toEqual(expect.arrayContaining([
      'ai-providers',
      'ai-key-link',
      'ai-credential',
      'ai-refresh-models',
      'ai-active-model',
      'ai-test-connection',
      'ai-plugin-model',
      'ai-image-model'
    ]))
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

  it('keeps tracking the newest tour block after it moves between goals', () => {
    const context = runtime({
      workGoalId: 'work-id',
      blocks: [
        block({ id: 'older', updatedAt: 1_100 }),
        block({ id: 'sample', updatedAt: 1_300, categories: [null] })
      ]
    })

    expect(findTourSampleBlock(context)?.id).toBe('sample')
  })

  it('resolves the Work creation gate from runtime state', () => {
    const createWork = tourSteps.find((step) => step.id === 'goals-create-work')

    expect(createWork?.interactive?.(runtime())).toBe(false)
    expect(createWork?.interactive?.(runtime({ workGoalId: 'work-id' }))).toBe(true)
  })

  it('orders the requested plugin, capture, block, and assistant walkthrough', () => {
    const ids = resolveTourSteps(tourSteps, runtime({
      aiSetupChoice: 'yes',
      workGoalId: 'work-id'
    })).map((step) => step.id)
    const orderedIds = [
      'plugins-open',
      'plugins-dietary',
      'plugins-enable',
      'plugins-delete',
      'plugins-browse',
      'plugins-exit',
      'settings-save',
      'work-select',
      'capture-modes',
      'capture-dictation',
      'capture-image',
      'capture-document',
      'capture-sample',
      'capture-blocks',
      'block-context-menu',
      'block-send-research',
      'research-select',
      'block-drag-quick',
      'block-move-choice',
      'quick-notes-select',
      'block-drag-assistant',
      'assistant-overview',
      'complete'
    ]

    for (const id of orderedIds) expect(ids).toContain(id)
    for (let index = 1; index < orderedIds.length; index += 1) {
      expect(ids.indexOf(orderedIds[index])).toBeGreaterThan(ids.indexOf(orderedIds[index - 1]))
    }
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

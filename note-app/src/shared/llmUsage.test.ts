import { describe, expect, it } from 'vitest'
import { defaultLlmUsageThresholds } from './constants'
import { LlmUsageBudgetSettings } from './models'
import { applyUsage, calculateLlmUsageDisplayPercentage, calculateLlmUsagePercentage, estimateUsd, getLlmUsagePeriod, LlmUsageBucket, normalizeLlmUsageThresholds, selectLlmUsageThresholdLevel, summarizeLlmUsage, summarizeLlmUsagePeriod, usageBucketKey } from './llmUsage'

const usageBudget = (overrides: Partial<LlmUsageBudgetSettings> = {}): LlmUsageBudgetSettings => ({
    enabled: true,
    limitUsd: 5,
    resetInterval: 'monthly',
    resetDays: 14,
    thresholds: { ...defaultLlmUsageThresholds },
    periodStartedAt: new Date(2026, 0, 1).getTime(),
    ...overrides
})

describe('estimateUsd', () => {
    it('prices a known Anthropic model per million tokens', () => {
        // claude-opus-4-8: $5 input + $25 output per MTok
        expect(estimateUsd('anthropic', 'claude-opus-4-8', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(30, 10)
        expect(estimateUsd('anthropic', 'claude-opus-4-8', { inputTokens: 200_000, outputTokens: 40_000 })).toBeCloseTo(2, 10)
    })

    it('resolves dated model variants through prefix matching', () => {
        // claude-sonnet-4-5-20250929 → claude-sonnet family: $3 / $15
        expect(estimateUsd('anthropic', 'claude-sonnet-4-5-20250929', { inputTokens: 500_000, outputTokens: 100_000 })).toBeCloseTo(3, 10)
    })

    it('prefers the longest matching prefix', () => {
        // gpt-4o-mini must not resolve to the shorter gpt-4o entry
        expect(estimateUsd('openai', 'gpt-4o-mini-2024-07-18', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(0.75, 10)
        expect(estimateUsd('openai', 'gpt-4o-2024-08-06', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(12.5, 10)
    })

    it('normalizes Gemini resource names and casing', () => {
        expect(estimateUsd('gemini', 'models/Gemini-2.5-Flash', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(2.8, 10)
    })

    it('falls back to $0 for unknown models and the local provider', () => {
        expect(estimateUsd('openai', 'experimental-unpriced-model', { inputTokens: 5_000, outputTokens: 5_000 })).toBe(0)
        expect(estimateUsd('local', 'llama-3.1-8b-instruct', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(0)
    })
})

describe('applyUsage', () => {
    it('accumulates tokens, cost, and request count in one bucket per provider and model', () => {
        const buckets: Record<string, LlmUsageBucket> = {}
        applyUsage(buckets, 'anthropic', 'claude-opus-4-8', { inputTokens: 1_000_000, outputTokens: 0 })
        applyUsage(buckets, 'anthropic', 'Claude-Opus-4-8', { inputTokens: 0, outputTokens: 1_000_000 })

        const bucket = buckets[usageBucketKey('anthropic', 'claude-opus-4-8')]
        expect(Object.keys(buckets)).toHaveLength(1)
        expect(bucket.inputTokens).toBe(1_000_000)
        expect(bucket.outputTokens).toBe(1_000_000)
        expect(bucket.requestCount).toBe(2)
        expect(bucket.estimatedUsd).toBeCloseTo(30, 10)
    })

    it('keeps separate buckets per provider even for the same model id', () => {
        const buckets: Record<string, LlmUsageBucket> = {}
        applyUsage(buckets, 'openai', 'shared-model', { inputTokens: 10, outputTokens: 10 })
        applyUsage(buckets, 'local', 'shared-model', { inputTokens: 10, outputTokens: 10 })
        expect(Object.keys(buckets)).toHaveLength(2)
    })

    it('clamps invalid token counts to zero instead of corrupting totals', () => {
        const buckets: Record<string, LlmUsageBucket> = {}
        applyUsage(buckets, 'openai', 'gpt-4o', { inputTokens: Number.NaN, outputTokens: -50 })
        const bucket = buckets[usageBucketKey('openai', 'gpt-4o')]
        expect(bucket.inputTokens).toBe(0)
        expect(bucket.outputTokens).toBe(0)
        expect(bucket.estimatedUsd).toBe(0)
        expect(bucket.requestCount).toBe(1)
    })
})

describe('summarizeLlmUsage', () => {
    it('sorts buckets by estimated cost descending and totals match the sum', () => {
        const buckets: Record<string, LlmUsageBucket> = {}
        applyUsage(buckets, 'gemini', 'gemini-2.5-flash', { inputTokens: 1_000_000, outputTokens: 0 })   // $0.30
        applyUsage(buckets, 'anthropic', 'claude-opus-4-8', { inputTokens: 1_000_000, outputTokens: 0 }) // $5.00
        applyUsage(buckets, 'local', 'llama-3.1-8b-instruct', { inputTokens: 1_000_000, outputTokens: 0 }) // $0.00

        const summary = summarizeLlmUsage(buckets)
        expect(summary.buckets.map((bucket) => bucket.model)).toEqual([
            'claude-opus-4-8',
            'gemini-2.5-flash',
            'llama-3.1-8b-instruct'
        ])
        expect(summary.totalEstimatedUsd).toBeCloseTo(5.3, 10)
    })

    it('returns an empty summary for no recorded usage', () => {
        expect(summarizeLlmUsage({})).toEqual({ totalEstimatedUsd: 0, buckets: [] })
    })
})

describe('AI usage budget percentages and thresholds', () => {
    it('calculates the actual percentage and caps only the displayed arc at 100%', () => {
        expect(calculateLlmUsagePercentage(2.5, 5)).toBe(50)
        expect(calculateLlmUsagePercentage(6.25, 5)).toBe(125)
        expect(calculateLlmUsageDisplayPercentage(6.25, 5)).toBe(100)
        expect(calculateLlmUsagePercentage(5, 0)).toBe(0)
    })

    it('selects gray, yellow, red, and critical at the configured boundaries', () => {
        expect(selectLlmUsageThresholdLevel(49.99, defaultLlmUsageThresholds)).toBe('gray')
        expect(selectLlmUsageThresholdLevel(50, defaultLlmUsageThresholds)).toBe('yellow')
        expect(selectLlmUsageThresholdLevel(75, defaultLlmUsageThresholds)).toBe('red')
        expect(selectLlmUsageThresholdLevel(90, defaultLlmUsageThresholds)).toBe('critical')

        const custom = { yellow: 25, red: 60, critical: 80 }
        expect(selectLlmUsageThresholdLevel(25, custom)).toBe('yellow')
        expect(selectLlmUsageThresholdLevel(80, custom)).toBe('critical')
    })

    it('restores defaults when thresholds are out of order', () => {
        expect(normalizeLlmUsageThresholds({ yellow: 75, red: 50, critical: 90 }))
            .toEqual(defaultLlmUsageThresholds)
    })
})

describe('AI usage budget periods', () => {
    it('uses the all-time total for a forever period', () => {
        expect(summarizeLlmUsagePeriod(
            [{ recordedAt: Date.UTC(2026, 0, 1), estimatedUsd: 1 }],
            usageBudget({ resetInterval: 'forever' }),
            7.5,
            Date.UTC(2026, 6, 15)
        )).toEqual({ startedAt: 0, estimatedUsd: 7.5 })
    })

    it('uses local calendar month boundaries and rolls at the exact boundary', () => {
        const march = getLlmUsagePeriod(usageBudget(), new Date(2026, 2, 31, 23, 59, 59).getTime())
        expect(march).toEqual({
            startedAt: new Date(2026, 2, 1).getTime(),
            endsAt: new Date(2026, 3, 1).getTime()
        })

        const april = getLlmUsagePeriod(usageBudget(), march.endsAt)
        expect(april.startedAt).toBe(march.endsAt)
        expect(april.endsAt).toBe(new Date(2026, 4, 1).getTime())
    })

    it('uses local calendar year boundaries', () => {
        expect(getLlmUsagePeriod(
            usageBudget({ resetInterval: 'yearly' }),
            new Date(2026, 6, 15).getTime()
        )).toEqual({
            startedAt: new Date(2026, 0, 1).getTime(),
            endsAt: new Date(2027, 0, 1).getTime()
        })
    })

    it('rolls custom 14-day windows forward from their persisted anchor', () => {
        const anchor = Date.UTC(2026, 0, 1, 12)
        const duration = 14 * 24 * 60 * 60 * 1000
        const budget = usageBudget({ resetInterval: 'days', resetDays: 14, periodStartedAt: anchor })

        expect(getLlmUsagePeriod(budget, anchor + duration - 1)).toEqual({
            startedAt: anchor,
            endsAt: anchor + duration
        })
        expect(getLlmUsagePeriod(budget, anchor + duration)).toEqual({
            startedAt: anchor + duration,
            endsAt: anchor + duration * 2
        })
    })

    it('includes only ledger entries in the active non-forever period', () => {
        const now = new Date(2026, 3, 15).getTime()
        const summary = summarizeLlmUsagePeriod([
            { recordedAt: new Date(2026, 2, 31).getTime(), estimatedUsd: 1 },
            { recordedAt: new Date(2026, 3, 1).getTime(), estimatedUsd: 2 },
            { recordedAt: now, estimatedUsd: 3 }
        ], usageBudget(), 6, now)

        expect(summary.estimatedUsd).toBe(5)
    })
})

import { defaultLlmUsageThresholds } from './constants'
import { LlmProvider, LlmUsageBudgetSettings, LlmUsageThresholds } from './models'

export type LlmTokenUsage = {
    inputTokens: number
    outputTokens: number
}

// One all-time counter per provider+model pair, persisted in llm-usage.json.
export type LlmUsageBucket = {
    provider: LlmProvider
    model: string
    inputTokens: number
    outputTokens: number
    estimatedUsd: number
    requestCount: number
}

export type LlmUsageSummary = {
    totalEstimatedUsd: number
    // Sorted by estimated cost, highest first.
    buckets: LlmUsageBucket[]
    currentPeriod?: LlmUsagePeriodSummary
}

export type LlmUsageEntry = {
    recordedAt: number
    estimatedUsd: number
}

export type LlmUsagePeriod = {
    startedAt: number
    endsAt?: number
}

export type LlmUsagePeriodSummary = LlmUsagePeriod & {
    estimatedUsd: number
}

export type LlmUsageThresholdLevel = 'gray' | 'yellow' | 'red' | 'critical'

const dayMs = 24 * 60 * 60 * 1000
export const maxLlmUsageResetDays = Math.floor(Number.MAX_SAFE_INTEGER / dayMs)

export const normalizeLlmUsageThresholds = (
    thresholds: Partial<LlmUsageThresholds> | null | undefined
): LlmUsageThresholds => {
    const yellow = typeof thresholds?.yellow === 'number' && Number.isFinite(thresholds.yellow)
        ? Math.max(0, Math.min(100, Math.round(thresholds.yellow)))
        : defaultLlmUsageThresholds.yellow
    const red = typeof thresholds?.red === 'number' && Number.isFinite(thresholds.red)
        ? Math.max(0, Math.min(100, Math.round(thresholds.red)))
        : defaultLlmUsageThresholds.red
    const critical = typeof thresholds?.critical === 'number' && Number.isFinite(thresholds.critical)
        ? Math.max(0, Math.min(100, Math.round(thresholds.critical)))
        : defaultLlmUsageThresholds.critical

    return yellow < red && red < critical
        ? { yellow, red, critical }
        : { ...defaultLlmUsageThresholds }
}

export const calculateLlmUsagePercentage = (usedUsd: number, limitUsd: number): number => {
    if (!Number.isFinite(usedUsd) || !Number.isFinite(limitUsd) || limitUsd <= 0) return 0
    const percentage = Math.max(0, usedUsd) / limitUsd * 100
    return Number.isFinite(percentage) ? percentage : 100
}

export const calculateLlmUsageDisplayPercentage = (usedUsd: number, limitUsd: number): number =>
    Math.min(100, calculateLlmUsagePercentage(usedUsd, limitUsd))

export const selectLlmUsageThresholdLevel = (
    percentage: number,
    thresholds: LlmUsageThresholds
): LlmUsageThresholdLevel => {
    const normalized = normalizeLlmUsageThresholds(thresholds)
    if (percentage >= normalized.critical) return 'critical'
    if (percentage >= normalized.red) return 'red'
    if (percentage >= normalized.yellow) return 'yellow'
    return 'gray'
}

// Month and year periods follow the user's local calendar. Custom-day periods
// are fixed rolling N-day windows from their persisted anchor.
export const getLlmUsagePeriod = (
    budget: LlmUsageBudgetSettings,
    now = Date.now()
): LlmUsagePeriod => {
    if (budget.resetInterval === 'forever') return { startedAt: 0 }

    const current = new Date(now)
    if (budget.resetInterval === 'monthly') {
        return {
            startedAt: new Date(current.getFullYear(), current.getMonth(), 1).getTime(),
            endsAt: new Date(current.getFullYear(), current.getMonth() + 1, 1).getTime(),
        }
    }
    if (budget.resetInterval === 'yearly') {
        return {
            startedAt: new Date(current.getFullYear(), 0, 1).getTime(),
            endsAt: new Date(current.getFullYear() + 1, 0, 1).getTime(),
        }
    }

    const resetDays = Number.isFinite(budget.resetDays) && budget.resetDays > 0
        ? Math.min(maxLlmUsageResetDays, Math.round(budget.resetDays))
        : 1
    const duration = resetDays * dayMs
    const configuredAnchor = Number.isFinite(budget.periodStartedAt) && budget.periodStartedAt > 0
        ? budget.periodStartedAt
        : now
    const anchor = Math.min(configuredAnchor, now)
    const elapsedPeriods = Math.floor((now - anchor) / duration)
    const startedAt = anchor + elapsedPeriods * duration
    return { startedAt, endsAt: startedAt + duration }
}

export const summarizeLlmUsagePeriod = (
    entries: LlmUsageEntry[],
    budget: LlmUsageBudgetSettings,
    totalEstimatedUsd: number,
    now = Date.now()
): LlmUsagePeriodSummary => {
    const period = getLlmUsagePeriod(budget, now)
    const estimatedUsd = budget.resetInterval === 'forever'
        ? totalEstimatedUsd
        : entries.reduce((sum, entry) => entry.recordedAt >= period.startedAt && entry.recordedAt <= now
            ? sum + entry.estimatedUsd
            : sum, 0)
    return { ...period, estimatedUsd }
}

type ModelPricing = {
    inputUsdPerMTok: number
    outputUsdPerMTok: number
}

// USD per million tokens, matched by longest model-id prefix so dated
// variants (e.g. claude-sonnet-4-5-20250929, gpt-4o-2024-08-06) resolve to
// their family price. Unknown models fall back to $0 — token counts are
// still recorded, only the cost estimate stays at zero.
const pricingByProvider: Partial<Record<LlmProvider, Record<string, ModelPricing>>> = {
    anthropic: {
        'claude-fable-5': { inputUsdPerMTok: 10, outputUsdPerMTok: 50 },
        'claude-mythos-5': { inputUsdPerMTok: 10, outputUsdPerMTok: 50 },
        'claude-opus-4-1': { inputUsdPerMTok: 15, outputUsdPerMTok: 75 },
        'claude-opus-4-20': { inputUsdPerMTok: 15, outputUsdPerMTok: 75 },
        'claude-opus': { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
        'claude-sonnet': { inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
        'claude-haiku': { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
        'claude-3-7-sonnet': { inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
        'claude-3-5-sonnet': { inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
        'claude-3-5-haiku': { inputUsdPerMTok: 0.8, outputUsdPerMTok: 4 },
        'claude-3-haiku': { inputUsdPerMTok: 0.25, outputUsdPerMTok: 1.25 }
    },
    openai: {
        'gpt-5-pro': { inputUsdPerMTok: 15, outputUsdPerMTok: 120 },
        'gpt-5-mini': { inputUsdPerMTok: 0.25, outputUsdPerMTok: 2 },
        'gpt-5-nano': { inputUsdPerMTok: 0.05, outputUsdPerMTok: 0.4 },
        'gpt-5': { inputUsdPerMTok: 1.25, outputUsdPerMTok: 10 },
        'gpt-5.1': { inputUsdPerMTok: 1.25, outputUsdPerMTok: 10 },
        'gpt-4.1-mini': { inputUsdPerMTok: 0.4, outputUsdPerMTok: 1.6 },
        'gpt-4.1-nano': { inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.4 },
        'gpt-4.1': { inputUsdPerMTok: 2, outputUsdPerMTok: 8 },
        'gpt-4o-mini': { inputUsdPerMTok: 0.15, outputUsdPerMTok: 0.6 },
        'gpt-4o': { inputUsdPerMTok: 2.5, outputUsdPerMTok: 10 },
        'chatgpt-4o': { inputUsdPerMTok: 5, outputUsdPerMTok: 15 },
        'gpt-4-turbo': { inputUsdPerMTok: 10, outputUsdPerMTok: 30 },
        'gpt-4': { inputUsdPerMTok: 30, outputUsdPerMTok: 60 },
        'gpt-3.5-turbo': { inputUsdPerMTok: 0.5, outputUsdPerMTok: 1.5 },
        'o1-mini': { inputUsdPerMTok: 1.1, outputUsdPerMTok: 4.4 },
        'o1': { inputUsdPerMTok: 15, outputUsdPerMTok: 60 },
        'o3-mini': { inputUsdPerMTok: 1.1, outputUsdPerMTok: 4.4 },
        'o3-pro': { inputUsdPerMTok: 20, outputUsdPerMTok: 80 },
        'o3': { inputUsdPerMTok: 2, outputUsdPerMTok: 8 },
        'o4-mini': { inputUsdPerMTok: 1.1, outputUsdPerMTok: 4.4 }
    },
    gemini: {
        'gemini-3-pro': { inputUsdPerMTok: 2, outputUsdPerMTok: 12 },
        'gemini-2.5-pro': { inputUsdPerMTok: 1.25, outputUsdPerMTok: 10 },
        'gemini-2.5-flash-lite': { inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.4 },
        'gemini-2.5-flash': { inputUsdPerMTok: 0.3, outputUsdPerMTok: 2.5 },
        'gemini-2.0-flash-lite': { inputUsdPerMTok: 0.075, outputUsdPerMTok: 0.3 },
        'gemini-2.0-flash': { inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.4 },
        'gemini-1.5-pro': { inputUsdPerMTok: 1.25, outputUsdPerMTok: 5 },
        'gemini-1.5-flash-8b': { inputUsdPerMTok: 0.0375, outputUsdPerMTok: 0.15 },
        'gemini-1.5-flash': { inputUsdPerMTok: 0.075, outputUsdPerMTok: 0.3 }
    }
    // local: LM Studio runs on the user's machine — always $0.
}

const normalizeModelId = (model: string): string =>
    model.trim().toLowerCase().replace(/^models\//, '')

const pricingFor = (provider: LlmProvider, model: string): ModelPricing | null => {
    const table = pricingByProvider[provider]
    if (!table) return null
    const id = normalizeModelId(model)
    let best: { prefix: string; pricing: ModelPricing } | null = null
    for (const [prefix, pricing] of Object.entries(table)) {
        if (id.startsWith(prefix) && (!best || prefix.length > best.prefix.length)) {
            best = { prefix, pricing }
        }
    }
    return best?.pricing ?? null
}

export const estimateUsd = (provider: LlmProvider, model: string, usage: LlmTokenUsage): number => {
    const pricing = pricingFor(provider, model)
    if (!pricing) return 0
    return (
        (usage.inputTokens / 1_000_000) * pricing.inputUsdPerMTok +
        (usage.outputTokens / 1_000_000) * pricing.outputUsdPerMTok
    )
}

export const usageBucketKey = (provider: LlmProvider, model: string): string =>
    `${provider}:${normalizeModelId(model)}`

const safeCount = (value: number): number =>
    Number.isFinite(value) && value > 0 ? Math.round(value) : 0

// Accumulates one successful call into the bucket map in place.
export const applyUsage = (
    buckets: Record<string, LlmUsageBucket>,
    provider: LlmProvider,
    model: string,
    usage: LlmTokenUsage
): void => {
    const inputTokens = safeCount(usage.inputTokens)
    const outputTokens = safeCount(usage.outputTokens)
    const key = usageBucketKey(provider, model)
    const bucket = buckets[key] ?? {
        provider,
        model: normalizeModelId(model),
        inputTokens: 0,
        outputTokens: 0,
        estimatedUsd: 0,
        requestCount: 0
    }
    bucket.inputTokens += inputTokens
    bucket.outputTokens += outputTokens
    bucket.estimatedUsd += estimateUsd(provider, model, { inputTokens, outputTokens })
    bucket.requestCount += 1
    buckets[key] = bucket
}

export const summarizeLlmUsage = (buckets: Record<string, LlmUsageBucket>): LlmUsageSummary => {
    const sorted = Object.values(buckets).sort((a, b) => b.estimatedUsd - a.estimatedUsd)
    return {
        totalEstimatedUsd: sorted.reduce((sum, bucket) => sum + bucket.estimatedUsd, 0),
        buckets: sorted
    }
}

import { fileEncoding, llmUsageFileName } from '@shared/constants'
import { applyUsage, LlmTokenUsage, LlmUsageBucket, LlmUsageEntry, LlmUsageSummary, summarizeLlmUsage, summarizeLlmUsagePeriod, usageBucketKey } from '@shared/llmUsage'
import { LlmProvider, LlmUsageBudgetSettings } from '@shared/models'
import { ensureDir, readFile } from 'fs-extra'
import { getRootDir, separator, writeJsonAtomic } from '@/lib'

type LegacyLlmUsageFile = {
    version: 1
    buckets: Record<string, LlmUsageBucket>
    updatedAt: number
}

type LlmUsageFile = {
    version: 2
    buckets: Record<string, LlmUsageBucket>
    entries: LlmUsageEntry[]
    updatedAt: number
}

const getUsagePath = (): string => `${getRootDir()}${separator()}${llmUsageFileName}`

// Serializes read-modify-write cycles so concurrent AI calls cannot drop
// each other's usage increments.
let usageLock: Promise<unknown> = Promise.resolve()
const withUsageLock = <T>(task: () => Promise<T>): Promise<T> => {
    const run = usageLock.then(task, task)
    usageLock = run.catch(() => undefined)
    return run
}

// Missing or corrupt usage file degrades to empty counters.
const loadUsageFile = async (): Promise<LlmUsageFile> => {
    try {
        const parsed = JSON.parse(await readFile(getUsagePath(), { encoding: fileEncoding })) as LlmUsageFile | LegacyLlmUsageFile
        if (parsed && parsed.buckets && typeof parsed.buckets === 'object') {
            if (parsed.version === 2) {
                const entries = Array.isArray(parsed.entries)
                    ? parsed.entries.filter((entry) => Number.isFinite(entry?.recordedAt) &&
                        Number.isFinite(entry?.estimatedUsd) && entry.recordedAt > 0 && entry.estimatedUsd >= 0)
                    : []
                return { version: 2, buckets: parsed.buckets, entries, updatedAt: parsed.updatedAt }
            }
            if (parsed.version === 1) {
                return { version: 2, buckets: parsed.buckets, entries: [], updatedAt: parsed.updatedAt }
            }
        }
    } catch {
        // Usage tracking starts fresh on first recorded call.
    }
    return { version: 2, buckets: {}, entries: [], updatedAt: 0 }
}

// Fire-and-forget accounting: failures are logged, never propagated into the
// AI call that produced the usage.
export const recordLlmUsage = async (
    provider: LlmProvider,
    model: string,
    usage: LlmTokenUsage
): Promise<void> => {
    try {
        await withUsageLock(async () => {
            await ensureDir(getRootDir())
            const file = await loadUsageFile()
            const key = usageBucketKey(provider, model)
            const previousEstimatedUsd = file.buckets[key]?.estimatedUsd ?? 0
            applyUsage(file.buckets, provider, model, usage)
            const recordedAt = Date.now()
            const estimatedUsd = Math.max(0, file.buckets[key].estimatedUsd - previousEstimatedUsd)
            file.entries.push({ recordedAt, estimatedUsd })
            file.updatedAt = recordedAt
            await writeJsonAtomic(getUsagePath(), file)
        })
    } catch (error) {
        console.error('Could not record AI usage.', error)
    }
}

export const getLlmUsageSummary = async (
    budget: LlmUsageBudgetSettings
): Promise<LlmUsageSummary> => withUsageLock(async () => {
    const file = await loadUsageFile()
    const summary = summarizeLlmUsage(file.buckets)
    return {
        ...summary,
        currentPeriod: summarizeLlmUsagePeriod(file.entries, budget, summary.totalEstimatedUsd),
    }
})

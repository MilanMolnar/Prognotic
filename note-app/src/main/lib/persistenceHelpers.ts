import { defaultDictationModeForPlatform } from '@shared/constants'
import { BlockRouting, DictationMode, LlmProvider, VerifiedLlmConnection } from '@shared/models'

export const normalizeCategories = (categories: (string | null)[]): (string | null)[] => {
    const unique = [...new Set(categories)]
    return unique.length > 0 ? unique : [null]
}

export const normalizeDictationModeForPlatform = (
    value: unknown,
    platform: NodeJS.Platform
): DictationMode => {
    if (value === 'whisprflow') return value
    // Native modes, legacy native aliases, missing values, and invalid values
    // all resolve to the current platform's default.
    return defaultDictationModeForPlatform(platform)
}

const llmProviders: ReadonlySet<string> = new Set<LlmProvider>([
    'gemini',
    'openai',
    'anthropic',
    'local'
])

export const normalizeVerifiedLlmConnection = (value: unknown): VerifiedLlmConnection | undefined => {
    if (!value || typeof value !== 'object') return undefined
    const candidate = value as Partial<VerifiedLlmConnection>
    const model = typeof candidate.model === 'string' ? candidate.model.trim() : ''
    if (!model || typeof candidate.provider !== 'string' || !llmProviders.has(candidate.provider)) {
        return undefined
    }
    return { provider: candidate.provider as LlmProvider, model }
}

export type LegacyWisprMigrationPlan = {
    keyToEncrypt: string | null
    removePlaintextImmediately: boolean
}

export const planLegacyWisprMigration = (
    raw: Record<string, unknown>,
    hasEncryptedCredential: boolean
): LegacyWisprMigrationPlan => {
    const key = typeof raw.whisprflowApiKey === 'string' ? raw.whisprflowApiKey.trim() : ''
    if (!key) return { keyToEncrypt: null, removePlaintextImmediately: false }
    if (hasEncryptedCredential) return { keyToEncrypt: null, removePlaintextImmediately: true }
    return { keyToEncrypt: key, removePlaintextImmediately: false }
}

export const recordRoutingDecision = (
    history: BlockRouting[] | undefined,
    routing: BlockRouting,
    limit = 10
): BlockRouting[] => [routing, ...(history ?? [])].slice(0, limit)

export const updateRoutingDecision = (
    history: BlockRouting[] | undefined,
    previous: BlockRouting,
    updated: BlockRouting
): BlockRouting[] => (history?.length ? history : [previous]).map((entry) =>
    entry.decidedAt === updated.decidedAt ? updated : entry
)

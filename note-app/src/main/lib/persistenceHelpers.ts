import { BlockRouting } from '@shared/models'

export const normalizeCategories = (categories: (string | null)[]): (string | null)[] => {
    const unique = [...new Set(categories)]
    return unique.length > 0 ? unique : [null]
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

import type { GlossaryEntry } from '@shared/models'
import { fuzzyScore } from './index'

export type GlossarySearchScope = 'keys' | 'explanations' | 'both'

const scopeScore = (entry: GlossaryEntry, query: string, scope: GlossarySearchScope): number | null => {
    const keyScore = scope !== 'explanations' ? fuzzyScore(query, entry.key) : null
    const explanationScore = scope !== 'keys' ? fuzzyScore(query, entry.explanation) : null
    if (keyScore === null) return explanationScore
    if (explanationScore === null) return keyScore
    return Math.max(keyScore, explanationScore)
}

// Filters entries against the query within the chosen scope, best matches
// first. An empty query keeps the incoming (alphabetical) order.
export const filterGlossaryEntries = (
    entries: GlossaryEntry[],
    query: string,
    scope: GlossarySearchScope
): GlossaryEntry[] => {
    const trimmed = query.trim()
    if (!trimmed) return entries

    return entries
        .map((entry) => ({ entry, score: scopeScore(entry, trimmed, scope) }))
        .filter((item): item is { entry: GlossaryEntry; score: number } => item.score !== null)
        .sort((left, right) => right.score - left.score)
        .map((item) => item.entry)
}

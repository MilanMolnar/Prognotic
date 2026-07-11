import { BlockMeta } from '@shared/models'

export type NoteCandidate = {
    block: BlockMeta
    content: string
}

const queryTerms = (query: string): string[] => [
    ...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])
]

const termOccurrences = (text: string, term: string): number => {
    let count = 0
    let from = 0
    while (count < 4) {
        const index = text.indexOf(term, from)
        if (index === -1) break
        count += 1
        from = index + term.length
    }
    return count
}

export const noteRelevanceScore = (query: string, candidate: NoteCandidate): number => {
    const terms = queryTerms(query)
    if (terms.length === 0) return 0

    const excerpt = candidate.block.excerpt.toLowerCase()
    const content = candidate.content.toLowerCase()
    const normalizedQuery = query.trim().toLowerCase()
    let score = normalizedQuery.length > 2 && content.includes(normalizedQuery) ? 12 : 0

    for (const term of terms) {
        if (excerpt.includes(term)) score += 5
        score += termOccurrences(content, term) * 2
    }
    return score
}

export const rankNoteCandidates = (query: string, candidates: NoteCandidate[]): NoteCandidate[] => {
    const ranked = candidates.map((candidate) => ({
        candidate,
        relevance: noteRelevanceScore(query, candidate)
    }))
    const hasTextMatch = ranked.some((entry) => entry.relevance > 0)

    return ranked
        .sort((a, b) => {
            if (hasTextMatch && a.relevance !== b.relevance) return b.relevance - a.relevance
            return b.candidate.block.updatedAt - a.candidate.block.updatedAt
        })
        .map((entry) => entry.candidate)
}

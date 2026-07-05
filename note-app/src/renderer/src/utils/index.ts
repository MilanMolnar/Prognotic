import { ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

const dateFromatter = new Intl.DateTimeFormat(window.context.locale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "CET",
})

export const formatDateFromMs = (ms: number): string => {
    return dateFromatter.format(ms)
}


export const cn = (...args: ClassValue[]): string => {
    return twMerge(clsx(args))
}

// Short display name for a block: the first words of its (already
// markdown-stripped) excerpt. Placeholder until AI-generated block summaries
// take over.
export const blockLabel = (excerpt: string): string => {
    const words = excerpt.split(/\s+/).filter(Boolean)
    return words.slice(0, 5).join(' ') || 'untitled'
}

// Subsequence fuzzy match. Returns a relevance score (higher = better) or
// null when the query is not a subsequence of the text. Consecutive and
// word-start matches score extra; exact substrings score highest.
export const fuzzyScore = (query: string, text: string): number | null => {
    const q = query.toLowerCase()
    const t = text.toLowerCase()
    if (q.length === 0) return null

    let score = 0
    let searchFrom = 0
    let prevMatch = -2

    for (const ch of q) {
        const idx = t.indexOf(ch, searchFrom)
        if (idx === -1) return null

        score += 1
        if (idx === prevMatch + 1) score += 2
        if (idx === 0 || /\s/.test(t[idx - 1])) score += 3

        prevMatch = idx
        searchFrom = idx + 1
    }

    if (t.includes(q)) score += q.length * 2

    return score
}
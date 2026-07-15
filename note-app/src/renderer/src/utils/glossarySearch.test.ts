import type { GlossaryEntry } from '@shared/models'
import { describe, expect, it } from 'vitest'
import { filterGlossaryEntries } from './glossarySearch'

const entry = (id: string, key: string, explanation: string): GlossaryEntry => ({
    id,
    key,
    explanation,
    createdAt: 0,
    updatedAt: 0
})

const entries = [
    entry('1', 'git rebase', 'Moves commits onto a new base branch.'),
    entry('2', 'ssh tunnel', 'Forwards a local port through a remote host.'),
    entry('3', 'memoization', 'Caches results of expensive git-agnostic calls.')
]

describe('filterGlossaryEntries', () => {
    it('returns all entries in the incoming order for an empty query', () => {
        expect(filterGlossaryEntries(entries, '', 'both')).toEqual(entries)
        expect(filterGlossaryEntries(entries, '   ', 'keys')).toEqual(entries)
    })

    it('matches keys only in the keys scope', () => {
        const result = filterGlossaryEntries(entries, 'commits', 'keys')
        expect(result).toEqual([])
        expect(filterGlossaryEntries(entries, 'rebase', 'keys').map((item) => item.id)).toEqual(['1'])
    })

    it('matches explanations only in the explanations scope', () => {
        expect(filterGlossaryEntries(entries, 'tunnel', 'explanations')).toEqual([])
        expect(filterGlossaryEntries(entries, 'remote host', 'explanations').map((item) => item.id)).toEqual(['2'])
    })

    it('matches either field in the both scope', () => {
        const ids = filterGlossaryEntries(entries, 'git', 'both').map((item) => item.id)
        expect(ids).toContain('1')
        expect(ids).toContain('3')
        expect(ids).not.toContain('2')
    })

    it('is case-insensitive', () => {
        expect(filterGlossaryEntries(entries, 'REBASE', 'keys').map((item) => item.id)).toEqual(['1'])
    })

    it('ranks exact substrings above scattered subsequence matches', () => {
        // Reversed input so the ordering must come from scoring, not stability:
        // "onto" is an exact substring in entry 1's explanation but only a
        // scattered subsequence in entry 3's.
        const ranked = filterGlossaryEntries([...entries].reverse(), 'onto', 'both')
        expect(ranked.map((item) => item.id)).toEqual(['1', '3'])
    })
})

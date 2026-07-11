import { describe, expect, it } from 'vitest'
import { BlockMeta } from '@shared/models'
import { rankNoteCandidates } from './noteRanking'

const block = (id: string, excerpt: string, updatedAt: number): BlockMeta => ({
    id,
    file: `${id}.md`,
    createdAt: updatedAt,
    updatedAt,
    categories: [null],
    excerpt
})

describe('rankNoteCandidates', () => {
    it('ranks a text match ahead of a newer irrelevant note', () => {
        const ranked = rankNoteCandidates('quarterly roadmap', [
            { block: block('new', 'Lunch', 300), content: 'Buy soup and bread.' },
            { block: block('match', 'Planning', 100), content: 'Review the quarterly roadmap with the team.' }
        ])

        expect(ranked.map((entry) => entry.block.id)).toEqual(['match', 'new'])
    })

    it('uses recency when relevance is tied', () => {
        const ranked = rankNoteCandidates('release', [
            { block: block('old', 'Release', 100), content: 'Release checklist.' },
            { block: block('new', 'Release', 300), content: 'Release notes.' }
        ])

        expect(ranked.map((entry) => entry.block.id)).toEqual(['new', 'old'])
    })
})

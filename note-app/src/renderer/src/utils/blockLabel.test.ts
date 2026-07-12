import { describe, expect, it } from 'vitest'
import { blockLabel } from './blockLabel'

describe('blockLabel', () => {
    const block = {
        excerpt: 'Fallback excerpt contains more than five words here',
        aiLabel: 'Concise AI label'
    }

    it('prefers the persisted AI label only while the feature is enabled', () => {
        expect(blockLabel(block, true)).toBe('Concise AI label')
        expect(blockLabel(block, false)).toBe('Fallback excerpt contains more than')
    })

    it('falls back for missing or blank AI labels and empty excerpts', () => {
        expect(blockLabel({ excerpt: 'Fallback words', aiLabel: '   ' }, true)).toBe('Fallback words')
        expect(blockLabel({ excerpt: '' }, true)).toBe('untitled')
    })
})

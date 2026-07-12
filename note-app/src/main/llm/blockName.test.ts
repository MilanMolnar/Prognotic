import { describe, expect, it } from 'vitest'
import { normalizeBlockNameSummary } from './blockName'

describe('block name summaries', () => {
    it('normalizes model formatting and enforces five words', () => {
        expect(normalizeBlockNameSummary('```text\nTitle: **Quarterly launch planning and follow-up tasks**\n```'))
            .toBe('Quarterly launch planning and follow-up')
    })

    it('returns an empty label for formatting-only output', () => {
        expect(normalizeBlockNameSummary('```markdown\n***\n```')).toBe('')
    })
})

import { describe, expect, it } from 'vitest'
import {
    defaultSettings,
    glossaryExplanationMaxLength,
    maxGlossaryKeyLengthLimit,
    minGlossaryKeyLengthLimit
} from './constants'
import { clampGlossaryKeyMaxLength, glossaryKeysEqual, validateGlossaryFields } from './glossary'

describe('clampGlossaryKeyMaxLength', () => {
    it('keeps values inside the allowed range', () => {
        expect(clampGlossaryKeyMaxLength(150)).toBe(150)
        expect(clampGlossaryKeyMaxLength(minGlossaryKeyLengthLimit)).toBe(minGlossaryKeyLengthLimit)
        expect(clampGlossaryKeyMaxLength(maxGlossaryKeyLengthLimit)).toBe(maxGlossaryKeyLengthLimit)
    })

    it('clamps values outside the range', () => {
        expect(clampGlossaryKeyMaxLength(10)).toBe(minGlossaryKeyLengthLimit)
        expect(clampGlossaryKeyMaxLength(1000)).toBe(maxGlossaryKeyLengthLimit)
    })

    it('rounds fractional values', () => {
        expect(clampGlossaryKeyMaxLength(150.6)).toBe(151)
    })

    it('falls back to the default for invalid values', () => {
        expect(clampGlossaryKeyMaxLength(undefined)).toBe(defaultSettings.glossaryKeyMaxLength)
        expect(clampGlossaryKeyMaxLength(Number.NaN)).toBe(defaultSettings.glossaryKeyMaxLength)
        expect(clampGlossaryKeyMaxLength('200')).toBe(defaultSettings.glossaryKeyMaxLength)
    })
})

describe('validateGlossaryFields', () => {
    it('trims both fields on success', () => {
        expect(validateGlossaryFields('  git rebase  ', '  Rewrites history.  ', 150)).toEqual({
            key: 'git rebase',
            explanation: 'Rewrites history.'
        })
    })

    it('rejects an empty or whitespace-only key', () => {
        expect(validateGlossaryFields('', 'explanation', 150)).toEqual({ error: 'empty-key' })
        expect(validateGlossaryFields('   ', 'explanation', 150)).toEqual({ error: 'empty-key' })
    })

    it('rejects an empty or whitespace-only explanation', () => {
        expect(validateGlossaryFields('key', '', 150)).toEqual({ error: 'empty-explanation' })
        expect(validateGlossaryFields('key', '  \n ', 150)).toEqual({ error: 'empty-explanation' })
    })

    it('enforces the key limit after trimming', () => {
        const key = 'k'.repeat(150)
        expect(validateGlossaryFields(`  ${key}  `, 'explanation', 150)).toEqual({
            key,
            explanation: 'explanation'
        })
        expect(validateGlossaryFields('k'.repeat(151), 'explanation', 150)).toEqual({ error: 'key-too-long' })
    })

    it('caps the explanation only at the storage-safety limit', () => {
        const longExplanation = 'e'.repeat(glossaryExplanationMaxLength + 10)
        const result = validateGlossaryFields('key', longExplanation, 150)
        expect(result.error).toBeUndefined()
        expect(result.explanation).toHaveLength(glossaryExplanationMaxLength)
    })
})

describe('glossaryKeysEqual', () => {
    it('compares case-insensitively and ignores surrounding space', () => {
        expect(glossaryKeysEqual('Git Rebase', '  git rebase ')).toBe(true)
        expect(glossaryKeysEqual('git rebase', 'git merge')).toBe(false)
    })
})

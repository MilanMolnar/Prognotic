import { describe, expect, it } from 'vitest'
import { buildImageRecognitionPrompt } from './imageRecognition'

describe('image recognition prompt', () => {
    it('includes normalized language and printed-text metadata', () => {
        const prompt = buildImageRecognitionPrompt('  English\n(US)  ', false)
        expect(prompt).toContain('Language: English (US)')
        expect(prompt).toContain('Contains handwriting: no')
        expect(prompt).toContain('Return only the extracted text.')
        expect(prompt).toContain('Preserve reading order and line breaks where reasonable.')
    })

    it('marks handwriting mode explicitly and defaults an empty language', () => {
        const prompt = buildImageRecognitionPrompt(' ', true)
        expect(prompt).toContain('Language: English')
        expect(prompt).toContain('Contains handwriting: yes')
    })
})

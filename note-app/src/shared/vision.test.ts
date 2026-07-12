import { describe, expect, it } from 'vitest'
import { filterVisionModels, hasSupportedImageSignature, isImageRecognitionAvailable } from './vision'

const models = (...ids: string[]): { id: string; label: string }[] =>
    ids.map((id) => ({ id, label: id }))

describe('vision model capability filtering', () => {
    it('marks supported cloud providers as available', () => {
        expect(isImageRecognitionAvailable('gemini')).toBe(true)
        expect(isImageRecognitionAvailable('openai')).toBe(true)
        expect(isImageRecognitionAvailable('anthropic')).toBe(true)
    })

    it('keeps only conservative Gemini vision families', () => {
        expect(filterVisionModels('gemini', models(
            'gemini-2.5-flash',
            'gemini-3.5-pro',
            'gemini-embedding-001',
            'gemma-3-27b-it'
        )).map((model) => model.id)).toEqual(['gemini-2.5-flash', 'gemini-3.5-pro'])
    })

    it('keeps known OpenAI and Claude vision families and rejects specialized text endpoints', () => {
        expect(filterVisionModels('openai', models(
            'gpt-5.6',
            'gpt-4o-mini',
            'gpt-4o-mini-transcribe',
            'text-embedding-3-large'
        )).map((model) => model.id)).toEqual(['gpt-5.6', 'gpt-4o-mini'])
        expect(filterVisionModels('anthropic', models(
            'claude-3-5-sonnet-20241022',
            'claude-sonnet-4-5-20250929',
            'claude-2.1'
        )).map((model) => model.id)).toEqual([
            'claude-3-5-sonnet-20241022',
            'claude-sonnet-4-5-20250929'
        ])
    })

    it('requires explicit vision metadata for local models', () => {
        const localModels = [
            { id: 'qwen2-vl', label: 'Qwen VL' },
            { id: 'loaded-vlm', label: 'Loaded VLM', vision: true }
        ]
        expect(filterVisionModels('local', localModels)).toEqual([localModels[1]])
        expect(isImageRecognitionAvailable('local', localModels)).toBe(true)
        expect(isImageRecognitionAvailable('local', models('qwen2-vl'))).toBe(false)
    })

    it('honors explicit negative capability metadata before cloud heuristics', () => {
        expect(filterVisionModels('openai', [
            { id: 'gpt-5.6', label: 'GPT-5.6', vision: false }
        ])).toEqual([])
    })

    it('validates the declared image format from its file signature', () => {
        expect(hasSupportedImageSignature('image/png', new Uint8Array([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
        ]))).toBe(true)
        expect(hasSupportedImageSignature('image/jpeg', new Uint8Array([0xff, 0xd8, 0xff]))).toBe(true)
        expect(hasSupportedImageSignature('image/gif', new TextEncoder().encode('GIF89a'))).toBe(true)
        expect(hasSupportedImageSignature('image/webp', new TextEncoder().encode('RIFF0000WEBP'))).toBe(true)
        expect(hasSupportedImageSignature('image/png', new TextEncoder().encode('not an image'))).toBe(false)
    })
})

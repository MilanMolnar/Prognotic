import { describe, expect, it } from 'vitest'
import { defaultDictationModeForPlatform } from '@shared/constants'
import { BlockRouting } from '@shared/models'
import { normalizeCategories, normalizeDictationModeForPlatform, normalizeVerifiedLlmConnection, planLegacyWisprMigration, recordRoutingDecision, updateRoutingDecision } from './persistenceHelpers'

const routing = (decidedAt: number, status: BlockRouting['status'] = 'pending'): BlockRouting => ({
    status,
    decidedAt,
    assignments: [{ goalId: 'goal', confidence: 0.7 }],
    model: 'gemini:test'
})

describe('persistence helpers', () => {
    it('deduplicates categories and preserves the Quick Notes fallback', () => {
        expect(normalizeCategories(['goal', 'goal', null])).toEqual(['goal', null])
        expect(normalizeCategories([])).toEqual([null])
    })

    it('removes stale plaintext when an encrypted Wispr key already exists', () => {
        expect(planLegacyWisprMigration({ whisprflowApiKey: ' legacy ' }, true)).toEqual({
            keyToEncrypt: null,
            removePlaintextImmediately: true
        })
        expect(planLegacyWisprMigration({ whisprflowApiKey: ' legacy ' }, false).keyToEncrypt).toBe('legacy')
    })

    it('chooses the correct fresh-install dictation mode for each platform', () => {
        expect(defaultDictationModeForPlatform('win32')).toBe('windows')
        expect(defaultDictationModeForPlatform('darwin')).toBe('macos')
        expect(defaultDictationModeForPlatform('linux')).toBe('whisprflow')
    })

    it('migrates stale native modes but preserves an explicit Wispr Flow choice', () => {
        expect(normalizeDictationModeForPlatform('windows', 'win32')).toBe('windows')
        expect(normalizeDictationModeForPlatform('macos', 'darwin')).toBe('macos')
        expect(normalizeDictationModeForPlatform('windows', 'darwin')).toBe('macos')
        expect(normalizeDictationModeForPlatform('macos', 'win32')).toBe('windows')
        expect(normalizeDictationModeForPlatform('windows', 'linux')).toBe('whisprflow')
        expect(normalizeDictationModeForPlatform('whisprflow', 'darwin')).toBe('whisprflow')
        expect(normalizeDictationModeForPlatform('whisprflow', 'win32')).toBe('whisprflow')
        expect(normalizeDictationModeForPlatform('whisprflow', 'linux')).toBe('whisprflow')
        expect(normalizeDictationModeForPlatform('online', 'darwin')).toBe('macos')
        expect(normalizeDictationModeForPlatform('invalid', 'win32')).toBe('windows')
        expect(normalizeDictationModeForPlatform(undefined, 'linux')).toBe('whisprflow')
    })

    it('normalizes persisted connection verification metadata', () => {
        expect(normalizeVerifiedLlmConnection({ provider: 'openai', model: '  gpt-test  ' })).toEqual({
            provider: 'openai',
            model: 'gpt-test'
        })
        expect(normalizeVerifiedLlmConnection({ provider: 'unknown', model: 'model' })).toBeUndefined()
        expect(normalizeVerifiedLlmConnection({ provider: 'openai', model: '' })).toBeUndefined()
    })

    it('caps routing history and updates the matching accepted decision', () => {
        const history = recordRoutingDecision(Array.from({ length: 10 }, (_, index) => routing(index)), routing(20))
        expect(history).toHaveLength(10)
        expect(history[0].decidedAt).toBe(20)
        expect(updateRoutingDecision(history, history[0], routing(20, 'applied'))[0].status).toBe('applied')
    })
})

import { describe, expect, it } from 'vitest'
import { BlockRouting } from '@shared/models'
import { normalizeCategories, planLegacyWisprMigration, recordRoutingDecision, updateRoutingDecision } from './persistenceHelpers'

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

    it('caps routing history and updates the matching accepted decision', () => {
        const history = recordRoutingDecision(Array.from({ length: 10 }, (_, index) => routing(index)), routing(20))
        expect(history).toHaveLength(10)
        expect(history[0].decidedAt).toBe(20)
        expect(updateRoutingDecision(history, history[0], routing(20, 'applied'))[0].status).toBe('applied')
    })
})

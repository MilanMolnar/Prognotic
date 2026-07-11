import { describe, expect, it } from 'vitest'
import { Goal } from '@shared/models'
import { fallbackGoalId, parseRoutingAssignments } from './classification'

const goal = (id: string, name: string, routingHints = ''): Goal => ({
    id,
    name,
    description: '',
    routingHints,
    createdAt: 1
})

describe('routing classification helpers', () => {
    it('filters invented ids and clamps confidence', () => {
        const assignments = parseRoutingAssignments(
            '{"assignments":[{"goalId":"valid","confidence":3},{"goalId":"invented","confidence":0.8}]}',
            'note',
            [goal('valid', 'Valid')]
        )

        expect(assignments).toEqual([{ goalId: 'valid', confidence: 1 }])
    })

    it('uses editable routing hints for the fallback decision', () => {
        const goals = [goal('work', 'Work'), goal('game', 'Game', 'shader unity rendering')]
        expect(fallbackGoalId('Investigate a Unity shader issue', goals)).toBe('game')
        expect(parseRoutingAssignments('{"assignments":[]}', 'Unity shader', goals)).toEqual([
            { goalId: 'game', confidence: 0.1 }
        ])
    })
})

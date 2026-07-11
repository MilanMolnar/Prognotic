import { describe, expect, it } from 'vitest'
import { Goal } from '@shared/models'
import {
    fallbackGoalId,
    parseRoutingAssignments,
    parseRoutingClassification
} from './classification'

const goal = (id: string, name: string, routingHints = ''): Goal => ({
    id,
    name,
    description: '',
    routingHints,
    createdAt: 1
})

describe('routing classification helpers', () => {
    it('filters invented ids, clamps confidence, and ranks valid assignments', () => {
        const classification = parseRoutingClassification(
            '{"hasConfidentMatch":true,"assignments":[{"goalId":"lower","confidence":0.7},{"goalId":"valid","confidence":3},{"goalId":"invented","confidence":0.8}]}',
            'note',
            [goal('valid', 'Valid'), goal('lower', 'Lower')]
        )

        expect(classification).toEqual({
            hasConfidentMatch: true,
            assignments: [
                { goalId: 'valid', confidence: 1 },
                { goalId: 'lower', confidence: 0.7 }
            ],
            usedFallback: false
        })
    })

    it('keeps only the best existing goal and a sanitized proposal for an honest no-match', () => {
        const classification = parseRoutingClassification(
            JSON.stringify({
                hasConfidentMatch: false,
                assignments: [
                    { goalId: 'work', confidence: 0.22 },
                    { goalId: 'home', confidence: 0.31 }
                ],
                suggestedNewGoal: {
                    name: '  Kitchen Renovation  ',
                    description: '  Contractors, materials, and remodel plans.  ',
                    confidence: 4
                }
            }),
            'Renovate the kitchen',
            [goal('work', 'Work'), goal('home', 'Home')]
        )

        expect(classification).toEqual({
            hasConfidentMatch: false,
            assignments: [{ goalId: 'home', confidence: 0.31 }],
            suggestedNewGoal: {
                name: 'Kitchen Renovation',
                description: 'Contractors, materials, and remodel plans.',
                confidence: 1
            },
            usedFallback: false
        })
    })

    it('does not inject a keyword fallback for a deliberate no-match decision', () => {
        const goals = [goal('game', 'Game', 'unity shader')]
        const classification = parseRoutingClassification(
            '{"hasConfidentMatch":false,"assignments":[],"suggestedNewGoal":{"name":"Rendering Study","description":"Graphics research notes.","confidence":0.8}}',
            'Unity shader issue',
            goals
        )

        expect(classification.assignments).toEqual([])
        expect(classification.suggestedNewGoal?.name).toBe('Rendering Study')
        expect(classification.usedFallback).toBe(false)
    })

    it('accepts uppercase fences and provider prose around the JSON payload', () => {
        const goals = [goal('valid', 'Valid')]

        expect(parseRoutingAssignments('```JSON\n{"hasConfidentMatch":true,"assignments":[{"goalId":"valid","confidence":0.8}]}\n```', 'note', goals))
            .toEqual([{ goalId: 'valid', confidence: 0.8 }])
        expect(parseRoutingAssignments('Result follows: {"hasConfidentMatch":true,"assignments":[{"goalId":"valid","confidence":0.6}]} Thanks.', 'note', goals))
            .toEqual([{ goalId: 'valid', confidence: 0.6 }])
    })

    it('uses editable routing hints only when an empty or malformed response needs fallback', () => {
        const goals = [goal('game', 'Game', 'unity shader')]
        expect(fallbackGoalId('Investigate a Unity shader issue', goals)).toBe('game')

        for (const raw of ['{"assignments":[]}', 'not valid json']) {
            const classification = parseRoutingClassification(raw, 'Unity shader issue', goals)
            expect(classification.assignments).toEqual([{ goalId: 'game', confidence: 0.1 }])
            expect(classification.usedFallback).toBe(true)
        }
    })

    it('infers no-match for the legacy shape when all confidence is low', () => {
        const classification = parseRoutingClassification(
            '{"assignments":[{"goalId":"work","confidence":0.35}],"suggestedNewGoal":{"name":"Garden","description":"Garden plans","confidence":0.75}}',
            'Plant tomatoes',
            [goal('work', 'Work')]
        )

        expect(classification.hasConfidentMatch).toBe(false)
        expect(classification.assignments).toEqual([{ goalId: 'work', confidence: 0.35 }])
        expect(classification.suggestedNewGoal?.name).toBe('Garden')
    })
})

import { describe, expect, it } from 'vitest'
import { BlockMeta } from './models'
import {
    countUnvisitedBlocksForGoal,
    isBlockUnvisitedInGoal,
    reconcileUserGoalPresence,
    setGoalPresence,
    userGoalPresenceForCategories
} from './goalPresence'

const block = (categories: BlockMeta['categories'], goalPresence?: BlockMeta['goalPresence']): BlockMeta => ({
    id: 'block',
    file: 'block.md',
    createdAt: 1,
    updatedAt: 1,
    categories,
    excerpt: 'Block',
    goalPresence
})

describe('goal presence', () => {
    it('treats legacy blocks without presence data as already seen', () => {
        const legacy = block(['goal-a'])
        expect(isBlockUnvisitedInGoal(legacy, 'goal-a')).toBe(false)
        expect(countUnvisitedBlocksForGoal([legacy], 'goal-a')).toBe(0)
    })

    it('marks direct user capture as visited', () => {
        const captured = block(['goal-a'], userGoalPresenceForCategories(['goal-a']))
        expect(captured.goalPresence?.['goal-a']).toEqual({ source: 'user', visited: true })
        expect(isBlockUnvisitedInGoal(captured, 'goal-a')).toBe(false)
    })

    it('counts routed presence until that goal is acknowledged', () => {
        const routed = block(['goal-a'], setGoalPresence(undefined, 'goal-a', 'routed', false))
        expect(countUnvisitedBlocksForGoal([routed], 'goal-a')).toBe(1)

        const acknowledged = block(
            routed.categories,
            setGoalPresence(routed.goalPresence, 'goal-a', 'routed', true)
        )
        expect(countUnvisitedBlocksForGoal([acknowledged], 'goal-a')).toBe(0)
    })

    it('keeps visited state independent for blocks in multiple goals', () => {
        const presence = setGoalPresence(
            setGoalPresence(undefined, 'goal-a', 'routed', false),
            'goal-b',
            'assistant',
            true
        )
        const multiGoal = block(['goal-a', 'goal-b'], presence)

        expect(isBlockUnvisitedInGoal(multiGoal, 'goal-a')).toBe(true)
        expect(isBlockUnvisitedInGoal(multiGoal, 'goal-b')).toBe(false)
    })

    it('adds visited user presence for newly assigned categories and removes stale entries', () => {
        const routed = setGoalPresence(undefined, 'goal-a', 'routed', false)
        const reconciled = reconcileUserGoalPresence(routed, ['goal-a'], ['goal-b'])

        expect(reconciled).toEqual({ 'goal-b': { source: 'user', visited: true } })
    })
})

import { BlockMeta, GoalPresence, GoalPresenceSource } from './models'

export const setGoalPresence = (
    presence: BlockMeta['goalPresence'],
    goalId: string,
    source: GoalPresenceSource,
    visited: boolean
): NonNullable<BlockMeta['goalPresence']> => ({
    ...(presence ?? {}),
    [goalId]: { source, visited }
})

export const userGoalPresenceForCategories = (
    categories: BlockMeta['categories']
): BlockMeta['goalPresence'] => {
    const entries = categories
        .filter((category): category is string => category !== null)
        .map((goalId) => [goalId, { source: 'user', visited: true } satisfies GoalPresence] as const)
    return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export const reconcileUserGoalPresence = (
    presence: BlockMeta['goalPresence'],
    previousCategories: BlockMeta['categories'],
    nextCategories: BlockMeta['categories']
): BlockMeta['goalPresence'] => {
    const previous = new Set(previousCategories.filter((category): category is string => category !== null))
    const nextIds = new Set(nextCategories.filter((category): category is string => category !== null))
    const next = { ...(presence ?? {}) }

    for (const goalId of Object.keys(next)) {
        if (!nextIds.has(goalId)) delete next[goalId]
    }
    for (const goalId of nextIds) {
        if (!previous.has(goalId) && next[goalId] === undefined) {
            next[goalId] = { source: 'user', visited: true }
        }
    }
    return Object.keys(next).length > 0 ? next : undefined
}

export const isBlockUnvisitedInGoal = (block: BlockMeta, goalId: string): boolean => {
    const presence = block.goalPresence?.[goalId]
    return block.categories.includes(goalId) &&
        presence !== undefined &&
        presence.source !== 'user' &&
        presence.visited === false
}

export const countUnvisitedBlocksForGoal = (blocks: BlockMeta[] | undefined, goalId: string): number =>
    blocks?.reduce((count, block) => count + (isBlockUnvisitedInGoal(block, goalId) ? 1 : 0), 0) ?? 0

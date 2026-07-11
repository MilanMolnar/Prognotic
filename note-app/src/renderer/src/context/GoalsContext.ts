import { Goal } from '@shared/models'
import { createContext, useContext } from 'react'

// The selected category key: null = Quick Notes (the default, unassigned
// space), the researchCategory constant = the pinned Research topic,
// anything else = a Goal id.
export type CategoryKey = string | null

export type GoalsState = {
    goals: Goal[] | undefined
    selectedCategory: CategoryKey
}

export type GoalsActions = {
    selectCategory: (key: CategoryKey) => void
    createGoal: (name: string, description: string, routingHints?: string) => Promise<void>
    registerPersistedGoal: (goal: Goal) => void
    renameGoal: (id: string, name: string, description: string, routingHints?: string) => Promise<void>
    deleteGoal: (id: string) => Promise<void>
}

// Split by concern: action consumers (dialogs, sidebar buttons) should not
// re-render when the goals list or selection changes.
export const GoalsStateContext = createContext<GoalsState | null>(null)
export const GoalsActionsContext = createContext<GoalsActions | null>(null)

export const useGoals = (): GoalsState => {
    const state = useContext(GoalsStateContext)
    if (!state) {
        throw new Error('useGoals must be used within a GoalsProvider')
    }
    return state
}

export const useGoalActions = (): GoalsActions => {
    const actions = useContext(GoalsActionsContext)
    if (!actions) {
        throw new Error('useGoalActions must be used within a GoalsProvider')
    }
    return actions
}

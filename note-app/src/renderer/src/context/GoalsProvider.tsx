import { Goal } from '@shared/models'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
    CategoryKey,
    GoalsActions,
    GoalsActionsContext,
    GoalsState,
    GoalsStateContext
} from './GoalsContext'

const sortGoals = (goals: Goal[]): Goal[] => [...goals].sort((a, b) => a.createdAt - b.createdAt)

export const GoalsProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
    const [goals, setGoals] = useState<Goal[] | undefined>(undefined)
    // null = Quick Notes, the always-available default capture target.
    const [selectedCategory, setSelectedCategory] = useState<CategoryKey>(null)

    useEffect(() => {
        let cancelled = false

        const loadGoals = async (): Promise<void> => {
            const loadedGoals = await window.context.getGoals()
            if (cancelled) return
            setGoals(sortGoals(loadedGoals))
        }

        void loadGoals()
        return () => {
            cancelled = true
        }
    }, [])

    const selectCategory = useCallback((key: CategoryKey) => {
        setSelectedCategory(key)
    }, [])

    const createGoal = useCallback(async (name: string, description: string) => {
        const goal = await window.context.createGoal(name, description)
        setGoals((prev) => (prev ? [...prev, goal] : [goal]))
        setSelectedCategory(goal.id)
    }, [])

    const stateValue: GoalsState = useMemo(
        () => ({ goals, selectedCategory }),
        [goals, selectedCategory]
    )

    const actionsValue: GoalsActions = useMemo(
        () => ({ selectCategory, createGoal }),
        [selectCategory, createGoal]
    )

    return (
        <GoalsStateContext.Provider value={stateValue}>
            <GoalsActionsContext.Provider value={actionsValue}>
                {children}
            </GoalsActionsContext.Provider>
        </GoalsStateContext.Provider>
    )
}

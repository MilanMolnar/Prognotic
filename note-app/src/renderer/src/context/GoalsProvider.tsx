import { Goal } from '@shared/models'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
    CategoryKey,
    GoalsActions,
    GoalsActionsContext,
    GoalsState,
    GoalsStateContext
} from './GoalsContext'
import { useSettingsActions } from './SettingsContext'

const sortGoals = (goals: Goal[]): Goal[] => [...goals].sort((a, b) => a.createdAt - b.createdAt)

export const GoalsProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
    const [goals, setGoals] = useState<Goal[] | undefined>(undefined)
    // null = Quick Notes, the always-available default capture target.
    const [selectedCategory, setSelectedCategory] = useState<CategoryKey>(null)
    const { updateSettings } = useSettingsActions()

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

    const createGoal = useCallback(async (name: string, description: string, routingHints = '') => {
        const goal = await window.context.createGoal(name, description, routingHints)
        setGoals((prev) => (prev ? [...prev, goal] : [goal]))
        setSelectedCategory(goal.id)
    }, [])

    const renameGoal = useCallback(async (id: string, name: string, description: string, routingHints = '') => {
        const renamed = await window.context.renameGoal(id, name, description, routingHints)
        if (!renamed) return
        setGoals((prev) => prev?.map((goal) => goal.id === id ? renamed : goal))
    }, [])

    const deleteGoal = useCallback(async (id: string) => {
        const deleted = await window.context.deleteGoal(id)
        if (!deleted) return
        setGoals((prev) => prev?.filter((goal) => goal.id !== id))
        setSelectedCategory((previous) => previous === id ? null : previous)

        const settings = await window.context.getSettings()
        if (settings.pinnedGoalIds.includes(id)) {
            await updateSettings({ pinnedGoalIds: settings.pinnedGoalIds.filter((goalId) => goalId !== id) })
        }
    }, [updateSettings])

    const stateValue: GoalsState = useMemo(
        () => ({ goals, selectedCategory }),
        [goals, selectedCategory]
    )

    const actionsValue: GoalsActions = useMemo(
        () => ({ selectCategory, createGoal, renameGoal, deleteGoal }),
        [selectCategory, createGoal, renameGoal, deleteGoal]
    )

    return (
        <GoalsStateContext.Provider value={stateValue}>
            <GoalsActionsContext.Provider value={actionsValue}>
                {children}
            </GoalsActionsContext.Provider>
        </GoalsStateContext.Provider>
    )
}

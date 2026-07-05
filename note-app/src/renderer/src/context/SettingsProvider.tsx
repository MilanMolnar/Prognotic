import { defaultSettings, maxPinnedGoals } from '@shared/constants'
import { AppSettings } from '@shared/models'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
    SettingsActions,
    SettingsActionsContext,
    SettingsState,
    SettingsStateContext
} from './SettingsContext'

export const SettingsProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
    const [settings, setSettings] = useState<AppSettings>(defaultSettings)
    const [isLoaded, setIsLoaded] = useState(false)

    useEffect(() => {
        let cancelled = false

        const loadSettings = async (): Promise<void> => {
            const loadedSettings = await window.context.getSettings()
            if (cancelled) return
            setSettings(loadedSettings)
            setIsLoaded(true)
        }

        void loadSettings()
        return () => {
            cancelled = true
        }
    }, [])

    const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
        // Optimistic update; the main process clamps and returns the merged
        // value, which reconciles the state.
        setSettings((prev) => ({ ...prev, ...patch }))
        const merged = await window.context.setSettings(patch)
        setSettings(merged)
    }, [])

    const togglePinGoal = useCallback(async (goalId: string) => {
        const current = await window.context.getSettings()
        const pinned = current.pinnedGoalIds ?? []
        const next = pinned.includes(goalId)
            ? pinned.filter((id) => id !== goalId)
            : pinned.length >= maxPinnedGoals
              ? pinned
              : [...pinned, goalId]

        setSettings((prev) => ({ ...prev, pinnedGoalIds: next }))
        const merged = await window.context.setSettings({ pinnedGoalIds: next })
        setSettings(merged)
    }, [])

    const stateValue: SettingsState = useMemo(
        () => ({ settings, isLoaded }),
        [settings, isLoaded]
    )

    const actionsValue: SettingsActions = useMemo(
        () => ({ updateSettings, togglePinGoal }),
        [updateSettings, togglePinGoal]
    )

    return (
        <SettingsStateContext.Provider value={stateValue}>
            <SettingsActionsContext.Provider value={actionsValue}>
                {children}
            </SettingsActionsContext.Provider>
        </SettingsStateContext.Provider>
    )
}

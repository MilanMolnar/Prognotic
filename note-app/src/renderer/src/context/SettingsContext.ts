import { AppSettings } from '@shared/models'
import { createContext, useContext } from 'react'

export type SettingsState = {
    settings: AppSettings
    isLoaded: boolean
}

export type SettingsActions = {
    updateSettings: (patch: Partial<AppSettings>) => Promise<void>
}

export const SettingsStateContext = createContext<SettingsState | null>(null)
export const SettingsActionsContext = createContext<SettingsActions | null>(null)

export const useSettings = (): SettingsState => {
    const state = useContext(SettingsStateContext)
    if (!state) {
        throw new Error('useSettings must be used within a SettingsProvider')
    }
    return state
}

export const useSettingsActions = (): SettingsActions => {
    const actions = useContext(SettingsActionsContext)
    if (!actions) {
        throw new Error('useSettingsActions must be used within a SettingsProvider')
    }
    return actions
}

import type { CalendarItem } from '@shared/models'
import type { ResolveCalendarItemInput, UpdateCalendarItemInput } from '@shared/types'
import { createContext, useContext } from 'react'

export type CalendarState = {
    items: CalendarItem[] | undefined
    isLoading: boolean
    isSyncing: boolean
    resolutionItemId: string | null
    notice: string | null
}

export type CalendarActionResult = { ok: boolean; error?: string }

export type CalendarActions = {
    refreshItems: () => Promise<void>
    extractBlockCalendar: (blockId: string) => Promise<void>
    validateItem: (id: string) => Promise<boolean>
    resolveItem: (input: ResolveCalendarItemInput) => Promise<boolean>
    updateItem: (input: UpdateCalendarItemInput) => Promise<boolean>
    deleteItem: (id: string) => Promise<boolean>
    openResolutionQueue: (id?: string) => void
    closeResolutionQueue: () => void
    configureGoogle: (clientId: string, clientSecret: string) => Promise<CalendarActionResult>
    connectGoogle: () => Promise<CalendarActionResult>
    disconnectGoogle: () => Promise<CalendarActionResult>
    syncGoogleNow: () => Promise<CalendarActionResult>
}

export const CalendarStateContext = createContext<CalendarState | null>(null)
export const CalendarActionsContext = createContext<CalendarActions | null>(null)

export const useCalendar = (): CalendarState => {
    const state = useContext(CalendarStateContext)
    if (!state) throw new Error('useCalendar must be used within a CalendarProvider')
    return state
}

export const useCalendarActions = (): CalendarActions => {
    const actions = useContext(CalendarActionsContext)
    if (!actions) throw new Error('useCalendarActions must be used within a CalendarProvider')
    return actions
}

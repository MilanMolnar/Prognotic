import type { CalendarItem } from '@shared/models'
import { shouldAutoSyncGoogle } from '@shared/calendar'
import type { ResolveCalendarItemInput, UpdateCalendarItemInput } from '@shared/types'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    CalendarActions,
    CalendarActionsContext,
    CalendarState,
    CalendarStateContext
} from './CalendarContext'
import { useSettings, useSettingsActions } from './SettingsContext'
import { useI18n } from './I18nContext'

const replaceItem = (items: CalendarItem[] | undefined, updated: CalendarItem): CalendarItem[] =>
    (items ?? []).map((item) => item.id === updated.id ? updated : item)

export const CalendarProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
    const [items, setItems] = useState<CalendarItem[] | undefined>(undefined)
    const [isLoading, setIsLoading] = useState(true)
    const [isSyncing, setIsSyncing] = useState(false)
    const [resolutionItemId, setResolutionItemId] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const { settings } = useSettings()
    const { updateSettings } = useSettingsActions()
    const { t } = useI18n()

    const itemsRef = useRef(items)
    const isSyncingRef = useRef(isSyncing)
    useEffect(() => {
        itemsRef.current = items
        isSyncingRef.current = isSyncing
    })

    const refreshItems = useCallback(async (): Promise<void> => {
        setIsLoading(true)
        try {
            const loaded = await window.context.backfillCalendar()
            setItems(loaded)
            setNotice(null)
        } catch {
            setNotice(t('calendar.error.load'))
        } finally {
            setIsLoading(false)
        }
    }, [t])

    useEffect(() => {
        void refreshItems()
    }, [refreshItems])

    const extractBlockCalendar = useCallback(async (blockId: string): Promise<void> => {
        try {
            const result = await window.context.extractCalendarForBlock(blockId)
            setItems(result.items)
            setNotice(result.warning ? t('calendar.warning.deterministic') : null)
        } catch {
            setNotice(t('calendar.error.updateFromNote'))
        }
    }, [t])

    const validateItem = useCallback(async (id: string): Promise<boolean> => {
        const updated = await window.context.validateCalendarItem(id)
        if (!updated) return false
        setItems((previous) => replaceItem(previous, updated))
        return true
    }, [])

    const resolveItem = useCallback(async (input: ResolveCalendarItemInput): Promise<boolean> => {
        const updated = await window.context.resolveCalendarItem(input)
        if (!updated) return false
        const nextItems = replaceItem(itemsRef.current, updated)
        setItems(nextItems)
        const nextUncertain = nextItems.find(
            (item) => item.status === 'uncertain' && item.deletedAt === undefined && item.id !== updated.id
        )
        setResolutionItemId(nextUncertain?.id ?? null)
        return true
    }, [])

    const updateItem = useCallback(async (input: UpdateCalendarItemInput): Promise<boolean> => {
        const updated = await window.context.updateCalendarItem(input)
        if (!updated) return false
        setItems((previous) => replaceItem(previous, updated))
        return true
    }, [])

    const deleteItem = useCallback(async (id: string): Promise<boolean> => {
        const deleted = await window.context.deleteCalendarItem(id)
        if (!deleted) return false
        setItems((previous) => previous?.filter((item) => item.id !== id))
        setResolutionItemId((previous) => previous === id ? null : previous)
        return true
    }, [])

    const openResolutionQueue = useCallback((id?: string): void => {
        const requested = id
            ? itemsRef.current?.find((item) => item.id === id && item.status === 'uncertain')
            : undefined
        const first = requested ?? itemsRef.current?.find(
            (item) => item.status === 'uncertain' && item.deletedAt === undefined
        )
        setResolutionItemId(first?.id ?? null)
    }, [])

    const closeResolutionQueue = useCallback((): void => setResolutionItemId(null), [])

    const configureGoogle = useCallback(async (
        clientId: string,
        clientSecret: string
    ): Promise<{ ok: boolean; error?: string }> => {
        try {
            await window.context.configureGoogleCalendar(clientId, clientSecret)
            await updateSettings({})
            return { ok: true }
        } catch {
            return { ok: false, error: t('settings.error.googleConfig') }
        }
    }, [t, updateSettings])

    const connectGoogle = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
        try {
            const result = await window.context.connectGoogleCalendar()
            await updateSettings({})
            return result.ok ? { ok: true } : { ok: false, error: result.error }
        } catch {
            return { ok: false, error: t('settings.error.googleConnect') }
        }
    }, [t, updateSettings])

    const disconnectGoogle = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
        try {
            const result = await window.context.disconnectGoogleCalendar()
            await updateSettings({})
            return { ok: result.ok, ...(result.error ? { error: result.error } : {}) }
        } catch {
            return { ok: false, error: t('settings.error.googleDisconnect') }
        }
    }, [t, updateSettings])

    const syncGoogleNow = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
        if (isSyncingRef.current) return { ok: false, error: t('settings.error.googleSyncRunning') }
        isSyncingRef.current = true
        setIsSyncing(true)
        try {
            const result = await window.context.syncGoogleCalendar()
            setItems(result.items)
            setNotice(result.error ?? null)
            await updateSettings({})
            return result.ok ? { ok: true } : { ok: false, error: result.error }
        } catch {
            const message = t('settings.error.googleSync')
            setNotice(message)
            return { ok: false, error: message }
        } finally {
            isSyncingRef.current = false
            setIsSyncing(false)
        }
    }, [t, updateSettings])

    useEffect(() => {
        const googleSettings = settings.googleCalendar
        if (!shouldAutoSyncGoogle(googleSettings)) return
        const timer = window.setInterval(
            () => { void syncGoogleNow() },
            googleSettings.autoSyncMinutes * 60_000
        )
        return () => window.clearInterval(timer)
    }, [settings.googleCalendar, syncGoogleNow])

    const stateValue: CalendarState = useMemo(() => ({
        items,
        isLoading,
        isSyncing,
        resolutionItemId,
        notice
    }), [items, isLoading, isSyncing, resolutionItemId, notice])

    const actionsValue: CalendarActions = useMemo(() => ({
        refreshItems,
        extractBlockCalendar,
        validateItem,
        resolveItem,
        updateItem,
        deleteItem,
        openResolutionQueue,
        closeResolutionQueue,
        configureGoogle,
        connectGoogle,
        disconnectGoogle,
        syncGoogleNow
    }), [
        refreshItems,
        extractBlockCalendar,
        validateItem,
        resolveItem,
        updateItem,
        deleteItem,
        openResolutionQueue,
        closeResolutionQueue,
        configureGoogle,
        connectGoogle,
        disconnectGoogle,
        syncGoogleNow
    ])

    return (
        <CalendarStateContext.Provider value={stateValue}>
            <CalendarActionsContext.Provider value={actionsValue}>
                {children}
            </CalendarActionsContext.Provider>
        </CalendarStateContext.Provider>
    )
}

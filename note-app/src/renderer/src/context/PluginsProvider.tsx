import type { InstalledPlugin, PluginBlockRecord, PluginCatalog, PluginCommandInput, PluginCommandResult, PluginConfig, PluginWizardInterviewInput, PluginWizardInterviewResult, PluginWizardSpec } from '@shared/plugins'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGoalActions, useGoals } from './GoalsContext'
import {
    PluginsActions,
    PluginsActionsContext,
    PluginsState,
    PluginsStateContext
} from './PluginsContext'

const isPluginBlockRecord = (value: unknown): value is PluginBlockRecord => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const record = value as Record<string, unknown>
    if (typeof record.content !== 'string' || typeof record.block !== 'object' || record.block === null) return false
    return typeof (record.block as Record<string, unknown>).id === 'string'
}

export const PluginsProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
    const [plugins, setPlugins] = useState<PluginCatalog['plugins'] | undefined>(undefined)
    const [pluginsPath, setPluginsPath] = useState('')
    const [blocksByPlugin, setBlocksByPlugin] = useState<Record<string, PluginBlockRecord[]>>({})
    const [loadingPluginIds, setLoadingPluginIds] = useState<Set<string>>(() => new Set())
    const [error, setError] = useState<string | null>(null)
    const { selectedPluginId } = useGoals()
    const { selectPlugin } = useGoalActions()
    const selectedPluginIdRef = useRef(selectedPluginId)
    const pluginsRef = useRef(plugins)

    useEffect(() => {
        selectedPluginIdRef.current = selectedPluginId
        pluginsRef.current = plugins
    })

    const applyCatalog = useCallback((catalog: PluginCatalog) => {
        setPlugins(catalog.plugins)
        setPluginsPath(catalog.pluginsPath)
        const enabledIds = new Set(
            catalog.plugins
                .filter((plugin): plugin is InstalledPlugin & { id: string } =>
                    typeof plugin.id === 'string' && plugin.enabled && plugin.valid
                )
                .map((plugin) => plugin.id)
        )
        setBlocksByPlugin((previous) => Object.fromEntries(
            Object.entries(previous).filter(([pluginId]) => enabledIds.has(pluginId))
        ))
    }, [])

    const refreshPlugins = useCallback(async (): Promise<void> => {
        try {
            applyCatalog(await window.context.getPlugins())
            setError(null)
        } catch (refreshError) {
            setError(refreshError instanceof Error ? refreshError.message : 'Could not load plugins.')
        }
    }, [applyCatalog])

    useEffect(() => {
        void refreshPlugins()
    }, [refreshPlugins])

    useEffect(() => {
        if (!selectedPluginId || !plugins) return
        const selected = plugins.find((plugin) => plugin.id === selectedPluginId)
        if (!selected?.enabled || !selected.valid) selectPlugin(null)
    }, [plugins, selectPlugin, selectedPluginId])

    const setPluginEnabled = useCallback(async (
        pluginId: string,
        enabled: boolean
    ): Promise<string | null> => {
        try {
            const result = await window.context.setPluginEnabled(pluginId, enabled)
            applyCatalog(result.catalog)
            if (!enabled && selectedPluginIdRef.current === pluginId) selectPlugin(null)
            setError(result.error ?? null)
            return result.error ?? null
        } catch (mutationError) {
            const message = mutationError instanceof Error ? mutationError.message : 'Could not update this plugin.'
            setError(message)
            return message
        }
    }, [applyCatalog, selectPlugin])

    const setPluginConfig = useCallback(async (
        pluginId: string,
        config: PluginConfig
    ): Promise<string | null> => {
        try {
            const result = await window.context.setPluginConfig(pluginId, config)
            applyCatalog(result.catalog)
            setError(result.error ?? null)
            return result.error ?? null
        } catch (mutationError) {
            const message = mutationError instanceof Error ? mutationError.message : 'Could not save plugin configuration.'
            setError(message)
            return message
        }
    }, [applyCatalog])

    const removePlugin = useCallback(async (folderName: string): Promise<string | null> => {
        const pluginId = pluginsRef.current?.find((plugin) => plugin.folderName === folderName)?.id
        try {
            const result = await window.context.removePlugin(folderName)
            applyCatalog(result.catalog)
            if (pluginId && selectedPluginIdRef.current === pluginId) selectPlugin(null)
            setError(result.error ?? null)
            return result.error ?? null
        } catch (mutationError) {
            const message = mutationError instanceof Error ? mutationError.message : 'Could not remove this plugin.'
            setError(message)
            return message
        }
    }, [applyCatalog, selectPlugin])

    const openPluginsFolder = useCallback(async (): Promise<string | null> => {
        try {
            const result = await window.context.openPluginsFolder()
            if (result.ok) return null
            setError(result.error)
            return result.error
        } catch (openError) {
            const message = openError instanceof Error ? openError.message : 'Could not open the plugins folder.'
            setError(message)
            return message
        }
    }, [])

    const refreshPluginBlocks = useCallback(async (pluginId: string): Promise<void> => {
        setLoadingPluginIds((previous) => new Set(previous).add(pluginId))
        try {
            const result = await window.context.callPluginHost(pluginId, {
                method: 'blocks.list',
                filter: { limit: 100 }
            })
            if (!result.ok) {
                setError(result.error)
                return
            }
            const records = result.value
            if (!Array.isArray(records) || !records.every(isPluginBlockRecord)) {
                setError('The plugin returned an invalid block list.')
                return
            }
            setBlocksByPlugin((previous) => ({
                ...previous,
                [pluginId]: records as PluginBlockRecord[]
            }))
            setError(null)
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Could not load plugin notes.')
        } finally {
            setLoadingPluginIds((previous) => {
                const next = new Set(previous)
                next.delete(pluginId)
                return next
            })
        }
    }, [])

    const runPluginCommand = useCallback(async (
        pluginId: string,
        command: string,
        input: PluginCommandInput
    ): Promise<PluginCommandResult> => {
        let result: PluginCommandResult
        try {
            result = await window.context.runPluginCommand(pluginId, command, input)
        } catch (commandError) {
            result = {
                ok: false,
                error: commandError instanceof Error ? commandError.message : 'Plugin action failed.'
            }
        }
        if (result.ok) {
            await Promise.all([refreshPluginBlocks(pluginId), refreshPlugins()])
        } else {
            setError(result.error)
        }
        return result
    }, [refreshPluginBlocks, refreshPlugins])

    const interviewPluginWizard = useCallback(async (
        input: PluginWizardInterviewInput
    ): Promise<PluginWizardInterviewResult> => {
        try {
            const result = await window.context.interviewPluginWizard(input)
            setError(result.status === 'error' ? result.error : null)
            return result
        } catch (interviewError) {
            const message = interviewError instanceof Error
                ? interviewError.message
                : 'The AI plugin interview failed.'
            setError(message)
            return { status: 'error', error: message }
        }
    }, [])

    const createGeneratedPlugin = useCallback(async (
        spec: PluginWizardSpec,
        revision?: string
    ): Promise<{ error?: string; pluginId?: string; folderName?: string }> => {
        try {
            const result = await window.context.createGeneratedPlugin({
                spec,
                confirmed: true,
                ...(revision ? { revision } : {})
            })
            applyCatalog(result.catalog)
            setError(result.error ?? null)
            return {
                ...(result.error ? { error: result.error } : {}),
                ...(result.pluginId ? { pluginId: result.pluginId } : {}),
                ...(result.folderName ? { folderName: result.folderName } : {})
            }
        } catch (creationError) {
            const message = creationError instanceof Error
                ? creationError.message
                : 'The generated plugin could not be installed.'
            setError(message)
            return { error: message }
        }
    }, [applyCatalog])

    const stateValue: PluginsState = useMemo(() => ({
        plugins,
        pluginsPath,
        blocksByPlugin,
        loadingPluginIds,
        error
    }), [plugins, pluginsPath, blocksByPlugin, loadingPluginIds, error])

    const actionsValue: PluginsActions = useMemo(() => ({
        refreshPlugins,
        setPluginEnabled,
        setPluginConfig,
        removePlugin,
        openPluginsFolder,
        refreshPluginBlocks,
        runPluginCommand,
        interviewPluginWizard,
        createGeneratedPlugin
    }), [refreshPlugins, setPluginEnabled, setPluginConfig, removePlugin, openPluginsFolder, refreshPluginBlocks, runPluginCommand, interviewPluginWizard, createGeneratedPlugin])

    return (
        <PluginsStateContext.Provider value={stateValue}>
            <PluginsActionsContext.Provider value={actionsValue}>
                {children}
            </PluginsActionsContext.Provider>
        </PluginsStateContext.Provider>
    )
}

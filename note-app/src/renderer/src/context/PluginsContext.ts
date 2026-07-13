import type {
    InstalledPlugin,
    PluginBlockRecord,
    PluginCommandInput,
    PluginCommandResult,
    PluginConfig,
    PluginWizardInterviewInput,
    PluginWizardInterviewResult,
    PluginWizardSpec
} from '@shared/plugins'
import { createContext, useContext } from 'react'

export type PluginsState = {
    plugins: InstalledPlugin[] | undefined
    pluginsPath: string
    blocksByPlugin: Readonly<Record<string, PluginBlockRecord[]>>
    loadingPluginIds: ReadonlySet<string>
    error: string | null
}

export type PluginsActions = {
    refreshPlugins: () => Promise<void>
    setPluginEnabled: (pluginId: string, enabled: boolean) => Promise<string | null>
    setPluginConfig: (pluginId: string, config: PluginConfig) => Promise<string | null>
    removePlugin: (folderName: string) => Promise<string | null>
    openPluginsFolder: () => Promise<string | null>
    refreshPluginBlocks: (pluginId: string) => Promise<void>
    runPluginCommand: (
        pluginId: string,
        command: string,
        input: PluginCommandInput
    ) => Promise<PluginCommandResult>
    interviewPluginWizard: (input: PluginWizardInterviewInput) => Promise<PluginWizardInterviewResult>
    createGeneratedPlugin: (
        spec: PluginWizardSpec,
        revision?: string
    ) => Promise<{ error?: string; pluginId?: string; folderName?: string }>
}

export const PluginsStateContext = createContext<PluginsState | null>(null)
export const PluginsActionsContext = createContext<PluginsActions | null>(null)

export const usePlugins = (): PluginsState => {
    const state = useContext(PluginsStateContext)
    if (!state) throw new Error('usePlugins must be used within a PluginsProvider')
    return state
}

export const usePluginActions = (): PluginsActions => {
    const actions = useContext(PluginsActionsContext)
    if (!actions) throw new Error('usePluginActions must be used within a PluginsProvider')
    return actions
}

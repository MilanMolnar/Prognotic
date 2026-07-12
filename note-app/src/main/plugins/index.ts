import dietaryEntryAsset from '../../../resources/plugins/dietary/index.cjs?asset'
import dietaryManifestTemplate from '../../../resources/plugins/dietary/plugin.json'
import { pluginStateFileName, pluginsDirectoryName } from '@shared/constants'
import { countUnvisitedBlocksForGoal } from '@shared/goalPresence'
import type {
    InstalledPlugin,
    PluginCatalog,
    PluginCommandInput,
    PluginCommandResult,
    PluginConfig,
    PluginHostCallResult,
    PluginHostRequest,
    PluginManifest,
    PluginMutationResult,
    PluginNotification
} from '@shared/plugins'
import { pluginUiActionPrompt, pluginUiDeclaredCommands } from '@shared/plugins'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createRequire } from 'node:module'
import { dirname, join, resolve, sep } from 'node:path'
import { copyFile, ensureDir, pathExists, readFile, readdir, remove, stat, writeFile } from 'fs-extra'
import {
    acknowledgeBlockInGoal,
    appendToBlock,
    createBlock,
    deleteBlockIfEmpty,
    deleteBlockPermanently,
    getBlocks,
    getRootDir,
    readBlock,
    setPluginBlockPresence,
    updateBlockCategories,
    writeBlock,
    writeJsonAtomic
} from '@/lib'
import { completePluginAi } from '../llm/router'
import {
    createPluginHostApi,
    invokePluginHost,
    NoteBlockPluginHostApi,
    pluginCategoryId,
    PluginHostDependencies
} from './hostApi'
import {
    normalizePersistedPluginConfig,
    validatePluginConfig,
    validatePluginManifest
} from './manifest'
import { getPluginStorageValue, setPluginStorageValue } from './storage'

type PluginStateFile = {
    version: 1
    enabledPluginIds: string[]
    config: Record<string, PluginConfig>
    seededPluginIds: string[]
}

type DiscoveredPlugin = {
    folderName: string
    folderPath: string
    id: string | null
    name: string
    version: string
    description: string
    manifest?: PluginManifest
    sourceFingerprint?: string
    invalidReason?: string
}

type PluginCommand = (input: PluginCommandInput) => unknown | Promise<unknown>

type PluginRegistration = {
    commands?: Record<string, PluginCommand>
    deactivate?: () => unknown | Promise<unknown>
}

type PluginModule = {
    activate?: (host: NoteBlockPluginHostApi) => PluginRegistration | void | Promise<PluginRegistration | void>
    default?: {
        activate?: (host: NoteBlockPluginHostApi) => PluginRegistration | void | Promise<PluginRegistration | void>
    }
}

type LoadedPlugin = {
    folderName: string
    host: NoteBlockPluginHostApi
    commands: Record<string, PluginCommand>
    deactivate?: () => unknown | Promise<unknown>
    requirePlugin: NodeRequire
    resolvedEntry: string
    sourceFingerprint: string
}

type PluginExecutionContext = {
    pluginId: string
    command?: string
    notifications: PluginNotification[]
}

const pluginExecutionContext = new AsyncLocalStorage<PluginExecutionContext>()

const emptyPluginState = (): PluginStateFile => ({
    version: 1,
    enabledPluginIds: [],
    config: {},
    seededPluginIds: []
})

const pluginDirectory = (): string => join(getRootDir(), pluginsDirectoryName)
const pluginStatePath = (): string => join(getRootDir(), pluginStateFileName)

let stateLock: Promise<unknown> = Promise.resolve()
const withPluginStateLock = <T>(task: () => Promise<T>): Promise<T> => {
    const run = stateLock.then(task, task)
    stateLock = run.catch(() => undefined)
    return run
}

const readPluginState = async (): Promise<PluginStateFile> => {
    try {
        const parsed = JSON.parse(await readFile(pluginStatePath(), 'utf8')) as Partial<PluginStateFile>
        return {
            version: 1,
            enabledPluginIds: Array.isArray(parsed.enabledPluginIds)
                ? [...new Set(parsed.enabledPluginIds.filter((id): id is string => typeof id === 'string'))]
                : [],
            config: parsed.config && typeof parsed.config === 'object' && !Array.isArray(parsed.config)
                ? parsed.config
                : {},
            seededPluginIds: Array.isArray(parsed.seededPluginIds)
                ? [...new Set(parsed.seededPluginIds.filter((id): id is string => typeof id === 'string'))]
                : []
        }
    } catch {
        return emptyPluginState()
    }
}

const updatePluginState = async (
    update: (state: PluginStateFile) => PluginStateFile | Promise<PluginStateFile>
): Promise<PluginStateFile> => withPluginStateLock(async () => {
    const state = await readPluginState()
    const next = await update(state)
    await ensureDir(getRootDir())
    await writeJsonAtomic(pluginStatePath(), next)
    return next
})

let setupPromise: Promise<void> | null = null
const ensurePluginEnvironment = (): Promise<void> => {
    if (setupPromise) return setupPromise
    setupPromise = (async () => {
        await ensureDir(pluginDirectory())
        const state = await readPluginState()
        if (state.seededPluginIds.includes('dietary')) return

        const destination = join(pluginDirectory(), 'dietary')
        if (!(await pathExists(destination))) {
            await ensureDir(destination)
            await Promise.all([
                writeFile(
                    join(destination, 'plugin.json'),
                    JSON.stringify(dietaryManifestTemplate, null, 2),
                    'utf8'
                ),
                copyFile(dietaryEntryAsset, join(destination, 'index.cjs'))
            ])
        }
        await updatePluginState((current) => ({
            ...current,
            seededPluginIds: [...new Set([...current.seededPluginIds, 'dietary'])]
        }))
    })().catch((error) => {
        setupPromise = null
        throw error
    })
    return setupPromise
}

const rawLabel = (raw: unknown, field: string, fallback: string): string => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fallback
    const value = (raw as Record<string, unknown>)[field]
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, 500) : fallback
}

const discoverPlugins = async (): Promise<DiscoveredPlugin[]> => {
    await ensurePluginEnvironment()
    const entries = (await readdir(pluginDirectory(), { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name))

    const discovered = await Promise.all(entries.map(async (entry): Promise<DiscoveredPlugin> => {
        const folderPath = join(pluginDirectory(), entry.name)
        const manifestPath = join(folderPath, 'plugin.json')
        let raw: unknown
        let manifestMtimeMs = 0
        try {
            const manifestStats = await stat(manifestPath)
            if (!manifestStats.isFile() || manifestStats.size > 256_000) {
                throw new Error('plugin.json must be a file smaller than 256 KB.')
            }
            manifestMtimeMs = manifestStats.mtimeMs
            raw = JSON.parse(await readFile(manifestPath, 'utf8'))
        } catch (error) {
            const fileError = error as NodeJS.ErrnoException
            return {
                folderName: entry.name,
                folderPath,
                id: null,
                name: entry.name,
                version: 'Unknown',
                description: '',
                invalidReason: error instanceof SyntaxError
                    ? 'plugin.json contains invalid JSON.'
                    : fileError.code === 'ENOENT'
                        ? 'plugin.json is missing.'
                        : error instanceof Error ? error.message : 'plugin.json could not be read.'
            }
        }

        const validation = validatePluginManifest(raw)
        if (!validation.manifest) {
            return {
                folderName: entry.name,
                folderPath,
                id: rawLabel(raw, 'id', '') || null,
                name: rawLabel(raw, 'name', entry.name),
                version: rawLabel(raw, 'version', 'Unknown'),
                description: rawLabel(raw, 'description', ''),
                invalidReason: validation.error
            }
        }

        const entryPath = resolve(folderPath, validation.manifest.entry)
        const resolvedFolder = resolve(folderPath)
        if (!entryPath.startsWith(`${resolvedFolder}${sep}`)) {
            return {
                folderName: entry.name,
                folderPath,
                id: validation.manifest.id,
                name: validation.manifest.name,
                version: validation.manifest.version,
                description: validation.manifest.description,
                invalidReason: 'Manifest entry must stay inside the plugin folder.'
            }
        }
        let entryMtimeMs = 0
        try {
            const entryStats = await stat(entryPath)
            if (!entryStats.isFile()) throw new Error()
            entryMtimeMs = entryStats.mtimeMs
        } catch {
            return {
                folderName: entry.name,
                folderPath,
                id: validation.manifest.id,
                name: validation.manifest.name,
                version: validation.manifest.version,
                description: validation.manifest.description,
                invalidReason: `Entry file "${validation.manifest.entry}" is missing.`
            }
        }

        return {
            folderName: entry.name,
            folderPath,
            id: validation.manifest.id,
            name: validation.manifest.name,
            version: validation.manifest.version,
            description: validation.manifest.description,
            manifest: validation.manifest,
            sourceFingerprint: `${manifestMtimeMs}:${entryMtimeMs}`
        }
    }))

    // Discovery order is lexical and the first valid manifest wins. Invalid
    // folders never reserve an id, while later valid duplicates remain listed
    // with an actionable error and cannot be enabled.
    const winnerById = new Map<string, string>()
    for (const plugin of discovered) {
        if (!plugin.manifest || plugin.invalidReason) continue
        const winner = winnerById.get(plugin.manifest.id)
        if (winner) {
            plugin.invalidReason = `Duplicate plugin id "${plugin.manifest.id}"; folder "${winner}" wins.`
            continue
        }
        winnerById.set(plugin.manifest.id, plugin.folderName)
    }

    return discovered
}

const hostDependencies: PluginHostDependencies = {
    getBlocks,
    readBlock,
    createBlock,
    writeBlock,
    deleteBlock: deleteBlockPermanently,
    deleteBlockIfEmpty,
    updateBlockCategories,
    appendToBlock,
    setPresence: setPluginBlockPresence,
    acknowledgePresence: acknowledgeBlockInGoal,
    complete: completePluginAi,
    storageGet: getPluginStorageValue,
    storageSet: setPluginStorageValue,
    notify: (pluginId, notification) => {
        const context = pluginExecutionContext.getStore()
        if (context?.pluginId === pluginId && context.notifications.length < 20) {
            context.notifications.push(notification)
        }
    }
}

const loadedPlugins = new Map<string, LoadedPlugin>()
const runtimeErrors = new Map<string, string>()
let runtimeLock: Promise<unknown> = Promise.resolve()
const withPluginRuntimeLock = <T>(task: () => Promise<T>): Promise<T> => {
    const run = runtimeLock.then(task, task)
    runtimeLock = run.catch(() => undefined)
    return run
}

const hostFor = (plugin: DiscoveredPlugin): NoteBlockPluginHostApi => {
    if (!plugin.manifest) throw new Error('Plugin manifest is unavailable.')
    const manifest = plugin.manifest
    return createPluginHostApi({
        pluginId: manifest.id,
        canUseAi: manifest.permissions?.ai === true,
        pluginSystemPrompt: manifest.ai?.systemPrompt,
        getActionSystemPrompt: () => {
            const context = pluginExecutionContext.getStore()
            if (!context || context.pluginId !== manifest.id || !context.command) return undefined
            return pluginUiActionPrompt(manifest.ui, context.command)
        },
        getConfig: async () => {
            const state = await readPluginState()
            return normalizePersistedPluginConfig(
                manifest.configSchema,
                state.config[manifest.id]
            )
        },
        dependencies: hostDependencies
    })
}

const activatePlugin = async (plugin: DiscoveredPlugin): Promise<void> => {
    if (!plugin.manifest) throw new Error('Plugin manifest is unavailable.')
    const requirePlugin = createRequire(join(plugin.folderPath, 'plugin.json'))
    const resolvedEntry = requirePlugin.resolve(resolve(plugin.folderPath, plugin.manifest.entry))
    delete requirePlugin.cache[resolvedEntry]
    const module = requirePlugin(resolvedEntry) as PluginModule
    const activate = module.activate ?? module.default?.activate
    if (typeof activate !== 'function') throw new Error('Entry must export an activate(host) function.')

    const host = hostFor(plugin)
    let activationTimer: NodeJS.Timeout | undefined
    const registration = await Promise.race([
        activate(host),
        new Promise<never>((_, reject) => {
            activationTimer = setTimeout(
                () => reject(new Error('Plugin activation timed out.')),
                10_000
            )
        })
    ]).finally(() => {
        if (activationTimer) clearTimeout(activationTimer)
    })
    if (registration !== undefined && (typeof registration !== 'object' || registration === null)) {
        throw new Error('activate(host) must return a registration object or nothing.')
    }
    const commands = registration?.commands ?? {}
    for (const [command, handler] of Object.entries(commands)) {
        if (!/^[a-z][a-zA-Z0-9._-]{0,79}$/.test(command) || typeof handler !== 'function') {
            throw new Error(`Plugin registered an invalid command: ${command}`)
        }
    }
    const declaredCommands = pluginUiDeclaredCommands(plugin.manifest.ui)
    const missingCommand = declaredCommands.find((command) => typeof commands[command] !== 'function')
    if (missingCommand) throw new Error(`UI command "${missingCommand}" is not registered by the plugin entry.`)

    loadedPlugins.set(plugin.manifest.id, {
        folderName: plugin.folderName,
        host,
        commands,
        deactivate: registration?.deactivate,
        requirePlugin,
        resolvedEntry,
        sourceFingerprint: plugin.sourceFingerprint ?? ''
    })
    runtimeErrors.delete(plugin.folderName)
}

const deactivatePlugin = async (pluginId: string): Promise<void> => {
    const loaded = loadedPlugins.get(pluginId)
    if (!loaded) return
    loadedPlugins.delete(pluginId)
    try {
        await loaded.deactivate?.()
    } catch {
        // A plugin cannot veto being disabled or removed.
    } finally {
        delete loaded.requirePlugin.cache[loaded.resolvedEntry]
    }
}

const syncLoadedPlugins = async (
    discovered: DiscoveredPlugin[],
    state: PluginStateFile
): Promise<void> => withPluginRuntimeLock(async () => {
    const available = new Map(
        discovered
            .filter((plugin): plugin is DiscoveredPlugin & { manifest: PluginManifest } =>
                plugin.manifest !== undefined && plugin.invalidReason === undefined
            )
            .map((plugin) => [plugin.manifest.id, plugin])
    )
    const enabled = new Set(state.enabledPluginIds)

    for (const [pluginId, loaded] of loadedPlugins) {
        const current = available.get(pluginId)
        if (
            !enabled.has(pluginId) ||
            !current ||
            current.folderName !== loaded.folderName ||
            (current.sourceFingerprint ?? '') !== loaded.sourceFingerprint
        ) {
            await deactivatePlugin(pluginId)
        }
    }

    for (const pluginId of enabled) {
        const plugin = available.get(pluginId)
        if (!plugin || loadedPlugins.has(pluginId) || runtimeErrors.has(plugin.folderName)) continue
        try {
            await activatePlugin(plugin)
        } catch (error) {
            runtimeErrors.set(
                plugin.folderName,
                error instanceof Error ? error.message : 'Plugin entry could not start.'
            )
        }
    }
})

const buildCatalog = async (
    discovered: DiscoveredPlugin[],
    state: PluginStateFile
): Promise<PluginCatalog> => {
    const blocks = await getBlocks()
    const plugins: InstalledPlugin[] = discovered.map((plugin) => {
        const runtimeError = runtimeErrors.get(plugin.folderName)
        const metadataValid = plugin.manifest !== undefined && plugin.invalidReason === undefined
        const id = plugin.manifest?.id ?? plugin.id
        const categoryId = id && metadataValid ? pluginCategoryId(id) : undefined
        return {
            folderName: plugin.folderName,
            id,
            name: plugin.name,
            version: plugin.version,
            description: plugin.description,
            valid: metadataValid && runtimeError === undefined,
            enabled: id !== null && state.enabledPluginIds.includes(id),
            ...(plugin.invalidReason || runtimeError
                ? { reason: plugin.invalidReason ?? `Plugin could not start: ${runtimeError}` }
                : {}),
            ...(categoryId ? { categoryId } : {}),
            ...(metadataValid
                ? { sidebar: plugin.manifest?.sidebar ?? { label: plugin.name, icon: 'puzzle' } }
                : {}),
            configSchema: plugin.manifest?.configSchema ?? [],
            config: normalizePersistedPluginConfig(
                plugin.manifest?.configSchema,
                id ? state.config[id] : undefined
            ),
            ...(plugin.manifest?.ui ? { ui: plugin.manifest.ui } : {}),
            badgeCount: categoryId ? countUnvisitedBlocksForGoal(blocks, categoryId) : 0
        }
    })
    return { pluginsPath: pluginDirectory(), plugins }
}

let catalogLock: Promise<unknown> = Promise.resolve()
const withPluginCatalogLock = <T>(task: () => Promise<T>): Promise<T> => {
    const run = catalogLock.then(task, task)
    catalogLock = run.catch(() => undefined)
    return run
}

const loadPluginCatalog = async (): Promise<PluginCatalog> => {
    const [discovered, state] = await Promise.all([discoverPlugins(), readPluginState()])
    await syncLoadedPlugins(discovered, state)
    return buildCatalog(discovered, state)
}

export const getPluginCatalog = async (): Promise<PluginCatalog> =>
    withPluginCatalogLock(loadPluginCatalog)

export const refreshPluginCatalog = async (): Promise<PluginCatalog> => withPluginCatalogLock(async () => {
    await withPluginRuntimeLock(async () => {
        runtimeErrors.clear()
    })
    return loadPluginCatalog()
})

export const initializePlugins = async (): Promise<void> => {
    await getPluginCatalog()
}

const mutationFailure = async (error: string): Promise<PluginMutationResult> => ({
    catalog: await getPluginCatalog(),
    error
})

export const setPluginEnabled = async (
    pluginId: string,
    enabled: boolean
): Promise<PluginMutationResult> => {
    const discovered = await discoverPlugins()
    if (!enabled) {
        await updatePluginState((state) => ({
            ...state,
            enabledPluginIds: state.enabledPluginIds.filter((id) => id !== pluginId)
        }))
        const installed = discovered.find((candidate) => candidate.id === pluginId)
        if (installed) runtimeErrors.delete(installed.folderName)
        await withPluginRuntimeLock(() => deactivatePlugin(pluginId))
        return { catalog: await getPluginCatalog() }
    }

    const plugin = discovered.find((candidate) =>
        candidate.manifest?.id === pluginId && candidate.invalidReason === undefined
    )
    if (!plugin?.manifest) return mutationFailure('This plugin is invalid and cannot be enabled.')

    runtimeErrors.delete(plugin.folderName)
    const state = await updatePluginState((current) => ({
        ...current,
        enabledPluginIds: [...new Set([...current.enabledPluginIds, pluginId])]
    }))
    await syncLoadedPlugins(discovered, state)
    const runtimeError = runtimeErrors.get(plugin.folderName)
    if (runtimeError) {
        await updatePluginState((current) => ({
            ...current,
            enabledPluginIds: current.enabledPluginIds.filter((id) => id !== pluginId)
        }))
        return mutationFailure(`Plugin could not start: ${runtimeError}`)
    }
    return { catalog: await getPluginCatalog() }
}

export const setPluginConfig = async (
    pluginId: string,
    config: PluginConfig
): Promise<PluginMutationResult> => {
    const discovered = await discoverPlugins()
    const plugin = discovered.find((candidate) =>
        candidate.manifest?.id === pluginId && candidate.invalidReason === undefined
    )
    if (!plugin?.manifest) return mutationFailure('This plugin is invalid and cannot be configured.')
    const validation = validatePluginConfig(plugin.manifest.configSchema, config)
    if (!validation.config) return mutationFailure(validation.error)

    await updatePluginState((state) => ({
        ...state,
        config: { ...state.config, [pluginId]: validation.config }
    }))
    return { catalog: await getPluginCatalog() }
}

export const removePlugin = async (folderName: string): Promise<PluginMutationResult> => {
    const discovered = await discoverPlugins()
    const plugin = discovered.find((candidate) => candidate.folderName === folderName)
    if (!plugin) return mutationFailure('The plugin folder no longer exists.')

    const target = resolve(pluginDirectory(), folderName)
    if (dirname(target) !== resolve(pluginDirectory())) {
        return mutationFailure('The plugin folder path is invalid.')
    }
    const activeId = plugin.manifest?.id ?? plugin.id
    const hasAnotherOwner = activeId !== null && discovered.some((candidate) =>
        candidate.folderName !== folderName &&
        candidate.manifest?.id === activeId &&
        candidate.invalidReason === undefined
    )
    if (activeId && !hasAnotherOwner) {
        if (loadedPlugins.get(activeId)?.folderName === folderName) {
            await withPluginRuntimeLock(() => deactivatePlugin(activeId))
        }
        await updatePluginState((state) => {
            const nextConfig = { ...state.config }
            delete nextConfig[activeId]
            return {
                ...state,
                enabledPluginIds: state.enabledPluginIds.filter((id) => id !== activeId),
                config: nextConfig
            }
        })
    }
    runtimeErrors.delete(folderName)
    await remove(target)
    return { catalog: await getPluginCatalog() }
}

const getEnabledPlugin = async (pluginId: string): Promise<LoadedPlugin> => {
    const [discovered, state] = await Promise.all([discoverPlugins(), readPluginState()])
    if (!state.enabledPluginIds.includes(pluginId)) throw new Error('Enable this plugin before using it.')
    await syncLoadedPlugins(discovered, state)
    const loaded = loadedPlugins.get(pluginId)
    if (!loaded) {
        const plugin = discovered.find((candidate) => candidate.manifest?.id === pluginId)
        throw new Error(plugin?.invalidReason ?? runtimeErrors.get(plugin?.folderName ?? '') ?? 'Plugin is unavailable.')
    }
    return loaded
}

const commandValue = (raw: unknown): { message?: string; blockId?: string } | undefined => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
    const source = raw as Record<string, unknown>
    const value = {
        ...(typeof source.message === 'string' ? { message: source.message.slice(0, 500) } : {}),
        ...(typeof source.blockId === 'string' ? { blockId: source.blockId.slice(0, 100) } : {})
    }
    return Object.keys(value).length > 0 ? value : undefined
}

export const runPluginCommand = async (
    pluginId: string,
    command: string,
    input: PluginCommandInput
): Promise<PluginCommandResult> => {
    try {
        const loaded = await getEnabledPlugin(pluginId)
        const handler = loaded.commands[command]
        if (!handler) return { ok: false, error: `Plugin command "${command}" is unavailable.` }
        if ((input.text?.length ?? 0) > 100_000 || (input.content?.length ?? 0) > 1_000_000) {
            return { ok: false, error: 'Plugin command input is too large.' }
        }
        const notifications: PluginNotification[] = []
        const value = commandValue(await pluginExecutionContext.run(
            { pluginId, command, notifications },
            () => handler({ ...input })
        ))
        return {
            ok: true,
            ...(value ? { value } : {}),
            ...(notifications.length > 0 ? { notifications } : {})
        }
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Plugin command failed.' }
    }
}

export const callPluginHost = async (
    pluginId: string,
    request: PluginHostRequest
): Promise<PluginHostCallResult> => {
    try {
        const loaded = await getEnabledPlugin(pluginId)
        return { ok: true, value: await invokePluginHost(loaded.host, request) }
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Plugin host call failed.' }
    }
}

export const ensurePluginsDirectory = async (): Promise<string> => {
    await ensurePluginEnvironment()
    return pluginDirectory()
}

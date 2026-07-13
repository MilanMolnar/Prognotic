import { pluginStateFileName } from '@shared/constants'
import { ensureDir, readFile } from 'fs-extra'
import { join } from 'node:path'
import { getRootDir, writeJsonAtomic } from '../lib'
import {
    emptyPluginState,
    normalizePluginState,
    type PluginStateFile
} from './stateModel'

export { emptyPluginState, normalizePluginState, type PluginStateFile } from './stateModel'

const pluginStatePath = (): string => join(getRootDir(), pluginStateFileName)

export const readPluginState = async (): Promise<PluginStateFile> => {
    try {
        return normalizePluginState(JSON.parse(await readFile(pluginStatePath(), 'utf8')))
    } catch {
        return emptyPluginState()
    }
}

let stateLock: Promise<unknown> = Promise.resolve()

export const updatePluginState = async (
    update: (state: PluginStateFile) => PluginStateFile | Promise<PluginStateFile>
): Promise<PluginStateFile> => {
    const task = async (): Promise<PluginStateFile> => {
        const next = await update(await readPluginState())
        await ensureDir(getRootDir())
        await writeJsonAtomic(pluginStatePath(), next)
        return next
    }
    const run = stateLock.then(task, task)
    stateLock = run.catch(() => undefined)
    return run
}

export const recordAiGeneratedPlugin = async (
    pluginId: string,
    folderName: string
): Promise<void> => {
    await updatePluginState((state) => ({
        ...state,
        aiGeneratedPlugins: {
            ...state.aiGeneratedPlugins,
            [pluginId]: { folderName, createdAt: Date.now() }
        }
    }))
}

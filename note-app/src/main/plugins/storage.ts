import { pluginDataDirectoryName } from '@shared/constants'
import type { PluginStorageValue } from '@shared/plugins'
import { ensureDir, readFile } from 'fs-extra'
import { join } from 'node:path'
import { getRootDir, writeJsonAtomic } from '@/lib'

type PluginDataFile = {
    version: 1
    values: Record<string, PluginStorageValue>
}

const maxPluginDataBytes = 256_000
const maxPluginDataKeys = 128

const dataDirectory = (): string => join(getRootDir(), pluginDataDirectoryName)
const dataPath = (pluginId: string): string => join(dataDirectory(), `${pluginId}.json`)

const emptyData = (): PluginDataFile => ({ version: 1, values: {} })

const readPluginData = async (pluginId: string): Promise<PluginDataFile> => {
    try {
        const raw = await readFile(dataPath(pluginId), 'utf8')
        if (Buffer.byteLength(raw, 'utf8') > maxPluginDataBytes) return emptyData()
        const parsed = JSON.parse(raw) as Partial<PluginDataFile>
        if (!parsed.values || typeof parsed.values !== 'object' || Array.isArray(parsed.values)) {
            return emptyData()
        }
        return { version: 1, values: parsed.values }
    } catch {
        return emptyData()
    }
}

let storageLock: Promise<unknown> = Promise.resolve()
const withStorageLock = <T>(task: () => Promise<T>): Promise<T> => {
    const run = storageLock.then(task, task)
    storageLock = run.catch(() => undefined)
    return run
}

export const getPluginStorageValue = async (
    pluginId: string,
    key: string
): Promise<PluginStorageValue | null> => withStorageLock(async () => {
    const data = await readPluginData(pluginId)
    return Object.hasOwn(data.values, key) ? data.values[key] : null
})

export const setPluginStorageValue = async (
    pluginId: string,
    key: string,
    value: PluginStorageValue
): Promise<boolean> => withStorageLock(async () => {
    const data = await readPluginData(pluginId)
    const values = { ...data.values, [key]: value }
    if (Object.keys(values).length > maxPluginDataKeys) {
        throw new Error('Plugin storage supports at most 128 keys.')
    }
    const next: PluginDataFile = { version: 1, values }
    if (Buffer.byteLength(JSON.stringify(next, null, 2), 'utf8') > maxPluginDataBytes) {
        throw new Error('Plugin storage is full.')
    }
    await ensureDir(dataDirectory())
    await writeJsonAtomic(dataPath(pluginId), next)
    return true
})

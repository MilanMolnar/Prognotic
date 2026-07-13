import type { PluginConfig } from '@shared/plugins'

export type AiGeneratedPluginOrigin = {
    folderName: string
    createdAt: number
}

export type PluginStateFile = {
    version: 1
    enabledPluginIds: string[]
    config: Record<string, PluginConfig>
    seededPluginIds: string[]
    aiGeneratedPlugins: Record<string, AiGeneratedPluginOrigin>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const uniqueStrings = (value: unknown): string[] => Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string'))]
    : []

const pluginSlugPattern = /^[a-z][a-z0-9-]{0,63}$/

export const emptyPluginState = (): PluginStateFile => ({
    version: 1,
    enabledPluginIds: [],
    config: {},
    seededPluginIds: [],
    aiGeneratedPlugins: {}
})

export const normalizePluginState = (raw: unknown): PluginStateFile => {
    if (!isRecord(raw)) return emptyPluginState()

    const aiGeneratedPlugins = isRecord(raw.aiGeneratedPlugins)
        ? Object.fromEntries(Object.entries(raw.aiGeneratedPlugins).flatMap(([pluginId, origin]) => {
            if (!isRecord(origin)) return []
            const folderName = typeof origin.folderName === 'string'
                ? origin.folderName.trim()
                : ''
            if (!pluginSlugPattern.test(pluginId) || !pluginSlugPattern.test(folderName)) {
                return []
            }
            return [[pluginId, {
                folderName,
                createdAt: typeof origin.createdAt === 'number' && Number.isFinite(origin.createdAt)
                    ? origin.createdAt
                    : 0
            } satisfies AiGeneratedPluginOrigin]]
        }))
        : {}

    return {
        version: 1,
        enabledPluginIds: uniqueStrings(raw.enabledPluginIds),
        config: isRecord(raw.config) ? raw.config as Record<string, PluginConfig> : {},
        seededPluginIds: uniqueStrings(raw.seededPluginIds),
        aiGeneratedPlugins
    }
}

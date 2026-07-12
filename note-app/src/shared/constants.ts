import { AppSettings, DictationMode } from "./models"

export const appDirectory = "NoteMark"
export const fileEncoding = "utf8"
export const autoSavingTime = 3000
export const indexFileName = "index.json"
export const settingsFileName = "settings.json"
export const goalsFileName = "goals.json"
export const pluginsDirectoryName = "plugins"
export const pluginStateFileName = "plugin-state.json"
export const pluginDataDirectoryName = "plugin-data"
// BlockMeta.categories entries: null = Quick Notes (unassigned), the constant
// below = the pinned Research system topic, anything else = a Goal id.
export const researchCategory = "research"
export const excerptMaxLength = 80
export const maxPinnedGoals = 3
export const defaultDictationModeForPlatform = (platform: NodeJS.Platform): DictationMode => {
    if (platform === 'win32') return 'windows'
    if (platform === 'darwin') return 'macos'
    return 'whisprflow'
}

export const defaultSettings: AppSettings = {
    blockWindowMinutes: 5,
    pinnedGoalIds: [],
    captureMode: "chat",
    // Main replaces this neutral cross-platform baseline with the native
    // platform default before settings reach the renderer.
    dictationMode: "whisprflow",
    llm: {
        provider: 'gemini',
        model: '',
        imageRecognitionModel: '',
        localBaseUrl: 'http://127.0.0.1:1234',
        polishDictation: false,
        aiBlockNameSummary: false,
    },
    hasWhisprflowApiKey: false,
    hasGeminiApiKey: false,
    hasOpenaiApiKey: false,
    hasAnthropicApiKey: false,
    hasLocalApiToken: false,
}

import { AppSettings, DictationMode } from "./models"

export const appDirectory = "NoteMark"
export const fileEncoding = "utf8"
export const autoSavingTime = 3000
export const indexFileName = "index.json"
export const settingsFileName = "settings.json"
export const goalsFileName = "goals.json"
export const calendarFileName = "calendar.json"
export const glossaryFileName = "glossary.json"
export const pluginsDirectoryName = "plugins"
export const pluginStateFileName = "plugin-state.json"
export const pluginDataDirectoryName = "plugin-data"
export const assistantDisplayName = "Progi"
// BlockMeta.categories entries: null = Quick Notes (unassigned), the constant
// below = the pinned Research system topic, anything else = a Goal id.
export const researchCategory = "research"
export const excerptMaxLength = 80
export const maxPinnedGoals = 3
// User-configurable glossary key limit is clamped to this range on save.
export const minGlossaryKeyLengthLimit = 50
export const maxGlossaryKeyLengthLimit = 300
// Storage safety only — the glossary UI imposes no explanation limit.
export const glossaryExplanationMaxLength = 100_000
export const defaultDictationModeForPlatform = (platform: NodeJS.Platform): DictationMode => {
    if (platform === 'win32') return 'windows'
    if (platform === 'darwin') return 'macos'
    return 'whisprflow'
}

export const defaultSettings: AppSettings = {
    uiLocale: 'en',
    blockWindowMinutes: 5,
    glossaryKeyMaxLength: 150,
    pinnedGoalIds: [],
    captureMode: "chat",
    // Main replaces this neutral cross-platform baseline with the native
    // platform default before settings reach the renderer.
    dictationMode: "whisprflow",
    onboardingCompleted: false,
    onboardingSkipped: false,
    llm: {
        provider: 'gemini',
        model: '',
        pluginWizardModel: '',
        imageRecognitionModel: '',
        localBaseUrl: 'http://127.0.0.1:1234',
        polishDictation: false,
        aiBlockNameSummary: false,
    },
    googleCalendar: {
        enabled: false,
        pushEnabled: false,
        pullEnabled: false,
        autoSyncMinutes: 0,
        hasOAuthClient: false,
        isConnected: false,
        lastSyncStatus: 'idle',
    },
    hasWhisprflowApiKey: false,
    hasGeminiApiKey: false,
    hasOpenaiApiKey: false,
    hasAnthropicApiKey: false,
    hasLocalApiToken: false,
}

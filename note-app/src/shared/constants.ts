import { AppSettings } from "./models"

export const appDirectory = "NoteMark"
export const fileEncoding = "utf8"
export const autoSavingTime = 3000
export const indexFileName = "index.json"
export const settingsFileName = "settings.json"
export const goalsFileName = "goals.json"
// BlockMeta.categories entries: null = Quick Notes (unassigned), the constant
// below = the pinned Research system topic, anything else = a Goal id.
export const researchCategory = "research"
export const excerptMaxLength = 80
export const maxPinnedGoals = 3
export const defaultSettings: AppSettings = {
    blockWindowMinutes: 5,
    pinnedGoalIds: [],
    captureMode: "chat",
    dictationMode: "windows",
    llm: {
        provider: 'gemini',
        model: '',
        localBaseUrl: 'http://127.0.0.1:1234',
        polishDictation: false,
    },
    hasWhisprflowApiKey: false,
    hasGeminiApiKey: false,
    hasOpenaiApiKey: false,
    hasAnthropicApiKey: false,
    hasLocalApiToken: false,
}

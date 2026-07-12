export type PluginConfigValue = string | number | boolean
export type PluginConfig = Record<string, PluginConfigValue>

export type GoalPresence = {
  source: 'user' | 'routed' | 'assistant' | 'research' | 'plugin'
  visited: boolean
}

export type PluginOwnedBlockMeta = {
  id: string
  file: string
  createdAt: number
  updatedAt: number
  categories: (string | null)[]
  excerpt: string
  aiLabel?: string
  goalPresence?: Record<string, GoalPresence>
}

export type PluginBlockRecord = {
  block: PluginOwnedBlockMeta
  content: string
}

export type PluginBlockMeta = {
  id: string
  createdAt: number
  updatedAt: number
  excerpt: string
  aiLabel?: string
  presence: GoalPresence | null
}

export type PluginBlockFilter = {
  category?: string
  createdAfter?: number
  updatedAfter?: number
  limit?: number
}

export type PluginAiCompleteInput = {
  prompt: string
  system?: string
  blockId?: string
  maxTokens?: number
}

export type PluginAiCompleteResult =
  | { text: string; error?: never }
  | { error: string; text?: never }

export type PluginStorageValue =
  | string
  | number
  | boolean
  | null
  | PluginStorageValue[]
  | { [key: string]: PluginStorageValue }

export type PluginNotificationTone = 'info' | 'success' | 'error'
export type PluginNotification = {
  message: string
  tone: PluginNotificationTone
}

export type PluginCommandInput = {
  text?: string
  blockId?: string
  content?: string
}

export type PluginCommandOutput = {
  message?: string
  blockId?: string
}

export interface NoteBlockPluginHostApi {
  readonly pluginId: string
  readonly categoryId: string
  getConfig(): Promise<PluginConfig>
  readonly blocks: {
    createBlock(content: string, categories?: (string | null)[]): Promise<PluginOwnedBlockMeta>
    readBlock(id: string): Promise<PluginBlockRecord>
    getMeta(id: string): Promise<PluginBlockMeta>
    writeBlock(id: string, content: string): Promise<PluginOwnedBlockMeta>
    deleteBlock(id: string): Promise<boolean>
    deleteBlockIfEmpty(id: string): Promise<boolean>
    updateBlockCategories(id: string, categories: (string | null)[]): Promise<PluginOwnedBlockMeta>
    appendToBlock(id: string, text: string): Promise<PluginOwnedBlockMeta>
    listBlocks(filter?: PluginBlockFilter): Promise<PluginBlockRecord[]>
    getPresence(id: string, category?: string): Promise<GoalPresence | null>
    setPresence(id: string, visited: boolean, category?: string): Promise<PluginOwnedBlockMeta>
    acknowledgePresence(id: string, category?: string): Promise<PluginOwnedBlockMeta>
  }
  readonly ai: {
    complete(input: PluginAiCompleteInput): Promise<PluginAiCompleteResult>
  }
  readonly storage: {
    get(key: string): Promise<PluginStorageValue | null>
    set(key: string, value: PluginStorageValue): Promise<boolean>
  }
  notify(message: string, options?: { tone?: PluginNotificationTone }): PluginNotification
}

export type PluginCommand = (
  input: PluginCommandInput
) => PluginCommandOutput | void | Promise<PluginCommandOutput | void>

export type PluginRegistration = {
  commands?: Record<string, PluginCommand>
  deactivate?: () => void | Promise<void>
}

export type ActivatePlugin = (
  host: NoteBlockPluginHostApi
) => PluginRegistration | void | Promise<PluginRegistration | void>

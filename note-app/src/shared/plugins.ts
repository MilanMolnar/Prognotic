import type { BlockMeta, GoalPresence } from './models'

export const prognoticPluginSignature = 'prognotic-plugin/v1'

export type PluginConfigValue = string | number | boolean
export type PluginConfig = Record<string, PluginConfigValue>

type PluginConfigFieldBase = {
    key: string
    label: string
    description?: string
}

export type PluginStringConfigField = PluginConfigFieldBase & {
    type: 'string'
    default?: string
}

export type PluginNumberConfigField = PluginConfigFieldBase & {
    type: 'number'
    default?: number
    min?: number
    max?: number
}

export type PluginBooleanConfigField = PluginConfigFieldBase & {
    type: 'boolean'
    default?: boolean
}

export type PluginSelectConfigField = PluginConfigFieldBase & {
    type: 'select'
    default?: string
    options: { label: string; value: string }[]
}

export type PluginConfigField =
    | PluginStringConfigField
    | PluginNumberConfigField
    | PluginBooleanConfigField
    | PluginSelectConfigField

export type PluginSidebar = {
    label: string
    icon?: string
}

export type PluginActionTone = 'default' | 'ai' | 'review'
export type PluginActionVisibility = 'always' | 'unvisited'

export type PluginViewAction = {
    command: string
    label: string
    tone?: PluginActionTone
    showWhen?: PluginActionVisibility
    aiPrompt?: string
}

export type PluginActionElement = PluginViewAction & {
    type: 'action'
}

export type PluginCapture = {
    command: string
    label: string
    placeholder?: string
}

export type PluginCaptureElement = PluginCapture & {
    type: 'capture'
}

export type PluginHeaderElement = {
    type: 'header'
    title?: string
    description?: string
    showReviewCount?: boolean
}

export type PluginStatKey = 'total' | 'today' | 'unvisited'
export type PluginStatDefinition = {
    key: PluginStatKey
    label: string
}

export type PluginStatRowElement = {
    type: 'stat-row'
    items?: PluginStatDefinition[]
}

export type PluginEntryEditorElement = {
    type: 'entry-editor'
    command: string
}

export type PluginEntryElement = {
    type: 'entry'
    content?: 'body' | 'excerpt'
    showTimestamp?: boolean
    showReviewBadge?: boolean
    editor?: PluginEntryEditorElement
    deleteCommand?: string
    actions?: PluginActionElement[]
}

export type PluginListElement = {
    type: 'list'
    entry?: PluginEntryElement
}

export type PluginGroupedListElement = {
    type: 'grouped-list'
    groupBy?: 'today-recent' | 'day'
    labels?: {
        today?: string
        recent?: string
    }
    entry?: PluginEntryElement
}

export type PluginEmptyStateElement = {
    type: 'empty-state'
    message?: string
}

export type PluginSectionLabelElement = {
    type: 'section-label'
    label: string
}

export type PluginUiLayoutShorthand =
    | 'header'
    | 'capture'
    | 'stat-row'
    | 'list'
    | 'grouped-list'
    | 'empty-state'

export type PluginUiLayoutElement =
    | PluginUiLayoutShorthand
    | PluginHeaderElement
    | PluginCaptureElement
    | PluginStatRowElement
    | PluginListElement
    | PluginGroupedListElement
    | PluginEmptyStateElement
    | PluginSectionLabelElement
    | PluginActionElement

export type PluginNoteFeedUi = {
    type: 'note-feed'
    layout?: PluginUiLayoutElement[]
    emptyState?: string
    capture?: PluginCapture
    stats?: PluginStatDefinition[]
    entry?: PluginEntryElement
    // Legacy v1 fields remain supported and are used when `entry` is absent.
    editCommand?: string
    deleteCommand?: string
    actions?: PluginViewAction[]
}

export type PluginManifest = {
    id: string
    name: string
    version: string
    description: string
    signature: typeof prognoticPluginSignature
    entry: string
    permissions?: {
        blocks?: 'own'
        ai?: boolean
    }
    ai?: {
        systemPrompt?: string
    }
    sidebar?: PluginSidebar
    configSchema?: PluginConfigField[]
    ui?: PluginNoteFeedUi
}

export const pluginUiLayout = (ui: PluginNoteFeedUi): PluginUiLayoutElement[] =>
    ui.layout ?? [
        'header',
        ...(ui.capture ? ['capture' as const] : []),
        'empty-state',
        'grouped-list'
    ]

export const pluginEntryFor = (
    ui: PluginNoteFeedUi,
    element?: PluginListElement | PluginGroupedListElement
): PluginEntryElement => element?.entry ?? ui.entry ?? {
    type: 'entry',
    content: 'body',
    showTimestamp: true,
    showReviewBadge: true,
    ...(ui.editCommand
        ? { editor: { type: 'entry-editor' as const, command: ui.editCommand } }
        : {}),
    ...(ui.deleteCommand ? { deleteCommand: ui.deleteCommand } : {}),
    ...(ui.actions
        ? { actions: ui.actions.map((action) => ({ ...action, type: 'action' as const })) }
        : {})
}

const addEntryCommands = (commands: Set<string>, entry: PluginEntryElement): void => {
    if (entry.editor) commands.add(entry.editor.command)
    if (entry.deleteCommand) commands.add(entry.deleteCommand)
    for (const action of entry.actions ?? []) commands.add(action.command)
}

export const pluginUiDeclaredCommands = (ui: PluginNoteFeedUi | undefined): string[] => {
    if (!ui) return []
    const commands = new Set<string>()
    for (const element of pluginUiLayout(ui)) {
        if (element === 'capture') {
            if (ui.capture) commands.add(ui.capture.command)
            continue
        }
        if (element === 'list' || element === 'grouped-list') {
            addEntryCommands(commands, pluginEntryFor(ui))
            continue
        }
        if (typeof element === 'string') continue
        if (element.type === 'capture') commands.add(element.command)
        if (element.type === 'action') commands.add(element.command)
        if (element.type === 'list' || element.type === 'grouped-list') {
            addEntryCommands(commands, pluginEntryFor(ui, element))
        }
    }
    return [...commands]
}

export const pluginUiActionPrompt = (
    ui: PluginNoteFeedUi | undefined,
    command: string
): string | undefined => {
    if (!ui) return undefined
    for (const element of pluginUiLayout(ui)) {
        if (typeof element === 'object' && element.type === 'action' && element.command === command) {
            return element.aiPrompt
        }
        if (element === 'list' || element === 'grouped-list') {
            const prompt = pluginEntryFor(ui).actions?.find((action) => action.command === command)?.aiPrompt
            if (prompt) return prompt
        }
        if (typeof element === 'object' && (element.type === 'list' || element.type === 'grouped-list')) {
            const prompt = pluginEntryFor(ui, element).actions?.find((action) => action.command === command)?.aiPrompt
            if (prompt) return prompt
        }
    }
    return undefined
}

export type InstalledPlugin = {
    folderName: string
    id: string | null
    name: string
    version: string
    description: string
    valid: boolean
    enabled: boolean
    reason?: string
    categoryId?: string
    sidebar?: PluginSidebar
    configSchema: PluginConfigField[]
    config: PluginConfig
    ui?: PluginNoteFeedUi
    badgeCount: number
    aiGenerated: boolean
}

export type PluginCatalog = {
    pluginsPath: string
    plugins: InstalledPlugin[]
}

export type PluginMutationResult = {
    catalog: PluginCatalog
    error?: string
}

export type PluginWizardIcon = 'utensils' | 'leaf' | 'heart' | 'sparkles' | 'puzzle'

export type PluginWizardCommandInputKind =
    | 'none'
    | 'text'
    | 'blockId'
    | 'blockId-content'

export type PluginWizardCommandOutline = {
    command: string
    input: PluginWizardCommandInputKind
    purpose: string
    usesAi: boolean
}

export type PluginWizardSpec = {
    id: string
    folderName: string
    name: string
    description: string
    sidebar: {
        label: string
        icon: PluginWizardIcon
    }
    configSchema: PluginConfigField[]
    ui: PluginNoteFeedUi
    commands: PluginWizardCommandOutline[]
    ai: {
        enabled: boolean
        systemPrompt?: string
        actionPrompts: { command: string; prompt: string }[]
    }
}

export type PluginWizardAnswer = {
    question: string
    answer: string
}

export type PluginWizardInterviewInput = {
    goal: string
    answers: PluginWizardAnswer[]
}

export type PluginWizardInterviewResult =
    | {
        status: 'question'
        question: string
        guidance?: string
    }
    | {
        status: 'ready_to_generate'
        spec: PluginWizardSpec
        summary: string[]
        constraints: string[]
    }
    | {
        status: 'error'
        error: string
    }

export type CreateGeneratedPluginInput = {
    spec: PluginWizardSpec
    confirmed: boolean
    revision?: string
}

export type CreateGeneratedPluginResult = {
    catalog: PluginCatalog
    error?: string
    pluginId?: string
    folderName?: string
}

export type PluginBlockFilter = {
    category?: string
    createdAfter?: number
    updatedAfter?: number
    limit?: number
}

export type PluginBlockRecord = {
    block: BlockMeta
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

export type PluginAiCompleteInput = {
    prompt: string
    system?: string
    blockId?: string
    maxTokens?: number
}

export type PluginAiPromptLayers = {
    pluginSystemPrompt?: string
    actionSystemPrompt?: string
}

export type PluginAiCompleteResult =
    | { text: string; error?: never }
    | { error: string; text?: never }

export type PluginNotificationTone = 'info' | 'success' | 'error'
export type PluginNotification = {
    message: string
    tone: PluginNotificationTone
}

export type PluginStorageValue =
    | string
    | number
    | boolean
    | null
    | PluginStorageValue[]
    | { [key: string]: PluginStorageValue }

export type PluginCommandInput = {
    text?: string
    blockId?: string
    content?: string
}

export type PluginCommandResult =
    | {
        ok: true
        value?: { message?: string; blockId?: string }
        notifications?: PluginNotification[]
    }
    | { ok: false; error: string }

export type PluginHostRequest =
    | { method: 'blocks.create'; content: string; categories?: (string | null)[] }
    | { method: 'blocks.read'; id: string }
    | { method: 'blocks.getMeta'; id: string }
    | { method: 'blocks.write'; id: string; content: string }
    | { method: 'blocks.delete'; id: string }
    | { method: 'blocks.deleteIfEmpty'; id: string }
    | { method: 'blocks.updateCategories'; id: string; categories: (string | null)[] }
    | { method: 'blocks.append'; id: string; text: string }
    | { method: 'blocks.list'; filter?: PluginBlockFilter }
    | { method: 'presence.get'; id: string; category?: string }
    | { method: 'presence.set'; id: string; category?: string; visited: boolean }
    | { method: 'presence.acknowledge'; id: string; category?: string }
    | { method: 'ai.complete'; input: PluginAiCompleteInput }
    | { method: 'storage.get'; key: string }
    | { method: 'storage.set'; key: string; value: PluginStorageValue }
    | { method: 'notify'; message: string; tone?: PluginNotificationTone }

export type PluginHostValue =
    | BlockMeta
    | PluginBlockMeta
    | PluginBlockRecord
    | PluginBlockRecord[]
    | GoalPresence
    | PluginAiCompleteResult
    | PluginNotification
    | PluginStorageValue
    | boolean
    | null

export type PluginHostCallResult =
    | { ok: true; value: PluginHostValue }
    | { ok: false; error: string }

export type OpenPluginsFolderResult = { ok: true; error?: never } | { ok: false; error: string }

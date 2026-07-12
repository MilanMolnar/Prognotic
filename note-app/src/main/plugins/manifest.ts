import {
    PluginActionElement,
    PluginBooleanConfigField,
    PluginCapture,
    PluginCaptureElement,
    PluginConfig,
    PluginConfigField,
    PluginEmptyStateElement,
    PluginEntryElement,
    PluginGroupedListElement,
    PluginHeaderElement,
    PluginListElement,
    PluginManifest,
    PluginNoteFeedUi,
    PluginNumberConfigField,
    PluginSectionLabelElement,
    PluginSelectConfigField,
    PluginStatDefinition,
    PluginStatRowElement,
    PluginStringConfigField,
    PluginUiLayoutElement,
    PluginViewAction,
    pluginUiActionPrompt,
    pluginUiDeclaredCommands,
    prognoticPluginSignature
} from '@shared/plugins'

export type ManifestValidation =
    | { manifest: PluginManifest; error?: never }
    | { manifest?: never; error: string }

const idPattern = /^[a-z][a-z0-9-]{0,63}$/
const keyPattern = /^[a-z][a-zA-Z0-9_-]{0,63}$/
const commandPattern = /^[a-z][a-zA-Z0-9._-]{0,79}$/
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const requiredString = (
    value: unknown,
    field: string,
    maxLength: number,
    pattern?: RegExp
): string => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Manifest field "${field}" is required.`)
    }
    const normalized = value.trim()
    if (normalized.length > maxLength || (pattern && !pattern.test(normalized))) {
        throw new Error(`Manifest field "${field}" has an invalid value.`)
    }
    return normalized
}

const optionalString = (value: unknown, field: string, maxLength: number): string | undefined => {
    if (value === undefined) return undefined
    return requiredString(value, field, maxLength)
}

const parseConfigField = (raw: unknown, index: number): PluginConfigField => {
    if (!isRecord(raw)) throw new Error(`configSchema[${index}] must be an object.`)
    const key = requiredString(raw.key, `configSchema[${index}].key`, 64, keyPattern)
    const label = requiredString(raw.label, `configSchema[${index}].label`, 80)
    const description = optionalString(raw.description, `configSchema[${index}].description`, 240)
    const base = { key, label, ...(description ? { description } : {}) }

    if (raw.type === 'string') {
        if (raw.default !== undefined && typeof raw.default !== 'string') {
            throw new Error(`Default value for "${key}" must be a string.`)
        }
        return {
            ...base,
            type: 'string',
            ...(typeof raw.default === 'string' ? { default: raw.default.slice(0, 10_000) } : {})
        } satisfies PluginStringConfigField
    }

    if (raw.type === 'number') {
        for (const property of ['default', 'min', 'max'] as const) {
            if (raw[property] !== undefined && (typeof raw[property] !== 'number' || !Number.isFinite(raw[property]))) {
                throw new Error(`${property} for "${key}" must be a finite number.`)
            }
        }
        const min = raw.min as number | undefined
        const max = raw.max as number | undefined
        const defaultValue = raw.default as number | undefined
        if (min !== undefined && max !== undefined && min > max) {
            throw new Error(`Minimum for "${key}" cannot exceed its maximum.`)
        }
        if (defaultValue !== undefined && ((min !== undefined && defaultValue < min) || (max !== undefined && defaultValue > max))) {
            throw new Error(`Default value for "${key}" is outside its allowed range.`)
        }
        return {
            ...base,
            type: 'number',
            ...(defaultValue !== undefined ? { default: defaultValue } : {}),
            ...(min !== undefined ? { min } : {}),
            ...(max !== undefined ? { max } : {})
        } satisfies PluginNumberConfigField
    }

    if (raw.type === 'boolean') {
        if (raw.default !== undefined && typeof raw.default !== 'boolean') {
            throw new Error(`Default value for "${key}" must be a boolean.`)
        }
        return {
            ...base,
            type: 'boolean',
            ...(typeof raw.default === 'boolean' ? { default: raw.default } : {})
        } satisfies PluginBooleanConfigField
    }

    if (raw.type === 'select') {
        if (!Array.isArray(raw.options) || raw.options.length === 0 || raw.options.length > 50) {
            throw new Error(`Select field "${key}" must define between 1 and 50 options.`)
        }
        const options = raw.options.map((option, optionIndex) => {
            if (!isRecord(option)) throw new Error(`Option ${optionIndex} for "${key}" must be an object.`)
            return {
                label: requiredString(option.label, `Option ${optionIndex} label for "${key}"`, 80),
                value: requiredString(option.value, `Option ${optionIndex} value for "${key}"`, 120)
            }
        })
        if (new Set(options.map((option) => option.value)).size !== options.length) {
            throw new Error(`Select field "${key}" contains duplicate option values.`)
        }
        if (raw.default !== undefined && (typeof raw.default !== 'string' || !options.some((option) => option.value === raw.default))) {
            throw new Error(`Default value for "${key}" must match one of its options.`)
        }
        return {
            ...base,
            type: 'select',
            options,
            ...(typeof raw.default === 'string' ? { default: raw.default } : {})
        } satisfies PluginSelectConfigField
    }

    throw new Error(`Config field "${key}" has an unsupported type.`)
}

const parseActionShape = (raw: unknown, path: string): PluginViewAction => {
    if (!isRecord(raw)) throw new Error(`${path} must be an object.`)
    const command = requiredString(raw.command, `${path}.command`, 80, commandPattern)
    const label = requiredString(raw.label, `${path}.label`, 60)
    if (raw.tone !== undefined && raw.tone !== 'default' && raw.tone !== 'ai' && raw.tone !== 'review') {
        throw new Error(`${path}.tone is unsupported.`)
    }
    if (raw.showWhen !== undefined && raw.showWhen !== 'always' && raw.showWhen !== 'unvisited') {
        throw new Error(`${path}.showWhen is unsupported.`)
    }
    const aiPrompt = optionalString(raw.aiPrompt, `${path}.aiPrompt`, 12_000)
    return {
        command,
        label,
        ...(raw.tone ? { tone: raw.tone } : {}),
        ...(raw.showWhen ? { showWhen: raw.showWhen } : {}),
        ...(aiPrompt ? { aiPrompt } : {})
    }
}

const parseAction = (raw: unknown, index: number): PluginViewAction =>
    parseActionShape(raw, `ui.actions[${index}]`)

const parseActionElement = (raw: unknown, path: string): PluginActionElement => {
    if (!isRecord(raw) || raw.type !== 'action') {
        throw new Error(`${path}.type must be "action".`)
    }
    return { type: 'action', ...parseActionShape(raw, path) }
}

const parseCapture = (raw: unknown, path: string): PluginCapture => {
    if (!isRecord(raw)) throw new Error(`${path} must be an object.`)
    const placeholder = optionalString(raw.placeholder, `${path}.placeholder`, 140)
    return {
        command: requiredString(raw.command, `${path}.command`, 80, commandPattern),
        label: requiredString(raw.label, `${path}.label`, 60),
        ...(placeholder ? { placeholder } : {})
    }
}

const parseStats = (raw: unknown, path: string): PluginStatDefinition[] => {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 10) {
        throw new Error(`${path} must contain between 1 and 10 stat definitions.`)
    }
    const stats = raw.map((item, index): PluginStatDefinition => {
        if (!isRecord(item)) throw new Error(`${path}[${index}] must be an object.`)
        if (item.key !== 'total' && item.key !== 'today' && item.key !== 'unvisited') {
            throw new Error(`${path}[${index}].key is unsupported.`)
        }
        return {
            key: item.key,
            label: requiredString(item.label, `${path}[${index}].label`, 60)
        }
    })
    if (new Set(stats.map((stat) => stat.key)).size !== stats.length) {
        throw new Error(`${path} contains duplicate stat keys.`)
    }
    return stats
}

const parseEntry = (raw: unknown, path: string): PluginEntryElement => {
    if (!isRecord(raw) || raw.type !== 'entry') {
        throw new Error(`${path}.type must be "entry".`)
    }
    if (raw.content !== undefined && raw.content !== 'body' && raw.content !== 'excerpt') {
        throw new Error(`${path}.content must be "body" or "excerpt".`)
    }
    for (const property of ['showTimestamp', 'showReviewBadge'] as const) {
        if (raw[property] !== undefined && typeof raw[property] !== 'boolean') {
            throw new Error(`${path}.${property} must be a boolean.`)
        }
    }

    let editor: PluginEntryElement['editor']
    if (raw.editor !== undefined) {
        if (!isRecord(raw.editor) || raw.editor.type !== 'entry-editor') {
            throw new Error(`${path}.editor.type must be "entry-editor".`)
        }
        editor = {
            type: 'entry-editor',
            command: requiredString(raw.editor.command, `${path}.editor.command`, 80, commandPattern)
        }
    }

    const actions = raw.actions === undefined
        ? undefined
        : Array.isArray(raw.actions) && raw.actions.length <= 20
            ? raw.actions.map((action, index) => parseActionElement(action, `${path}.actions[${index}]`))
            : (() => { throw new Error(`${path}.actions must be an array of at most 20 action elements.`) })()

    return {
        type: 'entry',
        ...(raw.content ? { content: raw.content } : {}),
        ...(typeof raw.showTimestamp === 'boolean' ? { showTimestamp: raw.showTimestamp } : {}),
        ...(typeof raw.showReviewBadge === 'boolean' ? { showReviewBadge: raw.showReviewBadge } : {}),
        ...(editor ? { editor } : {}),
        ...(raw.deleteCommand !== undefined
            ? { deleteCommand: requiredString(raw.deleteCommand, `${path}.deleteCommand`, 80, commandPattern) }
            : {}),
        ...(actions ? { actions } : {})
    }
}

const layoutShorthands = new Set([
    'header',
    'capture',
    'stat-row',
    'list',
    'grouped-list',
    'empty-state'
])

const parseLayoutElement = (raw: unknown, index: number): PluginUiLayoutElement => {
    const path = `ui.layout[${index}]`
    if (typeof raw === 'string') {
        if (!layoutShorthands.has(raw)) throw new Error(`${path} contains an unsupported element "${raw}".`)
        return raw as PluginUiLayoutElement
    }
    if (!isRecord(raw) || typeof raw.type !== 'string') {
        throw new Error(`${path} must be a supported element name or object.`)
    }

    if (raw.type === 'header') {
        if (raw.showReviewCount !== undefined && typeof raw.showReviewCount !== 'boolean') {
            throw new Error(`${path}.showReviewCount must be a boolean.`)
        }
        const title = optionalString(raw.title, `${path}.title`, 80)
        const description = optionalString(raw.description, `${path}.description`, 500)
        return {
            type: 'header',
            ...(title ? { title } : {}),
            ...(description ? { description } : {}),
            ...(typeof raw.showReviewCount === 'boolean' ? { showReviewCount: raw.showReviewCount } : {})
        } satisfies PluginHeaderElement
    }
    if (raw.type === 'capture') {
        return { type: 'capture', ...parseCapture(raw, path) } satisfies PluginCaptureElement
    }
    if (raw.type === 'stat-row') {
        return {
            type: 'stat-row',
            ...(raw.items !== undefined ? { items: parseStats(raw.items, `${path}.items`) } : {})
        } satisfies PluginStatRowElement
    }
    if (raw.type === 'list') {
        return {
            type: 'list',
            ...(raw.entry !== undefined ? { entry: parseEntry(raw.entry, `${path}.entry`) } : {})
        } satisfies PluginListElement
    }
    if (raw.type === 'grouped-list') {
        if (raw.groupBy !== undefined && raw.groupBy !== 'today-recent' && raw.groupBy !== 'day') {
            throw new Error(`${path}.groupBy is unsupported.`)
        }
        let labels: PluginGroupedListElement['labels']
        if (raw.labels !== undefined) {
            if (!isRecord(raw.labels)) throw new Error(`${path}.labels must be an object.`)
            const today = optionalString(raw.labels.today, `${path}.labels.today`, 60)
            const recent = optionalString(raw.labels.recent, `${path}.labels.recent`, 60)
            labels = { ...(today ? { today } : {}), ...(recent ? { recent } : {}) }
        }
        return {
            type: 'grouped-list',
            ...(raw.groupBy ? { groupBy: raw.groupBy } : {}),
            ...(labels ? { labels } : {}),
            ...(raw.entry !== undefined ? { entry: parseEntry(raw.entry, `${path}.entry`) } : {})
        } satisfies PluginGroupedListElement
    }
    if (raw.type === 'empty-state') {
        const message = optionalString(raw.message, `${path}.message`, 180)
        return { type: 'empty-state', ...(message ? { message } : {}) } satisfies PluginEmptyStateElement
    }
    if (raw.type === 'section-label') {
        return {
            type: 'section-label',
            label: requiredString(raw.label, `${path}.label`, 80)
        } satisfies PluginSectionLabelElement
    }
    if (raw.type === 'action') return parseActionElement(raw, path)

    throw new Error(`${path}.type "${raw.type}" is unsupported.`)
}

const parseUi = (raw: unknown): PluginNoteFeedUi | undefined => {
    if (raw === undefined) return undefined
    if (!isRecord(raw) || raw.type !== 'note-feed') {
        throw new Error('Manifest field "ui.type" must be "note-feed".')
    }

    let capture: PluginNoteFeedUi['capture']
    if (raw.capture !== undefined) {
        capture = parseCapture(raw.capture, 'ui.capture')
    }

    const actions = raw.actions === undefined
        ? undefined
        : Array.isArray(raw.actions) && raw.actions.length <= 20
            ? raw.actions.map(parseAction)
            : (() => { throw new Error('Manifest field "ui.actions" must be an array of at most 20 actions.') })()

    const emptyState = optionalString(raw.emptyState, 'ui.emptyState', 180)
    const stats = raw.stats !== undefined ? parseStats(raw.stats, 'ui.stats') : undefined
    const entry = raw.entry !== undefined ? parseEntry(raw.entry, 'ui.entry') : undefined
    const layout = raw.layout === undefined
        ? undefined
        : Array.isArray(raw.layout) && raw.layout.length > 0 && raw.layout.length <= 30
            ? raw.layout.map(parseLayoutElement)
            : (() => { throw new Error('Manifest field "ui.layout" must contain between 1 and 30 elements.') })()

    if (layout?.includes('capture') && !capture) {
        throw new Error('ui.layout uses "capture", but ui.capture is not configured.')
    }
    const listCount = layout?.filter((element) =>
        element === 'list' || element === 'grouped-list' ||
        (typeof element === 'object' && (element.type === 'list' || element.type === 'grouped-list'))
    ).length ?? 0
    if (listCount > 1) throw new Error('ui.layout may contain only one list or grouped-list element.')

    return {
        type: 'note-feed',
        ...(layout ? { layout } : {}),
        ...(emptyState ? { emptyState } : {}),
        ...(capture ? { capture } : {}),
        ...(stats ? { stats } : {}),
        ...(entry ? { entry } : {}),
        ...(raw.editCommand !== undefined
            ? { editCommand: requiredString(raw.editCommand, 'ui.editCommand', 80, commandPattern) }
            : {}),
        ...(raw.deleteCommand !== undefined
            ? { deleteCommand: requiredString(raw.deleteCommand, 'ui.deleteCommand', 80, commandPattern) }
            : {}),
        ...(actions ? { actions } : {})
    }
}

export const validatePluginManifest = (raw: unknown): ManifestValidation => {
    try {
        if (!isRecord(raw)) throw new Error('plugin.json must contain a JSON object.')
        if (raw.signature !== prognoticPluginSignature) {
            throw new Error(`Manifest signature must be "${prognoticPluginSignature}".`)
        }

        const id = requiredString(raw.id, 'id', 64, idPattern)
        const name = requiredString(raw.name, 'name', 80)
        const version = requiredString(raw.version, 'version', 80, versionPattern)
        const description = requiredString(raw.description, 'description', 500)
        const entry = requiredString(raw.entry, 'entry', 240)
        const normalizedEntry = entry.replace(/\\/g, '/')
        if (
            normalizedEntry.startsWith('/') ||
            /^[A-Za-z]:/.test(normalizedEntry) ||
            normalizedEntry.split('/').some((segment) => segment === '..') ||
            !/\.(?:cjs|js)$/.test(normalizedEntry)
        ) {
            throw new Error('Manifest field "entry" must be a relative .js or .cjs path inside the plugin folder.')
        }

        let permissions: PluginManifest['permissions']
        if (raw.permissions !== undefined) {
            if (!isRecord(raw.permissions)) throw new Error('Manifest field "permissions" must be an object.')
            if (raw.permissions.blocks !== undefined && raw.permissions.blocks !== 'own') {
                throw new Error('This host version supports only own-namespace block access.')
            }
            if (raw.permissions.ai !== undefined && typeof raw.permissions.ai !== 'boolean') {
                throw new Error('Manifest field "permissions.ai" must be a boolean.')
            }
            permissions = {
                ...(raw.permissions.blocks ? { blocks: 'own' as const } : {}),
                ...(typeof raw.permissions.ai === 'boolean' ? { ai: raw.permissions.ai } : {})
            }
        }

        let ai: PluginManifest['ai']
        if (raw.ai !== undefined) {
            if (!isRecord(raw.ai)) throw new Error('Manifest field "ai" must be an object.')
            const systemPrompt = optionalString(raw.ai.systemPrompt, 'ai.systemPrompt', 24_000)
            ai = { ...(systemPrompt ? { systemPrompt } : {}) }
        }

        let sidebar: PluginManifest['sidebar']
        if (raw.sidebar !== undefined) {
            if (!isRecord(raw.sidebar)) throw new Error('Manifest field "sidebar" must be an object.')
            sidebar = {
                label: requiredString(raw.sidebar.label, 'sidebar.label', 60),
                ...(optionalString(raw.sidebar.icon, 'sidebar.icon', 40)
                    ? { icon: optionalString(raw.sidebar.icon, 'sidebar.icon', 40) }
                    : {})
            }
        }

        const configSchema = raw.configSchema === undefined
            ? undefined
            : Array.isArray(raw.configSchema) && raw.configSchema.length <= 50
                ? raw.configSchema.map(parseConfigField)
                : (() => { throw new Error('Manifest field "configSchema" must be an array of at most 50 fields.') })()
        if (configSchema && new Set(configSchema.map((field) => field.key)).size !== configSchema.length) {
            throw new Error('Manifest config keys must be unique.')
        }
        const ui = parseUi(raw.ui)
        const hasActionPrompt = pluginUiDeclaredCommands(ui).some((command) =>
            pluginUiActionPrompt(ui, command) !== undefined
        )
        if ((ai?.systemPrompt || hasActionPrompt) && permissions?.ai !== true) {
            throw new Error('Manifest AI prompts require "permissions.ai": true.')
        }

        return {
            manifest: {
                id,
                name,
                version,
                description,
                signature: prognoticPluginSignature,
                entry: normalizedEntry,
                ...(permissions ? { permissions } : {}),
                ...(ai ? { ai } : {}),
                ...(sidebar ? { sidebar } : {}),
                ...(configSchema ? { configSchema } : {}),
                ...(ui ? { ui } : {})
            }
        }
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'The plugin manifest is invalid.' }
    }
}

const fallbackValue = (field: PluginConfigField): string | number | boolean => {
    if (field.default !== undefined) return field.default
    if (field.type === 'boolean') return false
    if (field.type === 'number') {
        if (field.min !== undefined) return field.min
        if (field.max !== undefined && field.max < 0) return field.max
        return 0
    }
    if (field.type === 'select') return field.options[0]?.value ?? ''
    return ''
}

const isConfigValueValid = (field: PluginConfigField, value: unknown): value is string | number | boolean => {
    if (field.type === 'string') return typeof value === 'string' && value.length <= 10_000
    if (field.type === 'boolean') return typeof value === 'boolean'
    if (field.type === 'select') return typeof value === 'string' && field.options.some((option) => option.value === value)
    return typeof value === 'number' && Number.isFinite(value) &&
        (field.min === undefined || value >= field.min) &&
        (field.max === undefined || value <= field.max)
}

export const normalizePersistedPluginConfig = (
    schema: PluginConfigField[] | undefined,
    raw: unknown
): PluginConfig => {
    const source = isRecord(raw) ? raw : {}
    const config: PluginConfig = {}
    for (const field of schema ?? []) {
        const value = source[field.key]
        config[field.key] = isConfigValueValid(field, value) ? value : fallbackValue(field)
    }
    return config
}

export const validatePluginConfig = (
    schema: PluginConfigField[] | undefined,
    raw: unknown
): { config: PluginConfig; error?: never } | { config?: never; error: string } => {
    if (!isRecord(raw)) return { error: 'Plugin configuration must be an object.' }
    const config: PluginConfig = {}
    for (const field of schema ?? []) {
        const value = raw[field.key]
        if (!isConfigValueValid(field, value)) {
            return { error: `Configuration value "${field.label}" is invalid.` }
        }
        config[field.key] = value
    }
    return { config }
}

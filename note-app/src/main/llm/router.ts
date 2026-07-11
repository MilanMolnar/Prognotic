import { BlockMeta, LlmProvider } from '@shared/models'
import { AssistantModelSelection, AssistantScope, LlmMessage, LlmModel } from '@shared/types'
import { researchCategory } from '@shared/constants'
import { getBlocks, getCredential, getGoals, getSettings, readBlock, setBlockRouting } from '@/lib'
import { parseRoutingAssignments } from './classification'
import { rankNoteCandidates } from './noteRanking'
import { readSse } from './streamParser'

type StreamOptions = { signal: AbortSignal; onToken: (text: string) => void }

type Adapter = {
    listModels: () => Promise<LlmModel[]>
    stream: (model: string, messages: LlmMessage[], options: StreamOptions) => Promise<void>
}

const errorFrom = async (response: Response): Promise<Error> => {
    const body = await response.json().catch(() => null) as { error?: { message?: string } | string; message?: string } | null
    const message = typeof body?.error === 'string' ? body.error : body?.error?.message ?? body?.message
    if (response.status === 401 || response.status === 403) return new Error('The provider rejected the configured API key.')
    return new Error(message ? `AI request failed: ${message}` : `AI request failed (HTTP ${response.status}).`)
}

const openAiCompatible = (baseUrl: string, token: string): Adapter => ({
    listModels: async () => {
        const response = await fetch(`${baseUrl}/v1/models`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
        if (!response.ok) throw await errorFrom(response)
        const payload = await response.json() as { data?: { id: string }[] }
        return (payload.data ?? []).map((model) => ({ id: model.id, label: model.id })).sort((a, b) => a.label.localeCompare(b.label))
    },
    stream: async (model, messages, { signal, onToken }) => {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST', signal,
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ model, messages, stream: true })
        })
        if (!response.ok) throw await errorFrom(response)
        await readSse(response, signal, (data) => {
            const payload = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }
            const token = payload.choices?.[0]?.delta?.content
            if (token) onToken(token)
        })
    }
})

const gemini = async (): Promise<Adapter> => {
    const key = await getCredential('gemini')
    if (!key) throw new Error('Add a Gemini API key in Settings.')
    const base = 'https://generativelanguage.googleapis.com/v1beta'
    return {
        listModels: async () => {
            const response = await fetch(`${base}/models?key=${encodeURIComponent(key)}&pageSize=1000`)
            if (!response.ok) throw await errorFrom(response)
            const payload = await response.json() as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[]; inputTokenLimit?: number }[] }
            return (payload.models ?? []).filter((model) => model.supportedGenerationMethods?.includes('generateContent')).map((model) => ({
                id: model.name.replace(/^models\//, ''), label: model.displayName ?? model.name.replace(/^models\//, ''), contextWindow: model.inputTokenLimit
            }))
        },
        stream: async (model, messages, { signal, onToken }) => {
            const system = messages.find((message) => message.role === 'system')?.content
            const contents = messages.filter((message) => message.role !== 'system').map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }))
            const response = await fetch(`${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`, {
                method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents })
            })
            if (!response.ok) throw await errorFrom(response)
            await readSse(response, signal, (data) => {
                const payload = JSON.parse(data) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
                const token = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('')
                if (token) onToken(token)
            })
        }
    }
}

const anthropic = async (): Promise<Adapter> => {
    const key = await getCredential('anthropic')
    if (!key) throw new Error('Add a Claude API key in Settings.')
    const base = 'https://api.anthropic.com/v1'
    const headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    return {
        listModels: async () => {
            const response = await fetch(`${base}/models?limit=1000`, { headers })
            if (!response.ok) throw await errorFrom(response)
            const payload = await response.json() as { data?: { id: string; display_name?: string }[] }
            return (payload.data ?? []).map((model) => ({ id: model.id, label: model.display_name ?? model.id }))
        },
        stream: async (model, messages, { signal, onToken }) => {
            const system = messages.find((message) => message.role === 'system')?.content
            const response = await fetch(`${base}/messages`, {
                method: 'POST', signal,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, max_tokens: 2048, stream: true, ...(system ? { system } : {}), messages: messages.filter((message) => message.role !== 'system') })
            })
            if (!response.ok) throw await errorFrom(response)
            await readSse(response, signal, (data) => {
                const payload = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } }
                if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta' && payload.delta.text) onToken(payload.delta.text)
            })
        }
    }
}

const local = async (): Promise<Adapter> => {
    const settings = await getSettings()
    const base = settings.llm.localBaseUrl
    const token = await getCredential('local')
    return {
        listModels: async () => {
            const response = await fetch(`${base}/api/v1/models`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
            if (!response.ok) throw await errorFrom(response)
            const payload = await response.json() as { models?: { type: string; key: string; display_name: string; loaded_instances: { id: string; config?: { context_length?: number } }[] }[] }
            return (payload.models ?? []).filter((model) => model.type === 'llm' && model.loaded_instances.length > 0).map((model) => ({
                id: model.loaded_instances[0].id || model.key,
                label: model.display_name,
                contextWindow: model.loaded_instances[0].config?.context_length
            }))
        },
        stream: openAiCompatible(base, token).stream
    }
}

const adapterFor = async (provider: LlmProvider): Promise<Adapter> => {
    if (provider === 'gemini') return gemini()
    if (provider === 'anthropic') return anthropic()
    if (provider === 'local') return local()
    const key = await getCredential('openai')
    if (!key) throw new Error('Add an OpenAI API key in Settings.')
    return openAiCompatible('https://api.openai.com', key)
}

const resolveSelection = async (selection?: AssistantModelSelection): Promise<AssistantModelSelection> => {
    if (selection?.model.trim()) return { provider: selection.provider, model: selection.model.trim() }
    const settings = await getSettings()
    if (!settings.llm.model) throw new Error('Choose and test an AI model in Settings first.')
    return { provider: settings.llm.provider, model: settings.llm.model }
}

const collectWith = async (selection: AssistantModelSelection, messages: LlmMessage[], signal: AbortSignal): Promise<string> => {
    let text = ''
    await (await adapterFor(selection.provider)).stream(selection.model, messages, { signal, onToken: (token) => { text += token } })
    return text.trim()
}

type ResolvedGoalScope = { goalIds?: string[]; readGoalLabels: string[] }

const resolveGoalScope = async (
    message: string,
    scope: AssistantScope,
    selection: AssistantModelSelection,
    signal: AbortSignal
): Promise<ResolvedGoalScope> => {
    const goals = await getGoals()
    const goalNames = new Map(goals.map((goal) => [goal.id, goal.name]))
    goalNames.set(researchCategory, 'Research')

    if (scope.goalMode === 'open') {
        const goalId = scope.openGoalId ?? null
        return {
            goalIds: goalId === null ? [] : [goalId],
            readGoalLabels: [goalId === null ? 'Quick Notes' : (goalNames.get(goalId) ?? 'Currently open goal')]
        }
    }
    if (scope.goalMode === 'all') return { readGoalLabels: ['All goals'] }

    const candidates = [
        ...goals.map((goal) => ({ id: goal.id, name: goal.name, description: goal.description })),
        { id: researchCategory, name: 'Research', description: 'Research notes, sources, and reference material.' }
    ]
    const validIds = new Set(candidates.map((goal) => goal.id))
    const suppliedIds = (scope.goalIds ?? []).filter((id) => validIds.has(id))
    if (suppliedIds.length > 0) {
        return { goalIds: suppliedIds, readGoalLabels: suppliedIds.map((id) => goalNames.get(id) ?? id) }
    }
    if (candidates.length === 0) return { readGoalLabels: ['All goals'] }

    try {
        const raw = await collectWith(selection, [
            { role: 'system', content: 'Select every goal relevant to the user question. Compare the question with each goal name and description, prioritize specific domain evidence, and do not select broad names from generic words alone. Return only JSON: {"goalIds":["listed-id"]}. Never invent ids.' },
            { role: 'user', content: JSON.stringify({ goals: candidates, question: message }) }
        ], signal)
        const parsed = JSON.parse(raw.replace(/^```json\s*|```$/g, '')) as { goalIds?: string[] }
        const goalIds = [...new Set((parsed.goalIds ?? []).filter((id) => validIds.has(id)))]
        if (goalIds.length === 0) throw new Error('No relevant goals were selected.')
        return { goalIds, readGoalLabels: goalIds.map((id) => goalNames.get(id) ?? id) }
    } catch (error) {
        if (signal.aborted) throw error
        // Relevance selection must never turn a provider-formatting failure
        // into an empty answer. Fall back to all goals and disclose it.
        return { readGoalLabels: ['All goals (relevance fallback)'] }
    }
}

const maxNotesContextChars = 60_000
const maxSingleNoteChars = 6_000

export const buildNotesContext = async (
    message: string,
    scope: AssistantScope,
    selection?: AssistantModelSelection,
    signal = new AbortController().signal
): Promise<{ prompt: string; citedIds: string[]; readGoalLabels: string[] }> => {
    const activeSelection = await resolveSelection(selection)
    const [blocks, goals] = await Promise.all([getBlocks(), getGoals()])
    const resolvedGoals = await resolveGoalScope(message, scope, activeSelection, signal)
    const scopedBlocks = blocks.filter((block) =>
        (scope.goalMode === 'all' || resolvedGoals.goalIds === undefined ||
            (scope.goalMode === 'open' && resolvedGoals.goalIds.length === 0 ? block.categories.includes(null) : resolvedGoals.goalIds.some((id) => block.categories.includes(id)))) &&
        (scope.from === undefined || block.updatedAt >= scope.from) &&
        (scope.to === undefined || block.updatedAt <= scope.to)
    )
    const candidates = await Promise.all(scopedBlocks.map(async (block) => ({
        block,
        content: (await readBlock(block.id)).content.trim()
    })))
    const ranked = rankNoteCandidates(message, candidates.filter((candidate) => candidate.content.length > 0))
    let size = 0
    const excerpts: string[] = []
    const citedIds: string[] = []
    for (const { block, content } of ranked) {
        const excerpt = content.slice(0, maxSingleNoteChars)
        const entry = `[block:${block.id}] ${block.excerpt}\n${excerpt}`
        if (size + entry.length > maxNotesContextChars) break
        size += entry.length
        citedIds.push(block.id)
        excerpts.push(entry)
    }
    const goalContext = goals.map((goal) => `${goal.id}: ${goal.name}${goal.description ? ` - ${goal.description}` : ''}${goal.routingHints ? `; routing hints: ${goal.routingHints}` : ''}`).join('\n')
    const disclosure = resolvedGoals.readGoalLabels.join(', ')
    return {
        citedIds,
        readGoalLabels: resolvedGoals.readGoalLabels,
        prompt: `You are Prognotic's note assistant. Begin every answer with exactly "Read notes from: ${disclosure}" on its own line. Use the supplied notes when relevant. Never invent a note citation. Cite a note with exactly [block:UUID] immediately after the supported claim. If the notes do not answer the question, say so.\n\nGoals:\n${goalContext || '(none)'}\n\nNotes:\n${excerpts.join('\n\n') || '(no matching notes)'}`
    }
}

export const listModels = async (provider: LlmProvider): Promise<LlmModel[]> => (await adapterFor(provider)).listModels()

export const testConnection = async (): Promise<void> => {
    const settings = await getSettings()
    if (!settings.llm.model) throw new Error('Choose a model before testing the connection.')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
        let text = ''
        await (await adapterFor(settings.llm.provider)).stream(settings.llm.model, [{ role: 'user', content: 'Reply with OK.' }], { signal: controller.signal, onToken: (token) => { text += token } })
        if (!text.trim()) throw new Error('The provider returned an empty response.')
    } finally { clearTimeout(timeout) }
}

export const streamAssistant = async (message: string, history: LlmMessage[], scope: AssistantScope, selection: AssistantModelSelection | undefined, options: StreamOptions): Promise<{ citedBlockIds: string[]; readGoalLabels: string[] }> => {
    const activeSelection = await resolveSelection(selection)
    const context = await buildNotesContext(message, scope, activeSelection, options.signal)
    await (await adapterFor(activeSelection.provider)).stream(activeSelection.model, [{ role: 'system', content: context.prompt }, ...history, { role: 'user', content: message }], options)
    return { citedBlockIds: context.citedIds, readGoalLabels: context.readGoalLabels }
}

const collect = async (messages: LlmMessage[]): Promise<string> => {
    const selection = await resolveSelection()
    const controller = new AbortController()
    return collectWith(selection, messages, controller.signal)
}

export const runInlineAction = async (action: 'translate' | 'explain', text: string, blockId?: string): Promise<string> => {
    void blockId
    return collect([
    { role: 'system', content: action === 'translate' ? 'Translate the supplied note text into clear English. Return only the translation.' : 'Explain the supplied note text clearly and concisely. Preserve important technical details.' },
    { role: 'user', content: text }
    ])
}

export const polishTranscript = async (text: string): Promise<string> => collect([
    { role: 'system', content: 'Clean up grammar and filler words in this dictation transcript. Preserve meaning, facts, and markdown. Return only the polished transcript.' },
    { role: 'user', content: text }
])

export const classifyBlock = async (blockId: string): Promise<BlockMeta | null> => {
    const [content, goals, settings] = await Promise.all([readBlock(blockId), getGoals(), getSettings()])
    if (!content.content.trim() || !settings.llm.model || goals.length === 0) return null
    const goalList = goals.map((goal) => ({ id: goal.id, name: goal.name, description: goal.description, routingHints: goal.routingHints }))
    const raw = await collect([{ role: 'system', content: 'Classify the note against the listed goals. You must assign at least one listed goal: choose the most likely goal even when wording is indirect. Compare the note to each goal description and prioritize specific domain evidence over generic action words. A broad goal name alone is not evidence; for example, words such as work, review, task, code, or plan do not imply an employment goal without domain evidence from that goal description. You may add other relevant goals. Return only JSON: {"assignments":[{"goalId":"listed-id","confidence":0-to-1}]}. Never return an empty array or invent goal ids.' }, { role: 'user', content: JSON.stringify({ goals: goalList, note: content.content.slice(0, 6000) }) }])
    const assignments = parseRoutingAssignments(raw, content.content, goals)
    return setBlockRouting(blockId, { status: 'pending', decidedAt: Date.now(), assignments, model: `${settings.llm.provider}:${settings.llm.model}` })
}

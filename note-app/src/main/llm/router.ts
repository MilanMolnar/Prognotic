import { BlockMeta, LlmProvider } from '@shared/models'
import { AssistantScope, LlmMessage, LlmModel } from '@shared/types'
import { getBlocks, getCredential, getGoals, getSettings, readBlock, setBlockRouting } from '@/lib'

type StreamOptions = { signal: AbortSignal; onToken: (text: string) => void }

type Adapter = {
    listModels: () => Promise<LlmModel[]>
    stream: (model: string, messages: LlmMessage[], options: StreamOptions) => Promise<void>
}

const readSse = async (
    response: Response,
    signal: AbortSignal,
    onData: (data: string) => void
): Promise<void> => {
    if (!response.body) throw new Error('The provider returned an empty stream.')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (!signal.aborted) {
        const result = await reader.read()
        if (result.done) break
        buffer += decoder.decode(result.value, { stream: true })
        const events = buffer.split(/\r?\n\r?\n/)
        buffer = events.pop() ?? ''
        for (const event of events) {
            const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')
            if (data && data !== '[DONE]') onData(data)
        }
    }
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

const fuzzyScore = (query: string, text: string): number => {
    const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 1)
    return terms.reduce((score, term) => score + (text.toLowerCase().includes(term) ? term.length : 0), 0)
}

export const buildNotesContext = async (message: string, scope: AssistantScope): Promise<{ prompt: string; citedIds: string[] }> => {
    const [blocks, goals] = await Promise.all([getBlocks(), getGoals()])
    const scoped = blocks.filter((block) =>
        (scope.goalId === undefined || scope.goalId === null || block.categories.includes(scope.goalId)) &&
        (scope.from === undefined || block.updatedAt >= scope.from) &&
        (scope.to === undefined || block.updatedAt <= scope.to)
    )
    const ranked = scoped.map((block) => ({ block, score: fuzzyScore(message, block.excerpt) + block.updatedAt / 1e14 }))
        .sort((a, b) => b.score - a.score).slice(0, 8)
    let size = 0
    const excerpts: string[] = []
    const citedIds: string[] = []
    for (const { block } of ranked) {
        const content = (await readBlock(block.id)).content.trim()
        const excerpt = content.slice(0, 1800)
        if (!excerpt || size + excerpt.length > 10000) continue
        size += excerpt.length
        citedIds.push(block.id)
        excerpts.push(`[block:${block.id}] ${block.excerpt}\n${excerpt}`)
    }
    const goalContext = goals.map((goal) => `${goal.id}: ${goal.name}${goal.description ? ` - ${goal.description}` : ''}`).join('\n')
    return { citedIds, prompt: `You are Prognotic's note assistant. Use the supplied notes when relevant. Never invent a note citation. Cite a note with exactly [block:UUID] immediately after the supported claim. If the notes do not answer the question, say so.\n\nGoals:\n${goalContext || '(none)'}\n\nNotes:\n${excerpts.join('\n\n') || '(no matching notes)'}` }
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

export const streamAssistant = async (message: string, history: LlmMessage[], scope: AssistantScope, options: StreamOptions): Promise<string[]> => {
    const settings = await getSettings()
    if (!settings.llm.model) throw new Error('Choose and test an AI model in Settings first.')
    const context = await buildNotesContext(message, scope)
    await (await adapterFor(settings.llm.provider)).stream(settings.llm.model, [{ role: 'system', content: context.prompt }, ...history, { role: 'user', content: message }], options)
    return context.citedIds
}

const collect = async (messages: LlmMessage[]): Promise<string> => {
    const settings = await getSettings()
    if (!settings.llm.model) throw new Error('Choose and test an AI model in Settings first.')
    const controller = new AbortController()
    let text = ''
    await (await adapterFor(settings.llm.provider)).stream(settings.llm.model, messages, { signal: controller.signal, onToken: (token) => { text += token } })
    return text.trim()
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

const fallbackGoalId = (note: string, goals: Awaited<ReturnType<typeof getGoals>>): string | null => {
    const words = new Set(note.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
    let best = goals[0] ?? null
    let bestScore = -1
    for (const goal of goals) {
        const score = (goal.name + ' ' + goal.description).toLowerCase().match(/[a-z0-9]{3,}/g)?.reduce(
            (total, word) => total + (words.has(word) ? 1 : 0),
            0
        ) ?? 0
        if (score > bestScore) {
            best = goal
            bestScore = score
        }
    }
    return best?.id ?? null
}

export const classifyBlock = async (blockId: string): Promise<BlockMeta | null> => {
    const [content, goals, settings] = await Promise.all([readBlock(blockId), getGoals(), getSettings()])
    if (!content.content.trim() || !settings.llm.model || goals.length === 0) return null
    const goalList = goals.map((goal) => ({ id: goal.id, name: goal.name, description: goal.description }))
    const raw = await collect([{ role: 'system', content: 'Classify the note against the listed goals. You must assign at least one listed goal: choose the most likely goal even when wording is indirect. Compare the note to each goal description and prioritize specific domain evidence over generic action words. A broad goal name alone is not evidence; for example, words such as work, review, task, code, or plan do not imply an employment goal without domain evidence from that goal description. You may add other relevant goals. Return only JSON: {"assignments":[{"goalId":"listed-id","confidence":0-to-1}]}. Never return an empty array or invent goal ids.' }, { role: 'user', content: JSON.stringify({ goals: goalList, note: content.content.slice(0, 6000) }) }])
    const parsed = JSON.parse(raw.replace(/^```json\s*|```$/g, '')) as { assignments?: { goalId?: string | null; confidence?: number }[] }
    const validIds = new Set(goals.map((goal) => goal.id))
    const assignments = (parsed.assignments ?? [])
        .filter((item): item is { goalId: string; confidence?: number } => typeof item.goalId === 'string' && validIds.has(item.goalId))
        .map((item) => ({ goalId: item.goalId, confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)) }))
    if (assignments.length === 0) {
        const goalId = fallbackGoalId(content.content, goals)
        if (goalId) assignments.push({ goalId, confidence: 0.1 })
    }
    return setBlockRouting(blockId, { status: 'pending', decidedAt: Date.now(), assignments, model: `${settings.llm.provider}:${settings.llm.model}` })
}

import { isDeepStrictEqual } from 'node:util'
import { createContext, Script } from 'node:vm'

const forbiddenSourcePatterns: { label: string; pattern: RegExp }[] = [
    { label: 'module loading', pattern: /\brequire\s*\(|\bimport\s*(?:\(|[^.])/ },
    { label: 'Node process access', pattern: /\bprocess\s*\./ },
    { label: 'global runtime access', pattern: /\bglobalThis\s*\.|\bglobal\s*\./ },
    { label: 'Buffer access', pattern: /\bBuffer\s*\./ },
    { label: 'network access', pattern: /\bfetch\s*\(|\bWebSocket\s*\(|\bXMLHttpRequest\b/ },
    { label: 'dynamic code execution', pattern: /\beval\s*\(|\bnew\s+Function\b/ },
    { label: 'Node built-ins', pattern: /\bnode:|\bchild_process\b/ },
    { label: 'background timers', pattern: /\bsetInterval\s*\(|\bsetTimeout\s*\(/ }
]

export const validateGeneratedPluginSourcePolicy = (source: string): void => {
    if (!source.trim()) throw new Error('Generated index.cjs is empty.')
    if (source.length > 200_000) throw new Error('Generated index.cjs is too large.')
    if (source.includes('```')) throw new Error('Generated index.cjs contains a markdown fence.')
    const forbidden = forbiddenSourcePatterns.find(({ pattern }) => pattern.test(source))
    if (forbidden) throw new Error(`Generated index.cjs uses forbidden ${forbidden.label}.`)
}

const preflightHost = Object.freeze({
    pluginId: 'preflight-plugin',
    categoryId: 'plugin:preflight-plugin',
    getConfig: async () => ({}),
    blocks: Object.freeze({
        createBlock: async () => ({ id: 'preflight-block' }),
        readBlock: async () => ({ block: { id: 'preflight-block' }, content: '' }),
        getMeta: async () => ({ id: 'preflight-block' }),
        writeBlock: async () => ({ id: 'preflight-block' }),
        deleteBlock: async () => true,
        deleteBlockIfEmpty: async () => true,
        updateBlockCategories: async () => ({ id: 'preflight-block' }),
        appendToBlock: async () => ({ id: 'preflight-block' }),
        listBlocks: async () => [],
        getPresence: async () => null,
        setPresence: async () => ({ id: 'preflight-block' }),
        acknowledgePresence: async () => ({ id: 'preflight-block' })
    }),
    ai: Object.freeze({ complete: async () => ({ text: 'Preflight response' }) }),
    storage: Object.freeze({ get: async () => null, set: async () => true }),
    notify: (message: string) => ({ message, tone: 'info' })
})

export const preflightGeneratedPlugin = async (
    source: string,
    declaredCommands: string[]
): Promise<void> => {
    validateGeneratedPluginSourcePolicy(source)
    // This compatibility preflight is not the plugin trust boundary. It uses a
    // capability-free VM context to verify syntax and activation registration;
    // the installed plugin still remains disabled until the user enables it.
    const initialExports: Record<string, unknown> = {}
    const moduleRecord: { exports: unknown } = { exports: initialExports }
    const context = createContext(
        { exports: initialExports, module: moduleRecord, host: preflightHost },
        { codeGeneration: { strings: false, wasm: false } }
    )
    new Script(source, { filename: 'index.cjs' }).runInContext(context, { timeout: 1_000 })
    const activation = new Script(`
        const candidate = module.exports && (module.exports.activate || (module.exports.default && module.exports.default.activate));
        if (typeof candidate !== 'function') throw new Error('Entry must export an activate(host) function.');
        candidate(host);
    `).runInContext(context, { timeout: 1_000 }) as unknown

    let activationTimer: NodeJS.Timeout | undefined
    const registration = await Promise.race([
        Promise.resolve(activation),
        new Promise<never>((_, reject) => {
            activationTimer = setTimeout(
                () => reject(new Error('Generated plugin preflight activation timed out.')),
                2_000
            )
        })
    ]).finally(() => {
        if (activationTimer) clearTimeout(activationTimer)
    })
    if (registration !== undefined && (typeof registration !== 'object' || registration === null)) {
        throw new Error('activate(host) must return a registration object or nothing.')
    }
    const commands = (registration as { commands?: unknown } | undefined)?.commands ?? {}
    if (typeof commands !== 'object' || commands === null || Array.isArray(commands)) {
        throw new Error('Generated plugin commands must be an object.')
    }
    const registered = Object.entries(commands).map(([command, handler]) => {
        if (!/^[a-z][a-zA-Z0-9._-]{0,79}$/.test(command) || typeof handler !== 'function') {
            throw new Error(`Generated plugin registered an invalid command: ${command}`)
        }
        return command
    }).sort()
    if (!isDeepStrictEqual(registered, [...declaredCommands].sort())) {
        throw new Error('Generated plugin registration does not exactly match its UI commands.')
    }
}

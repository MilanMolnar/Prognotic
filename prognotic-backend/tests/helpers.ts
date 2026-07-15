import { randomUUID } from 'node:crypto'
import { memoryAdapter } from 'better-auth/adapters/memory'
import type { Express } from 'express'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { createAuth } from '../src/auth/auth.js'
import { MemorySyncStore } from '../src/db/memoryStore.js'
import type { AppSettings, BlockMeta, CalendarItem, GlossaryEntry, Goal } from '../src/types/models.js'

export const TEST_PASSWORD = 'correct-horse-battery'

export const createTestApp = (): { app: Express; store: MemorySyncStore } => {
    const auth = createAuth({
        // In-memory Better Auth storage; production uses the same pg Pool as
        // the sync store (see src/index.ts).
        database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
        baseURL: 'http://localhost:3001',
        secret: 'test-secret-do-not-use-in-production',
    })
    const store = new MemorySyncStore()
    const app = createApp({
        auth,
        store,
        corsOrigins: [],
        authRateLimit: 10000,
        // No cursor overlap in tests so incremental-pull assertions are exact.
        sync: { cursorOverlapMs: 0 },
    })
    return { app, store }
}

export const signUp = async (app: Express, email: string): Promise<request.Response> =>
    request(app)
        .post('/api/auth/sign-up/email')
        .send({ email, password: TEST_PASSWORD, name: 'Test User' })

// Registers (idempotence not needed in tests) and signs in, returning the
// bearer token issued by the bearer plugin.
export const registerAndLogin = async (app: Express, email: string): Promise<string> => {
    const signUpResponse = await signUp(app, email)
    if (signUpResponse.status !== 200) {
        throw new Error(`sign-up failed: ${signUpResponse.status} ${signUpResponse.text}`)
    }
    const signIn = await request(app)
        .post('/api/auth/sign-in/email')
        .send({ email, password: TEST_PASSWORD })
    if (signIn.status !== 200) {
        throw new Error(`sign-in failed: ${signIn.status} ${signIn.text}`)
    }
    const token = signIn.headers['set-auth-token'] ?? (signIn.body?.token as string | undefined)
    if (!token) throw new Error('no session token in sign-in response')
    return token
}

export const bearer = (token: string): Record<string, string> => ({
    authorization: `Bearer ${token}`,
})

// --- fixtures -------------------------------------------------------------

export const makeBlockMeta = (overrides: Partial<BlockMeta> = {}): BlockMeta => {
    const id = overrides.id ?? randomUUID()
    return {
        id,
        file: `${id}.md`,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
        categories: [null],
        excerpt: 'Buy oat milk',
        ...overrides,
    }
}

export const makeGoal = (overrides: Partial<Goal> = {}): Goal => ({
    id: randomUUID(),
    name: 'Ship sync server',
    description: 'Everything related to the Prognotic cloud backend',
    routingHints: 'sync, backend, api',
    createdAt: 1_700_000_000_000,
    ...overrides,
})

export const makeCalendarItem = (overrides: Partial<CalendarItem> = {}): CalendarItem => ({
    id: randomUUID(),
    source: 'note',
    sourceOrder: 0,
    sourceText: 'dentist tomorrow at 10',
    sourceFingerprint: 'fp-dentist-10',
    title: 'Dentist',
    excerpt: 'dentist tomorrow at 10',
    status: 'pending_validation',
    confidence: 0.8,
    allDay: false,
    timeZone: 'Europe/Budapest',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
})

export const makeGlossaryEntry = (overrides: Partial<GlossaryEntry> = {}): GlossaryEntry => ({
    id: randomUUID(),
    key: 'git rebase',
    explanation: 'Replays commits onto a new base branch.',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
})

// Mirrors defaultSettings in note-app/src/shared/constants.ts.
export const makeSettings = (): AppSettings => ({
    blockWindowMinutes: 5,
    glossaryKeyMaxLength: 150,
    pinnedGoalIds: [],
    captureMode: 'chat',
    dictationMode: 'windows',
    onboardingCompleted: true,
    onboardingSkipped: false,
    llm: {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        pluginWizardModel: '',
        imageRecognitionModel: '',
        localBaseUrl: 'http://127.0.0.1:1234',
        polishDictation: false,
        aiBlockNameSummary: true,
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
    hasGeminiApiKey: true,
    hasOpenaiApiKey: false,
    hasAnthropicApiKey: false,
    hasLocalApiToken: false,
})

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

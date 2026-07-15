// Request validation for the sync API. Schemas mirror the client shapes in
// src/types/models.ts (which mirror note-app/src/shared/models.ts).
//
// zod strips unknown object keys by default — this is the primary guard that
// raw credentials (API keys, OAuth tokens) can never enter the database:
// only the whitelisted public fields below survive parsing.

import { z } from 'zod'

const timestamp = z.number().int().nonnegative()
// Confidence scores are 0..1 on the client.
const confidence = z.number().min(0).max(1)

// Blocks and goals are created with crypto.randomUUID() on the client
// (note-app/src/main/lib/index.ts), so their ids are strict UUIDs. Calendar
// item ids are treated as opaque strings.
const uuid = z.uuid()
const calendarItemId = z.string().min(1).max(200)

export const suggestedNewGoalSchema = z.object({
    name: z.string().max(200),
    description: z.string().max(2000),
    confidence,
})

export const blockRoutingSchema = z.object({
    status: z.enum(['pending', 'applied', 'overridden']),
    decidedAt: timestamp,
    assignments: z.array(z.object({ goalId: z.string().nullable(), confidence })).max(50),
    model: z.string().max(200),
    hasConfidentMatch: z.boolean().optional(),
    suggestedNewGoal: suggestedNewGoalSchema.optional(),
})

export const goalPresenceSchema = z.object({
    source: z.enum(['user', 'routed', 'assistant', 'research', 'plugin']),
    visited: z.boolean(),
})

export const blockMetaSchema = z.object({
    id: uuid,
    file: z.string().min(1).max(300),
    createdAt: timestamp,
    updatedAt: timestamp,
    categories: z.array(z.string().max(200).nullable()).min(1).max(100),
    excerpt: z.string().max(500),
    aiLabel: z.string().max(200).optional(),
    goalPresence: z.record(z.string(), goalPresenceSchema).optional(),
    routing: blockRoutingSchema.optional(),
    routingHistory: z.array(blockRoutingSchema).max(100).optional(),
})

export const goalSchema = z.object({
    id: uuid,
    name: z.string().min(1).max(200),
    description: z.string().max(2000),
    routingHints: z.string().max(2000).optional(),
    createdAt: timestamp,
})

// Limits mirror the client's hard caps (note-app/src/shared/constants.ts):
// keys are clamped to at most 300 chars by the configurable setting's upper
// bound; explanations have a 100k storage-safety cap and no UI limit.
export const glossaryEntrySchema = z.object({
    id: uuid,
    key: z.string().min(1).max(300),
    explanation: z.string().min(1).max(100_000),
    createdAt: timestamp,
    updatedAt: timestamp,
})

const calendarItemResolutionSchema = z.object({
    type: z.enum(['validated', 'accepted_suggestion', 'custom_time', 'manual_edit']),
    resolvedAt: timestamp,
})

// Google *link metadata* syncs so devices agree on which remote event an
// item maps to. The account-level Google syncToken never appears here.
const calendarItemGoogleLinkSchema = z.object({
    calendarId: z.string().max(500),
    eventId: z.string().max(500),
    etag: z.string().max(500).optional(),
    remoteUpdatedAt: timestamp.optional(),
    lastSyncedAt: timestamp,
    lastSyncedLocalHash: z.string().max(200),
})

export const calendarItemSchema = z.object({
    id: calendarItemId,
    blockId: z.string().max(200).optional(),
    source: z.enum(['note', 'google']),
    sourceOrder: z.number().int().nonnegative(),
    sourceText: z.string().max(10000),
    sourceFingerprint: z.string().max(500),
    sourceBlockUpdatedAt: timestamp.optional(),
    title: z.string().min(1).max(160),
    excerpt: z.string().max(500),
    status: z.enum(['pending_validation', 'verified', 'uncertain', 'resolved', 'dismissed']),
    confidence,
    start: z.string().max(64).optional(),
    end: z.string().max(64).optional(),
    allDay: z.boolean(),
    timeZone: z.string().max(100),
    suggestedStart: z.string().max(64).optional(),
    suggestedEnd: z.string().max(64).optional(),
    resolution: calendarItemResolutionSchema.optional(),
    google: calendarItemGoogleLinkSchema.optional(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: timestamp.optional(),
})

const llmProviderSchema = z.enum(['gemini', 'openai', 'anthropic', 'local'])

const verifiedLlmConnectionSchema = z.object({
    provider: llmProviderSchema,
    model: z.string().max(200),
})

export const llmSettingsSchema = z.object({
    provider: llmProviderSchema,
    model: z.string().max(200),
    pluginWizardModel: z.string().max(200),
    imageRecognitionModel: z.string().max(200),
    localBaseUrl: z.string().max(500),
    polishDictation: z.boolean(),
    aiBlockNameSummary: z.boolean(),
    verifiedConnection: verifiedLlmConnectionSchema.optional(),
    verifiedImageRecognitionConnection: verifiedLlmConnectionSchema.optional(),
})

export const googleCalendarSettingsSchema = z.object({
    enabled: z.boolean(),
    pushEnabled: z.boolean(),
    pullEnabled: z.boolean(),
    autoSyncMinutes: z.number().int().min(0).max(1440),
    connectedEmail: z.string().max(320).optional(),
    hasOAuthClient: z.boolean(),
    isConnected: z.boolean(),
    lastSyncAt: timestamp.optional(),
    lastSyncStatus: z.enum(['idle', 'success', 'error']),
    lastSyncMessage: z.string().max(500).optional(),
})

// Whitelist of public settings. Unknown keys (including anything that looks
// like a credential) are stripped, and there is no field through which a raw
// key value could be accepted. The has* booleans indicate presence only.
export const appSettingsSchema = z.object({
    blockWindowMinutes: z.number().int().min(1).max(1440),
    glossaryKeyMaxLength: z.number().int().min(50).max(300),
    pinnedGoalIds: z.array(z.string().max(200)).max(10),
    captureMode: z.enum(['chat', 'natural']),
    dictationMode: z.enum(['windows', 'macos', 'whisprflow']),
    onboardingCompleted: z.boolean(),
    onboardingSkipped: z.boolean(),
    onboardingCompletedAt: timestamp.optional(),
    llm: llmSettingsSchema,
    googleCalendar: googleCalendarSettingsSchema,
    hasWhisprflowApiKey: z.boolean(),
    hasGeminiApiKey: z.boolean(),
    hasOpenaiApiKey: z.boolean(),
    hasAnthropicApiKey: z.boolean(),
    hasLocalApiToken: z.boolean(),
})

// ---------------------------------------------------------------------------
// Sync envelopes
// ---------------------------------------------------------------------------

const MAX_BATCH = 500
// One block's markdown body. 2 MB of text is far beyond any realistic note.
const MAX_CONTENT_LENGTH = 2_000_000

export const blockUpsertSchema = z.object({
    meta: blockMetaSchema,
    // Omitted content on an update means "metadata-only change, keep the
    // server's stored markdown" (e.g. re-categorization, routing changes).
    content: z.string().max(MAX_CONTENT_LENGTH).optional(),
})

const blockDeleteSchema = z.object({ id: uuid, deletedAt: timestamp })

// Goal has no updatedAt in the client model, so the sync envelope carries
// one — clients stamp it when the goal is created or edited.
export const goalUpsertSchema = goalSchema.extend({ updatedAt: timestamp })

const goalDeleteSchema = z.object({ id: uuid, deletedAt: timestamp })

// Calendar deletes come in two forms: an upsert whose item carries deletedAt
// (Google-linked tombstones kept by the client), or an explicit delete for
// items the client hard-removed locally.
const calendarDeleteSchema = z.object({ id: calendarItemId, deletedAt: timestamp })

// Glossary entries carry their own updatedAt in the client model; deletes
// are hard removals locally, so they arrive as explicit tombstone requests.
const glossaryDeleteSchema = z.object({ id: uuid, deletedAt: timestamp })

const changeSetSchema = <U extends z.ZodType, D extends z.ZodType>(upsert: U, del: D) =>
    z.object({
        upserts: z.array(upsert).max(MAX_BATCH).default([]),
        deletes: z.array(del).max(MAX_BATCH).default([]),
    })

export const pushRequestSchema = z.object({
    // Client-generated stable UUID identifying the device installation.
    deviceId: uuid,
    blocks: changeSetSchema(blockUpsertSchema, blockDeleteSchema).optional(),
    goals: changeSetSchema(goalUpsertSchema, goalDeleteSchema).optional(),
    calendarItems: changeSetSchema(calendarItemSchema, calendarDeleteSchema).optional(),
    glossaryEntries: changeSetSchema(glossaryEntrySchema, glossaryDeleteSchema).optional(),
    settings: z.object({ value: appSettingsSchema, updatedAt: timestamp }).optional(),
})

export const pullQuerySchema = z.object({
    since: z.coerce.number().int().nonnegative().default(0),
    deviceId: uuid.optional(),
})

export type BlockUpsert = z.infer<typeof blockUpsertSchema>
export type GoalUpsert = z.infer<typeof goalUpsertSchema>
export type GlossaryEntryUpsert = z.infer<typeof glossaryEntrySchema>
export type PushRequest = z.infer<typeof pushRequestSchema>
export type PullQuery = z.infer<typeof pullQuerySchema>

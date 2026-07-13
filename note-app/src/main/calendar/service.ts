import type { CalendarItem } from '@shared/models'
import type {
    ExtractCalendarForBlockResult,
    ResolveCalendarItemInput,
    UpdateCalendarItemInput
} from '@shared/types'
import { getBlocks, readBlockSnapshot } from '../lib'
import { completeTemporalExtraction } from '../llm/router'
import {
    extractDeterministicTemporalCandidates,
    mergeTemporalCandidates,
    parseTemporalLlmResponse
} from './extraction'
import { reconcileNoteCalendarItems } from './reconcile'
import {
    getCalendarItems,
    mutateCalendarState,
    removeCalendarItemsForBlock,
    readCalendarState
} from './store'

const hourMs = 60 * 60 * 1000
const systemTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const visibleItems = (items: Record<string, CalendarItem>): CalendarItem[] =>
    Object.values(items)
        .filter((item) => item.deletedAt === undefined)
        .sort((a, b) => a.createdAt - b.createdAt)

export { getCalendarItems }

const extractCalendarForBlockInternal = async (
    blockId: string,
    allowAi: boolean
): Promise<ExtractCalendarForBlockResult> => {
    let snapshot = await readBlockSnapshot(blockId)
    if (!snapshot) {
        await removeCalendarItemsForBlock(blockId)
        return { items: await getCalendarItems(), usedAi: false }
    }

    const reference = new Date()
    const timeZone = systemTimeZone()
    const calendarState = await readCalendarState()
    const scheduledStarts = Object.values(calendarState.items)
        .filter((item) => item.deletedAt === undefined && typeof item.start === 'string' && !item.allDay)
        .map((item) => item.start as string)
    let deterministic = extractDeterministicTemporalCandidates(
        snapshot.content,
        reference,
        scheduledStarts
    )
    let aiCandidates = [] as ReturnType<typeof extractDeterministicTemporalCandidates>
    let usedAi = false
    let warning: string | undefined

    if (allowAi) {
        try {
            const raw = await completeTemporalExtraction(
                snapshot.content,
                reference.toISOString(),
                timeZone
            )
            if (raw !== null) {
                usedAi = true
                aiCandidates = parseTemporalLlmResponse(raw, snapshot.content, reference, scheduledStarts)
            }
        } catch (error) {
            warning = error instanceof Error
                ? `${error.message} Deterministic calendar parsing was used instead.`
                : 'AI calendar extraction failed. Deterministic calendar parsing was used instead.'
        }
    }

    const latestSnapshot = await readBlockSnapshot(blockId)
    if (!latestSnapshot) {
        await removeCalendarItemsForBlock(blockId)
        return { items: await getCalendarItems(), usedAi: false, ...(warning ? { warning } : {}) }
    }
    if (latestSnapshot.meta.updatedAt !== snapshot.meta.updatedAt) {
        snapshot = latestSnapshot
        deterministic = extractDeterministicTemporalCandidates(
            snapshot.content,
            new Date(),
            scheduledStarts
        )
        aiCandidates = []
        usedAi = false
        warning = 'The note changed during AI extraction, so the newest saved text used deterministic parsing.'
    }

    const candidates = mergeTemporalCandidates(deterministic, aiCandidates)
    const items = await mutateCalendarState((state) => {
        if ((state.extractedBlocks[blockId] ?? 0) > snapshot.meta.updatedAt) {
            return visibleItems(state.items)
        }
        const existing = Object.values(state.items).filter(
            (item) => item.source === 'note' && item.blockId === blockId
        )
        const reconciled = reconcileNoteCalendarItems(existing, candidates, {
            blockId,
            blockUpdatedAt: snapshot.meta.updatedAt,
            excerpt: snapshot.meta.excerpt,
            timeZone,
            now: Date.now()
        })

        for (const item of existing) delete state.items[item.id]
        for (const item of reconciled) state.items[item.id] = item
        state.extractedBlocks[blockId] = snapshot.meta.updatedAt
        return visibleItems(state.items)
    })

    return { items, usedAi, ...(warning ? { warning } : {}) }
}

export const extractCalendarForBlock = async (
    blockId: string
): Promise<ExtractCalendarForBlockResult> => extractCalendarForBlockInternal(blockId, true)

export const backfillCalendarFromVault = async (): Promise<CalendarItem[]> => {
    const [blocks, state] = await Promise.all([getBlocks(), readCalendarState()])
    for (const block of blocks) {
        if ((state.extractedBlocks[block.id] ?? 0) >= block.updatedAt) continue
        try {
            await extractCalendarForBlockInternal(block.id, false)
        } catch {
            // One unreadable note must not prevent persisted calendar items
            // for the rest of the vault from loading.
        }
    }
    return getCalendarItems()
}

export const validateCalendarItem = async (id: string): Promise<CalendarItem | null> =>
    mutateCalendarState((state) => {
        const item = state.items[id]
        if (!item || item.deletedAt !== undefined || item.status !== 'pending_validation' || !item.start) {
            return null
        }
        const now = Date.now()
        item.status = 'verified'
        item.resolution = { type: 'validated', resolvedAt: now }
        item.updatedAt = now
        return { ...item }
    })

const normalizedDateTime = (value: string | undefined): string | null => {
    if (!value) return null
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

const nextAllDayDate = (value: string): string => {
    const [year, month, day] = value.split('-').map(Number)
    const next = new Date(year, month - 1, day + 1)
    return [next.getFullYear(), next.getMonth() + 1, next.getDate()]
        .map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0'))
        .join('-')
}

export const resolveCalendarItem = async (
    input: ResolveCalendarItemInput
): Promise<CalendarItem | null> => mutateCalendarState((state) => {
    const item = state.items[input.id]
    if (!item || item.deletedAt !== undefined || item.status !== 'uncertain') return null
    const now = Date.now()

    if (input.action === 'dismiss') {
        item.status = 'dismissed'
        delete item.start
        delete item.end
        item.updatedAt = now
        return { ...item }
    }

    const start = normalizedDateTime(
        input.action === 'accept_suggestion' ? item.suggestedStart : input.start
    )
    if (!start) return null
    const startMs = Date.parse(start)
    const requestedEnd = normalizedDateTime(
        input.action === 'accept_suggestion' ? item.suggestedEnd : input.end
    )
    const end = requestedEnd && Date.parse(requestedEnd) > startMs
        ? requestedEnd
        : new Date(startMs + hourMs).toISOString()

    item.status = 'verified'
    item.start = start
    item.end = end
    item.allDay = false
    item.timeZone = systemTimeZone()
    item.resolution = {
        type: input.action === 'accept_suggestion' ? 'accepted_suggestion' : 'custom_time',
        resolvedAt: now
    }
    item.updatedAt = now
    return { ...item }
})

export const updateCalendarItem = async (
    input: UpdateCalendarItemInput
): Promise<CalendarItem | null> => mutateCalendarState((state) => {
    const item = state.items[input.id]
    if (!item || item.deletedAt !== undefined) return null

    const title = input.title?.trim().slice(0, 160)
    if (title) item.title = title
    if (input.allDay === true && input.start && /^\d{4}-\d{2}-\d{2}$/.test(input.start)) {
        item.start = input.start
        item.end = input.end && /^\d{4}-\d{2}-\d{2}$/.test(input.end)
            ? input.end
            : nextAllDayDate(input.start)
        item.allDay = true
        item.timeZone = systemTimeZone()
    } else if (input.start) {
        const start = normalizedDateTime(input.start)
        if (!start) return null
        const end = normalizedDateTime(input.end)
        item.start = start
        item.end = end && Date.parse(end) > Date.parse(start)
            ? end
            : new Date(Date.parse(start) + hourMs).toISOString()
        item.allDay = false
        item.timeZone = systemTimeZone()
    }
    const now = Date.now()
    item.status = 'verified'
    item.resolution = { type: 'manual_edit', resolvedAt: now }
    item.updatedAt = now
    return { ...item }
})

export const deleteCalendarItem = async (id: string): Promise<boolean> =>
    mutateCalendarState((state) => {
        const item = state.items[id]
        if (!item || item.deletedAt !== undefined) return false
        if (item.google) {
            const now = Date.now()
            item.deletedAt = now
            item.updatedAt = now
        } else {
            delete state.items[id]
        }
        return true
    })

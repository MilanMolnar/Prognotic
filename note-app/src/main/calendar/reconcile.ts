import type { CalendarItem } from '@shared/models'
import { randomUUID } from 'crypto'
import { temporalCandidateFingerprint, type TemporalCandidate } from './extraction'

export type ReconcileNoteCalendarContext = {
    blockId: string
    blockUpdatedAt: number
    excerpt: string
    timeZone: string
    now: number
}

const candidateFields = (
    candidate: TemporalCandidate,
    order: number,
    context: ReconcileNoteCalendarContext
): Pick<CalendarItem,
    'sourceOrder' |
    'sourceText' |
    'sourceFingerprint' |
    'sourceBlockUpdatedAt' |
    'title' |
    'excerpt' |
    'status' |
    'confidence' |
    'start' |
    'end' |
    'allDay' |
    'timeZone' |
    'suggestedStart' |
    'suggestedEnd'
> => ({
    sourceOrder: order,
    sourceText: candidate.sourceText,
    sourceFingerprint: temporalCandidateFingerprint(candidate),
    sourceBlockUpdatedAt: context.blockUpdatedAt,
    title: candidate.title,
    excerpt: context.excerpt,
    status: candidate.kind === 'concrete' ? 'pending_validation' : 'uncertain',
    confidence: candidate.confidence,
    ...(candidate.start ? { start: candidate.start } : {}),
    ...(candidate.end ? { end: candidate.end } : {}),
    allDay: candidate.allDay,
    timeZone: context.timeZone,
    ...(candidate.suggestedStart ? { suggestedStart: candidate.suggestedStart } : {}),
    ...(candidate.suggestedEnd ? { suggestedEnd: candidate.suggestedEnd } : {}),
})

export const reconcileNoteCalendarItems = (
    existing: CalendarItem[],
    candidates: TemporalCandidate[],
    context: ReconcileNoteCalendarContext
): CalendarItem[] => {
    const staleAgainst = existing.reduce(
        (latest, item) => Math.max(latest, item.sourceBlockUpdatedAt ?? 0),
        0
    )
    if (staleAgainst > context.blockUpdatedAt) return existing

    const unmatched = new Set(existing.map((item) => item.id))
    const byFingerprint = new Map<string, CalendarItem[]>()
    for (const item of existing) {
        const values = byFingerprint.get(item.sourceFingerprint) ?? []
        values.push(item)
        byFingerprint.set(item.sourceFingerprint, values)
    }

    const prepared = candidates.map((candidate, order) => ({
        order,
        fields: candidateFields(candidate, order, context)
    }))
    const reservedExactIds = new Set<string>()
    const exactMatches = new Map<number, CalendarItem>()
    for (const entry of prepared) {
        const exact = byFingerprint.get(entry.fields.sourceFingerprint)?.find(
            (item) => !reservedExactIds.has(item.id)
        )
        if (!exact) continue
        reservedExactIds.add(exact.id)
        exactMatches.set(entry.order, exact)
    }

    const next: CalendarItem[] = []
    prepared.forEach(({ order, fields }) => {
        const exact = exactMatches.get(order)
        const positional = existing.find(
            (item) => unmatched.has(item.id) && !reservedExactIds.has(item.id) && item.sourceOrder === order
        )
        const previous = exact ?? positional

        if (!previous) {
            next.push({
                id: randomUUID(),
                blockId: context.blockId,
                source: 'note',
                ...fields,
                createdAt: context.now,
                updatedAt: context.now,
            })
            return
        }

        unmatched.delete(previous.id)
        const exactIntent = previous.sourceFingerprint === fields.sourceFingerprint
        if (exactIntent) {
            const revived = previous.deletedAt !== undefined
            const preserveReviewedTitle = previous.status === 'verified' ||
                previous.status === 'resolved' ||
                previous.status === 'dismissed'
            const metadataOnlyUpdate: CalendarItem = {
                ...previous,
                sourceOrder: fields.sourceOrder,
                sourceText: fields.sourceText,
                sourceFingerprint: fields.sourceFingerprint,
                sourceBlockUpdatedAt: fields.sourceBlockUpdatedAt,
                title: preserveReviewedTitle ? previous.title : fields.title,
                excerpt: fields.excerpt,
                confidence: fields.confidence,
                timeZone: fields.timeZone,
                ...(revived ? { updatedAt: context.now } : {}),
            }
            if (revived) delete metadataOnlyUpdate.deletedAt

            // Relative phrases must not slide into the future every time an
            // unrelated part of the note is edited. Keep the accepted or
            // provisionally shown slot while the temporal source is exact.
            next.push(metadataOnlyUpdate)
            return
        }

        // A materially changed temporal line keeps the stable local/Google
        // identity but requires fresh validation. This also intentionally
        // revives a previously dismissed item only after its source changed.
        next.push({
            ...previous,
            ...fields,
            status: fields.status,
            resolution: undefined,
            deletedAt: undefined,
            updatedAt: context.now,
        })
    })

    for (const previous of existing) {
        if (!unmatched.has(previous.id) || !previous.google) continue
        next.push({
            ...previous,
            sourceBlockUpdatedAt: context.blockUpdatedAt,
            deletedAt: previous.deletedAt ?? context.now,
            updatedAt: previous.deletedAt === undefined ? context.now : previous.updatedAt,
        })
    }

    return next
}

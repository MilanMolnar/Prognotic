import { createHash } from 'crypto'

export type TemporalCandidate = {
    kind: 'concrete' | 'uncertain'
    title: string
    sourceText: string
    confidence: number
    start?: string
    end?: string
    allDay: boolean
    suggestedStart?: string
    suggestedEnd?: string
}

const dayMs = 24 * 60 * 60 * 1000
const hourMs = 60 * 60 * 1000
const vaguePattern = /\b(soon|this\s+week|next\s+week|when\s+i\s+can|whenever\s+possible|urgent|urgently|asap|high[ -]priority|important)\b/i
const concreteEvidencePattern = /(?:\b20\d{2}-\d{2}-\d{2}\b|\b(?:today|tomorrow|sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?)\b)/i
const monthNumbers: Record<string, number> = {
    january: 1, jan: 1,
    february: 2, feb: 2,
    march: 3, mar: 3,
    april: 4, apr: 4,
    may: 5,
    june: 6, jun: 6,
    july: 7, jul: 7,
    august: 8, aug: 8,
    september: 9, sep: 9, sept: 9,
    october: 10, oct: 10,
    november: 11, nov: 11,
    december: 12, dec: 12,
}
const weekDays: Record<string, number> = {
    sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2, tues: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4, thurs: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6,
}

const clampConfidence = (value: unknown, fallback: number): number => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback
}

const cleanLine = (line: string): string => line
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)/, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const titleForLine = (line: string): string => cleanLine(line).slice(0, 160) || 'Scheduled note'
const pad = (value: number): string => String(value).padStart(2, '0')
const dateKey = (year: number, month: number, day: number): string =>
    `${year}-${pad(month)}-${pad(day)}`

const validLocalDate = (year: number, month: number, day: number): boolean => {
    const date = new Date(year, month - 1, day)
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

const nextDateKey = (value: string): string => {
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(year, month - 1, day + 1)
    return dateKey(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

const hour24 = (hour: number, meridiem?: string): number | null => {
    if (meridiem) {
        if (hour < 1 || hour > 12) return null
        const normalized = meridiem.toLowerCase().replace(/\./g, '')
        return normalized === 'pm' ? (hour % 12) + 12 : hour % 12
    }
    return hour >= 0 && hour <= 23 ? hour : null
}

const localDateTimeIso = (
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number
): string | null => {
    if (!validLocalDate(year, month, day) || minute < 0 || minute > 59) return null
    const date = new Date(year, month - 1, day, hour, minute, 0, 0)
    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day ||
        date.getHours() !== hour ||
        date.getMinutes() !== minute
    ) return null
    return date.toISOString()
}

const concreteCandidate = (
    line: string,
    start: string,
    allDay: boolean,
    confidence: number
): TemporalCandidate => ({
    kind: 'concrete',
    title: titleForLine(line),
    sourceText: cleanLine(line),
    confidence,
    start,
    end: allDay ? nextDateKey(start) : new Date(Date.parse(start) + hourMs).toISOString(),
    allDay,
})

const parseIsoDateLine = (line: string): TemporalCandidate[] => {
    const candidates: TemporalCandidate[] = []
    const pattern = /\b(20\d{2})-(\d{2})-(\d{2})(?:[T\s]+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?)?\b/gi
    for (const match of line.matchAll(pattern)) {
        const year = Number(match[1])
        const month = Number(match[2])
        const day = Number(match[3])
        if (!validLocalDate(year, month, day)) continue
        if (match[4] === undefined) {
            candidates.push(concreteCandidate(line, dateKey(year, month, day), true, 0.98))
            continue
        }
        const hour = hour24(Number(match[4]), match[6])
        const start = hour === null ? null : localDateTimeIso(year, month, day, hour, Number(match[5] ?? 0))
        if (start) candidates.push(concreteCandidate(line, start, false, 0.99))
    }
    return candidates
}

const parseNamedMonthLine = (line: string, reference: Date): TemporalCandidate[] => {
    const candidates: TemporalCandidate[] = []
    const pattern = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(20\d{2}))?(?:\s*(?:at|@)?\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?))?\b/gi
    for (const match of line.matchAll(pattern)) {
        const month = monthNumbers[match[1].toLowerCase()]
        const day = Number(match[2])
        let year = match[3] ? Number(match[3]) : reference.getFullYear()
        if (!match[3] && validLocalDate(year, month, day)) {
            const candidateDate = new Date(year, month - 1, day, 23, 59, 59, 999)
            if (candidateDate.getTime() < reference.getTime()) year += 1
        }
        if (!validLocalDate(year, month, day)) continue
        if (match[4] === undefined) {
            candidates.push(concreteCandidate(line, dateKey(year, month, day), true, 0.92))
            continue
        }
        const hour = hour24(Number(match[4]), match[6])
        const start = hour === null ? null : localDateTimeIso(year, month, day, hour, Number(match[5] ?? 0))
        if (start) candidates.push(concreteCandidate(line, start, false, 0.95))
    }
    return candidates
}

const parseRelativeLine = (line: string, reference: Date): TemporalCandidate[] => {
    const candidates: TemporalCandidate[] = []
    const pattern = /\b(today|tomorrow|(?:(next)\s+)?(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?))\b\s*(?:at|around|@)?\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|(?:hours?))?\b/gi
    for (const match of line.matchAll(pattern)) {
        const hourText = match[4]
        // Without a meridiem, require a colon so ordinary numbers after a
        // weekday ("Tuesday 3 tasks") are not treated as times.
        if (!match[6] && match[5] === undefined) continue
        const hour = hour24(Number(hourText), match[6]?.startsWith('hour') ? undefined : match[6])
        if (hour === null) continue

        const date = new Date(reference)
        date.setSeconds(0, 0)
        const token = match[1].toLowerCase()
        if (token === 'tomorrow') {
            date.setDate(date.getDate() + 1)
        } else if (token !== 'today') {
            const weekdayToken = (match[3] ?? token.replace(/^next\s+/, '')).toLowerCase()
            const target = weekDays[weekdayToken]
            if (target === undefined) continue
            let days = (target - date.getDay() + 7) % 7
            if (match[2] || days === 0) days += 7
            date.setDate(date.getDate() + days)
        }
        date.setHours(hour, Number(match[5] ?? 0), 0, 0)
        if (token === 'today' && date.getTime() <= reference.getTime()) continue
        candidates.push(concreteCandidate(line, date.toISOString(), false, 0.9))
    }
    return candidates
}

const dedupeCandidates = (candidates: TemporalCandidate[]): TemporalCandidate[] => {
    const seen = new Set<string>()
    const result: TemporalCandidate[] = []
    for (const candidate of candidates) {
        const key = `${candidate.kind}:${candidate.sourceText.toLowerCase()}:${candidate.start ?? ''}`
        if (seen.has(key)) continue
        seen.add(key)
        result.push(candidate)
    }
    return result
}

export const suggestTimeSlot = (reference: Date, scheduledStarts: string[] = []): { start: string; end: string } => {
    const occupied = new Set(scheduledStarts
        .map((value) => Date.parse(value))
        .filter(Number.isFinite)
        .map((value) => Math.floor(value / hourMs)))
    const cursor = new Date(reference)
    cursor.setSeconds(0, 0)
    cursor.setMinutes(cursor.getMinutes() < 30 ? 30 : 0)
    if (cursor.getMinutes() === 0) cursor.setHours(cursor.getHours() + 1)

    for (let dayOffset = 0; dayOffset < 30; dayOffset += 1) {
        const day = new Date(cursor)
        day.setDate(cursor.getDate() + dayOffset)
        if (day.getDay() === 0 || day.getDay() === 6) continue
        const firstHour = dayOffset === 0 ? Math.max(9, day.getHours()) : 9
        for (let hour = firstHour; hour <= 16; hour += 1) {
            const slot = new Date(day)
            slot.setHours(hour, dayOffset === 0 && hour === day.getHours() ? day.getMinutes() : 0, 0, 0)
            if (slot.getTime() <= reference.getTime()) continue
            if (occupied.has(Math.floor(slot.getTime() / hourMs))) continue
            return {
                start: slot.toISOString(),
                end: new Date(slot.getTime() + hourMs).toISOString()
            }
        }
    }

    const fallback = new Date(reference.getTime() + dayMs)
    fallback.setHours(9, 0, 0, 0)
    return { start: fallback.toISOString(), end: new Date(fallback.getTime() + hourMs).toISOString() }
}

export const extractDeterministicTemporalCandidates = (
    note: string,
    reference = new Date(),
    scheduledStarts: string[] = []
): TemporalCandidate[] => {
    const candidates: TemporalCandidate[] = []
    const suggestion = suggestTimeSlot(reference, scheduledStarts)
    const lines = note.split(/\r?\n/).filter((line) => cleanLine(line).length > 0)

    for (const line of lines) {
        const concrete = [
            ...parseIsoDateLine(line),
            ...parseNamedMonthLine(line, reference),
            ...parseRelativeLine(line, reference)
        ]
        candidates.push(...concrete)
        if (concrete.length === 0 && vaguePattern.test(line)) {
            candidates.push({
                kind: 'uncertain',
                title: titleForLine(line),
                sourceText: cleanLine(line),
                confidence: 0.72,
                allDay: false,
                suggestedStart: suggestion.start,
                suggestedEnd: suggestion.end,
            })
        }
    }

    return dedupeCandidates(candidates)
}

const parseJsonPayload = (raw: string): unknown => {
    const unfenced = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    const candidates = [unfenced]
    const objectStart = unfenced.indexOf('{')
    const objectEnd = unfenced.lastIndexOf('}')
    if (objectStart >= 0 && objectEnd > objectStart) candidates.push(unfenced.slice(objectStart, objectEnd + 1))
    const arrayStart = unfenced.indexOf('[')
    const arrayEnd = unfenced.lastIndexOf(']')
    if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(unfenced.slice(arrayStart, arrayEnd + 1))
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate) as unknown
        } catch {
            // Providers occasionally surround otherwise valid JSON with prose.
        }
    }
    return null
}

const normalizedForMatch = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').trim()

export const parseTemporalLlmResponse = (
    raw: string,
    note: string,
    reference = new Date(),
    scheduledStarts: string[] = []
): TemporalCandidate[] => {
    const payload = parseJsonPayload(raw)
    const values = Array.isArray(payload)
        ? payload
        : payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)
            ? (payload as { items: unknown[] }).items
            : []
    const normalizedNote = normalizedForMatch(note)
    const fallbackSuggestion = suggestTimeSlot(reference, scheduledStarts)
    const candidates: TemporalCandidate[] = []

    for (const value of values) {
        if (!value || typeof value !== 'object') continue
        const item = value as Record<string, unknown>
        if (item.kind !== 'concrete' && item.kind !== 'uncertain') continue
        const sourceText = typeof item.sourceText === 'string' ? cleanLine(item.sourceText) : ''
        if (!sourceText || !normalizedNote.includes(normalizedForMatch(sourceText))) continue
        const title = typeof item.title === 'string' && cleanLine(item.title)
            ? cleanLine(item.title).slice(0, 160)
            : titleForLine(sourceText)

        if (item.kind === 'concrete') {
            if (!concreteEvidencePattern.test(sourceText)) continue
            const allDay = item.allDay === true
            const rawStart = typeof item.start === 'string' ? item.start : ''
            if (allDay) {
                if (!/^20\d{2}-\d{2}-\d{2}$/.test(rawStart)) continue
                const [year, month, day] = rawStart.split('-').map(Number)
                if (!validLocalDate(year, month, day)) continue
                const suppliedEnd = typeof item.end === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(item.end)
                    ? item.end
                    : ''
                const endParts = suppliedEnd.split('-').map(Number)
                const rawEnd = suppliedEnd > rawStart &&
                    endParts.length === 3 &&
                    validLocalDate(endParts[0], endParts[1], endParts[2])
                    ? suppliedEnd
                    : nextDateKey(rawStart)
                candidates.push({
                    kind: 'concrete', title, sourceText, allDay: true,
                    confidence: clampConfidence(item.confidence, 0.75),
                    start: rawStart,
                    end: rawEnd,
                })
                continue
            }

            const startMs = Date.parse(rawStart)
            if (!Number.isFinite(startMs)) continue
            const parsedEnd = typeof item.end === 'string' ? Date.parse(item.end) : Number.NaN
            const endMs = Number.isFinite(parsedEnd) && parsedEnd > startMs ? parsedEnd : startMs + hourMs
            candidates.push({
                kind: 'concrete', title, sourceText, allDay: false,
                confidence: clampConfidence(item.confidence, 0.75),
                start: new Date(startMs).toISOString(),
                end: new Date(endMs).toISOString(),
            })
            continue
        }

        const suggestedMs = typeof item.suggestedStart === 'string'
            ? Date.parse(item.suggestedStart)
            : Number.NaN
        const suggestedDate = new Date(suggestedMs)
        const conflictsWithExisting = scheduledStarts.some((value) => {
            const existing = Date.parse(value)
            return Number.isFinite(existing) && Math.abs(existing - suggestedMs) < hourMs
        })
        const boundedSuggestion = Number.isFinite(suggestedMs) &&
            suggestedMs > reference.getTime() &&
            suggestedMs <= reference.getTime() + 366 * dayMs &&
            suggestedDate.getDay() >= 1 &&
            suggestedDate.getDay() <= 5 &&
            suggestedDate.getHours() >= 8 &&
            suggestedDate.getHours() < 18 &&
            !conflictsWithExisting
            ? {
                start: new Date(suggestedMs).toISOString(),
                end: new Date(
                    typeof item.suggestedEnd === 'string' && Date.parse(item.suggestedEnd) > suggestedMs
                        ? Date.parse(item.suggestedEnd)
                        : suggestedMs + hourMs
                ).toISOString()
            }
            : fallbackSuggestion
        candidates.push({
            kind: 'uncertain', title, sourceText, allDay: false,
            confidence: clampConfidence(item.confidence, 0.65),
            suggestedStart: boundedSuggestion.start,
            suggestedEnd: boundedSuggestion.end,
        })
    }

    return dedupeCandidates(candidates)
}

export const mergeTemporalCandidates = (
    deterministic: TemporalCandidate[],
    ai: TemporalCandidate[]
): TemporalCandidate[] => {
    const merged = [...deterministic]
    for (const candidate of ai) {
        const normalizedSource = normalizedForMatch(candidate.sourceText)
        const sameSource = merged.filter(
            (item) => normalizedForMatch(item.sourceText) === normalizedSource
        )
        if (sameSource.some((item) => item.kind === 'concrete')) continue
        if (candidate.kind === 'concrete' && sameSource.some((item) => item.kind === 'uncertain')) {
            for (let index = merged.length - 1; index >= 0; index -= 1) {
                if (normalizedForMatch(merged[index].sourceText) === normalizedSource) merged.splice(index, 1)
            }
        }
        merged.push(candidate)
    }
    return dedupeCandidates(merged)
}

export const temporalCandidateFingerprint = (candidate: TemporalCandidate): string =>
    createHash('sha256')
        .update(`${candidate.kind}\n${normalizedForMatch(candidate.sourceText)}`)
        .digest('hex')

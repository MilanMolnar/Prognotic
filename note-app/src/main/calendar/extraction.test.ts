import { describe, expect, it } from 'vitest'
import {
    extractDeterministicTemporalCandidates,
    parseTemporalLlmResponse
} from './extraction'

describe('calendar temporal extraction', () => {
    it('extracts an explicit local ISO date and time as concrete', () => {
        const [candidate] = extractDeterministicTemporalCandidates(
            'Dentist appointment 2026-07-20 14:00',
            new Date(2026, 6, 13, 10, 0)
        )
        expect(candidate.kind).toBe('concrete')
        expect(candidate.allDay).toBe(false)
        const start = new Date(candidate.start as string)
        expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()])
            .toEqual([2026, 6, 20, 14])
    })

    it('resolves a weekday with time from the supplied local reference', () => {
        const [candidate] = extractDeterministicTemporalCandidates(
            'Dentist Tuesday 3pm',
            new Date(2026, 6, 13, 10, 0)
        )
        const start = new Date(candidate.start as string)
        expect(candidate.kind).toBe('concrete')
        expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()])
            .toEqual([2026, 6, 14, 15])
    })

    it('classifies explicit vague priority language as uncertain', () => {
        const [candidate] = extractDeterministicTemporalCandidates(
            'High priority: send the signed contract soon',
            new Date(2026, 6, 13, 10, 0)
        )
        expect(candidate.kind).toBe('uncertain')
        expect(Date.parse(candidate.suggestedStart as string)).toBeGreaterThan(new Date(2026, 6, 13, 10, 0).getTime())
    })

    it('does not create calendar noise for ordinary note text', () => {
        expect(extractDeterministicTemporalCandidates('Ideas about local-first Markdown storage')).toEqual([])
    })

    it('rejects AI candidates whose claimed source text is not in the note', () => {
        const raw = JSON.stringify({
            items: [{
                kind: 'concrete',
                title: 'Invented meeting',
                sourceText: 'Meet Alex tomorrow',
                confidence: 0.9,
                start: '2026-07-14T15:00:00+02:00',
                end: '2026-07-14T16:00:00+02:00',
                allDay: false
            }]
        })
        expect(parseTemporalLlmResponse(raw, 'A note with no meeting')).toEqual([])
    })
})

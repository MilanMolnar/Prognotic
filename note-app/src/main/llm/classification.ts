import { Goal, SuggestedNewGoal } from '@shared/models'

export type RoutingAssignment = { goalId: string; confidence: number }
export type RoutingClassification = {
    hasConfidentMatch: boolean
    assignments: RoutingAssignment[]
    suggestedNewGoal?: SuggestedNewGoal
    usedFallback: boolean
}

type RoutingPayload = {
    hasConfidentMatch?: unknown
    assignments?: unknown
    suggestedNewGoal?: unknown
}

export const routingConfidenceThreshold = 0.6

const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)

const parseRoutingPayload = (raw: string): RoutingPayload | null => {
    const unfenced = raw.trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
    const candidates = [unfenced]
    const objectStart = unfenced.indexOf('{')
    const objectEnd = unfenced.lastIndexOf('}')
    if (objectStart >= 0 && objectEnd > objectStart) {
        candidates.push(unfenced.slice(objectStart, objectEnd + 1))
    }

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate) as unknown
            if (
                isObject(parsed) &&
                (
                    typeof parsed.hasConfidentMatch === 'boolean' ||
                    Array.isArray(parsed.assignments) ||
                    isObject(parsed.suggestedNewGoal)
                )
            ) {
                return parsed
            }
        } catch {
            // Some providers wrap otherwise valid JSON in prose or malformed fences.
        }
    }
    return null
}

const clampConfidence = (value: unknown): number => {
    const confidence = Number(value)
    return Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0
}

const parseAssignments = (payload: RoutingPayload, goals: Goal[]): RoutingAssignment[] => {
    const validIds = new Set(goals.map((goal) => goal.id))
    const assignmentsByGoal = new Map<string, RoutingAssignment>()
    const rawAssignments = Array.isArray(payload.assignments) ? payload.assignments : []

    for (const item of rawAssignments) {
        if (!isObject(item) || typeof item.goalId !== 'string' || !validIds.has(item.goalId)) continue
        const assignment = {
            goalId: item.goalId,
            confidence: clampConfidence(item.confidence)
        }
        const existing = assignmentsByGoal.get(item.goalId)
        if (!existing || assignment.confidence > existing.confidence) {
            assignmentsByGoal.set(item.goalId, assignment)
        }
    }

    return [...assignmentsByGoal.values()].sort((a, b) => b.confidence - a.confidence)
}

const parseSuggestedNewGoal = (value: unknown): SuggestedNewGoal | undefined => {
    if (!isObject(value) || typeof value.name !== 'string') return undefined
    const name = value.name.trim().slice(0, 80)
    if (!name) return undefined
    const description = typeof value.description === 'string'
        ? value.description.trim().slice(0, 500)
        : ''
    return {
        name,
        description,
        confidence: clampConfidence(value.confidence)
    }
}

export const fallbackGoalId = (note: string, goals: Goal[]): string | null => {
    const words = new Set(note.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
    let best = goals[0] ?? null
    let bestScore = -1
    for (const goal of goals) {
        const hintText = `${goal.name} ${goal.description} ${goal.routingHints ?? ''}`
        const score = hintText.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.reduce(
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

const fallbackClassification = (note: string, goals: Goal[]): RoutingClassification => {
    const goalId = fallbackGoalId(note, goals)
    return {
        hasConfidentMatch: false,
        assignments: goalId ? [{ goalId, confidence: 0.1 }] : [],
        usedFallback: true
    }
}

export const parseRoutingClassification = (
    raw: string,
    note: string,
    goals: Goal[]
): RoutingClassification => {
    const parsed = parseRoutingPayload(raw)
    if (!parsed) return fallbackClassification(note, goals)

    const assignments = parseAssignments(parsed, goals)
    const suggestedNewGoal = parseSuggestedNewGoal(parsed.suggestedNewGoal)

    if (parsed.hasConfidentMatch === true) {
        // A confident decision without a valid listed goal is internally
        // inconsistent, so treat it like a failed response.
        if (assignments.length === 0) return fallbackClassification(note, goals)
        return {
            hasConfidentMatch: true,
            assignments,
            usedFallback: false
        }
    }

    if (parsed.hasConfidentMatch === false) {
        return {
            hasConfidentMatch: false,
            assignments: assignments.slice(0, 1),
            ...(suggestedNewGoal ? { suggestedNewGoal } : {}),
            usedFallback: false
        }
    }

    // Backward-compatible handling for providers that return the older
    // assignments-only shape. An entirely empty legacy response is not a
    // deliberate no-match decision and may use the keyword fallback.
    if (assignments.length === 0 && !suggestedNewGoal) {
        return fallbackClassification(note, goals)
    }

    const hasConfidentMatch = assignments.some(
        (assignment) => assignment.confidence >= routingConfidenceThreshold
    )
    return {
        hasConfidentMatch,
        assignments: hasConfidentMatch ? assignments : assignments.slice(0, 1),
        ...(!hasConfidentMatch && suggestedNewGoal ? { suggestedNewGoal } : {}),
        usedFallback: false
    }
}

export const parseRoutingAssignments = (
    raw: string,
    note: string,
    goals: Goal[]
): RoutingAssignment[] => parseRoutingClassification(raw, note, goals).assignments

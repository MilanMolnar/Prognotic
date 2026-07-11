import { Goal } from '@shared/models'

export type RoutingAssignment = { goalId: string; confidence: number }

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

export const parseRoutingAssignments = (raw: string, note: string, goals: Goal[]): RoutingAssignment[] => {
    const parsed = JSON.parse(raw.replace(/^```json\s*|```$/g, '')) as {
        assignments?: { goalId?: string | null; confidence?: number }[]
    }
    const validIds = new Set(goals.map((goal) => goal.id))
    const assignments = (parsed.assignments ?? [])
        .filter((item): item is { goalId: string; confidence?: number } =>
            typeof item.goalId === 'string' && validIds.has(item.goalId)
        )
        .map((item) => ({
            goalId: item.goalId,
            confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0))
        }))

    if (assignments.length === 0) {
        const goalId = fallbackGoalId(note, goals)
        if (goalId) assignments.push({ goalId, confidence: 0.1 })
    }
    return assignments
}

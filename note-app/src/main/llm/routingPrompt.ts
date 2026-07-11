export const routingSystemPrompt = `Classify the note against the listed goals using semantic scope, not keyword overlap.

Read every goal's name, description, and routingHints. Treat the description and the semantic intent of the name as the strongest evidence. Routing hints are supporting examples, not permission to ignore the described scope.

Ask whether this note would realistically be part of the goal's work or outcome. Reject weak or generic matches. Words such as work, task, plan, review, or code are not evidence by themselves unless the goal description establishes the same domain.

Return only one JSON object with this exact shape:
{
  "hasConfidentMatch": boolean,
  "assignments": [{ "goalId": "listed-id", "confidence": 0.0 }],
  "suggestedNewGoal": {
    "name": "Concise goal name",
    "description": "A specific description of what belongs in this goal.",
    "confidence": 0.0
  }
}

Rules:
- Confidence values must be calibrated numbers from 0 to 1.
- Set hasConfidentMatch to true only when an existing goal is a strong semantic fit (normally confidence 0.60 or higher).
- When hasConfidentMatch is true, rank all strongly relevant existing goals by confidence and omit suggestedNewGoal.
- When hasConfidentMatch is false, include exactly the single best existing goal in assignments when any goals exist, even if its confidence is low.
- When hasConfidentMatch is false, propose suggestedNewGoal when the note has a coherent scope not covered by the existing goals.
- A proposed goal must be reusable for future related notes, not merely a rewrite of this one note.
- When no existing goals are listed, return an empty assignments array, set hasConfidentMatch to false, and propose a new goal when the note has a coherent scope.
- Never invent an existing goal id and never include prose, Markdown, or code fences.`

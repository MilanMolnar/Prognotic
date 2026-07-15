import { describe, expect, it } from 'vitest'
import { assistantDisplayName } from '@shared/constants'
import { AssistantMode } from '@shared/models'
import { buildAssistantSystemPrompt } from './assistantPrompt'

describe('buildAssistantSystemPrompt', () => {
  it.each<AssistantMode>(['note-chat', 'research', 'search'])(
    'includes explicit attached-note context in %s mode',
    (mode) => {
      const fullAttachedContent = `Attached note body\n${'x'.repeat(7_000)}\nAttached note end`
      const prompt = buildAssistantSystemPrompt(
        mode,
        'Quick Notes',
        'goal-id: Goal name',
        '[block:retrieved-id] Retrieved excerpt',
        `[block:attached-id] Attached note\n${fullAttachedContent}`
      )

      expect(prompt).toContain('Attached note blocks (explicit user context; available regardless of scope):')
      expect(prompt).toContain(`You are ${assistantDisplayName}`)
      expect(prompt).toContain('Treat attached note blocks as the primary context for this request')
      expect(prompt).toContain(fullAttachedContent)
      expect(prompt).toContain('[block:retrieved-id] Retrieved excerpt')
    }
  )

  it('marks the attached-note section as empty when there are no attachments', () => {
    const prompt = buildAssistantSystemPrompt('note-chat', 'All goals', '', '')

    expect(prompt).toContain('Attached note blocks (explicit user context; available regardless of scope):\n(none)')
  })

  it('instructs the assistant to reply in the selected UI language', () => {
    const prompt = buildAssistantSystemPrompt('note-chat', 'All goals', '', '', '', 'Hungarian')

    expect(prompt).toContain('Respond in Hungarian, unless the user explicitly requests another language.')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BlockMeta } from '@shared/models'
import { AssistantScope } from '@shared/types'
import { defaultSettings } from '@shared/constants'

const libMocks = vi.hoisted(() => ({
  getBlocks: vi.fn(),
  getCredential: vi.fn(),
  getGoals: vi.fn(),
  getSettings: vi.fn(),
  readBlock: vi.fn(),
  setBlockAiLabel: vi.fn(),
  setBlockRouting: vi.fn()
}))

vi.mock('@/lib', () => libMocks)

import { buildNotesContext } from './router'

const block = (id: string, categories: (string | null)[], updatedAt: number): BlockMeta => ({
  id,
  file: `${id}.md`,
  createdAt: updatedAt,
  updatedAt,
  categories,
  excerpt: 'Attachment label'
})

describe('buildNotesContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    libMocks.getGoals.mockResolvedValue([])
    libMocks.getSettings.mockResolvedValue(defaultSettings)
  })

  it('injects an attached block in full and identifies it as the primary referent', async () => {
    const attached = block('attached-id', ['outside-scope'], 100)
    const fullContent = `Private launch decision: codename ORCHID.\n${'x'.repeat(7_000)}\nEND-OF-ATTACHMENT`
    libMocks.getBlocks.mockResolvedValue([attached])
    libMocks.readBlock.mockResolvedValue({ content: fullContent })
    const scope: AssistantScope = {
      mode: 'note-chat',
      goalMode: 'open',
      openGoalId: 'different-goal',
      attachedBlockIds: [attached.id],
      from: 1_000,
      to: 2_000
    }

    const context = await buildNotesContext(
      'Tell me about this.',
      scope,
      { provider: 'openai', model: 'test-model' }
    )

    expect(context.prompt).toContain(fullContent)
    expect(context.prompt).toContain('[block:attached-id] Attached note')
    expect(context.prompt).toContain('Treat attached note blocks as the primary context for this request')
    expect(context.citedIds).toEqual(['attached-id'])
    expect(libMocks.readBlock).toHaveBeenCalledWith('attached-id')
  })
})

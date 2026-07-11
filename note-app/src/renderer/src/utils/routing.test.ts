import { describe, expect, it } from 'vitest'
import { BlockMeta, BlockRouting } from '@shared/models'
import { becameAppliedRouting, compareBlocksForFeed } from './routing'

const routedBlock = (id: string, decidedAt: number, status: BlockRouting['status'] = 'applied'): BlockMeta => ({
    id,
    file: `${id}.md`,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    categories: [null],
    excerpt: id,
    routing: { status, decidedAt, assignments: [], model: 'test' }
})

describe('routing presentation', () => {
    it('puts accepted routes at the chat top and natural bottom with documented internal order', () => {
        const active = { ...routedBlock('active', 30, 'pending'), routing: undefined }
        const older = routedBlock('older', 10)
        const newer = routedBlock('newer', 20)

        expect([active, older, newer].sort((a, b) => compareBlocksForFeed(a, b, 'asc', null)).map((item) => item.id))
            .toEqual(['newer', 'older', 'active'])
        expect([active, older, newer].sort((a, b) => compareBlocksForFeed(a, b, 'desc', null)).map((item) => item.id))
            .toEqual(['active', 'older', 'newer'])
    })

    it('animates only a known non-applied to applied transition', () => {
        expect(becameAppliedRouting(false, undefined, 'applied')).toBe(false)
        expect(becameAppliedRouting(true, 'pending', 'applied')).toBe(true)
        expect(becameAppliedRouting(true, 'applied', 'applied')).toBe(false)
    })
})

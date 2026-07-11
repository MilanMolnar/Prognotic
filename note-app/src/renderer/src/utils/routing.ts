import { BlockMeta, BlockRouting } from '@shared/models'

export const compareBlocksForFeed = (
    a: BlockMeta,
    b: BlockMeta,
    order: 'asc' | 'desc',
    selectedCategory: string | null
): number => {
    if (selectedCategory === null) {
        const aRouted = a.routing?.status === 'applied'
        const bRouted = b.routing?.status === 'applied'
        if (aRouted !== bRouted) return order === 'asc' ? (aRouted ? -1 : 1) : (aRouted ? 1 : -1)
        if (aRouted && bRouted) {
            const decidedAt = (a.routing?.decidedAt ?? 0) - (b.routing?.decidedAt ?? 0)
            return order === 'asc' ? -decidedAt : decidedAt
        }
    }
    return order === 'asc' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt
}

export const becameAppliedRouting = (
    hadPreviousState: boolean,
    previousStatus: BlockRouting['status'] | undefined,
    currentStatus: BlockRouting['status'] | undefined
): boolean => hadPreviousState && previousStatus !== 'applied' && currentStatus === 'applied'

import { BlockMeta } from '@shared/models'

type LabelledBlock = Pick<BlockMeta, 'excerpt' | 'aiLabel'>

export const blockLabel = (block: LabelledBlock, useAiLabel: boolean): string => {
    const source = useAiLabel && block.aiLabel?.trim() ? block.aiLabel : block.excerpt
    const words = source.split(/\s+/).filter(Boolean)
    return words.slice(0, 5).join(' ') || 'untitled'
}

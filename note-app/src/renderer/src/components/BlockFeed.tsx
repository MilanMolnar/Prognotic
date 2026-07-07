import { BlockCard } from '@/components'
import { useBlockFeed } from '@renderer/hooks/useBlockFeed'
import { cn } from '@renderer/utils'
import { useGoals } from '@renderer/context'
import { isEmpty } from 'lodash'
import { ComponentProps, JSX, useEffect, useRef } from 'react'

export type BlockFeedProps = ComponentProps<'div'>

export const BlockFeed = ({ className, ...props }: BlockFeedProps): JSX.Element | null => {
  const {
    feedBlocks,
    matchIds,
    isSearching,
    blockContents,
    openBlockId,
    handleBlockSelect,
    handleBlockDelete
  } = useBlockFeed()
  const { selectedCategory } = useGoals()

  // Keep the newest text visible next to the capture bar (chat-style);
  // while searching the best match sits at the top instead. blockContents is
  // a dependency because appends grow the open block without changing the
  // block count — the feed must follow those too.
  const scrollRef = useRef<HTMLDivElement>(null)
  const blockCount = feedBlocks?.length ?? 0
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: isSearching ? 0 : scrollRef.current.scrollHeight
    })
  }, [blockCount, blockContents, selectedCategory, isSearching])

  if (!feedBlocks) return null

  return (
    <div ref={scrollRef} className={cn('overflow-y-auto', className)} {...props}>
      {isEmpty(feedBlocks) ? (
        <div className="text-sm text-center text-zinc-500 mt-5">
          Nothing captured here yet — write something below!
        </div>
      ) : (
        <ul className="space-y-3">
          {feedBlocks.map((block) => (
            <li key={block.id}>
              <BlockCard
                block={block}
                content={blockContents[block.id]}
                isOpen={openBlockId === block.id}
                isMatch={matchIds.has(block.id)}
                onSelect={handleBlockSelect(block.id)}
                onDelete={handleBlockDelete(block.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

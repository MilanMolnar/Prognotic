import { BlockCard } from '@/components'
import { useBlockFeed } from '@renderer/hooks/useBlockFeed'
import { cn } from '@renderer/utils'
import { becameAppliedRouting } from '@renderer/utils/routing'
import { useGoals } from '@renderer/context'
import { isEmpty } from 'lodash'
import { ComponentProps, JSX, useCallback, useEffect, useLayoutEffect, useRef } from 'react'

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
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map())
  const previousRectsRef = useRef<Map<string, DOMRect>>(new Map())
  const previousRoutingRef = useRef<Map<string, 'pending' | 'applied' | 'overridden' | undefined>>(new Map())
  const blockCount = feedBlocks?.length ?? 0
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: isSearching ? 0 : scrollRef.current.scrollHeight
    })
  }, [blockCount, blockContents, selectedCategory, isSearching])

  const registerItemRef = useCallback((id: string) => (element: HTMLLIElement | null): void => {
    if (element) itemRefs.current.set(id, element)
    else itemRefs.current.delete(id)
  }, [])

  useLayoutEffect(() => {
    const currentRects = new Map<string, DOMRect>()
    const currentRouting = new Map<string, 'pending' | 'applied' | 'overridden' | undefined>()
    for (const block of feedBlocks ?? []) {
      const element = itemRefs.current.get(block.id)
      if (!element) continue
      const current = element.getBoundingClientRect()
      const previous = previousRectsRef.current.get(block.id)
      const becameRouted = becameAppliedRouting(
        previousRoutingRef.current.has(block.id),
        previousRoutingRef.current.get(block.id),
        block.routing?.status
      )
      if (selectedCategory === null && becameRouted) {
        const deltaY = previous ? previous.top - current.top : 0
        const startY = previous && Math.abs(deltaY) > 1 ? deltaY : -20
        element.animate(
          [
            { transform: `translateY(${startY}px)`, opacity: 1 },
            { transform: 'translateY(0)', opacity: 0.5 }
          ],
          { duration: 420, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
        )
      }
      currentRects.set(block.id, current)
      currentRouting.set(block.id, block.routing?.status)
    }
    previousRectsRef.current = currentRects
    previousRoutingRef.current = currentRouting
  }, [feedBlocks, selectedCategory])

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
            <li key={block.id} ref={registerItemRef(block.id)}>
              <BlockCard
                block={block}
                content={blockContents[block.id]}
                isOpen={openBlockId === block.id}
                isMatch={matchIds.has(block.id)}
                isRouted={selectedCategory === null && block.routing?.status === 'applied'}
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

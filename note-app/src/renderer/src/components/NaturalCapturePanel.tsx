import { BlockCard, NaturalCaptureEditor } from '@/components'
import { useGoals } from '@renderer/context'
import { useBlockFeed } from '@renderer/hooks/useBlockFeed'
import { cn } from '@renderer/utils'
import { becameAppliedRouting } from '@renderer/utils/routing'
import { ComponentProps, JSX, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'

export type NaturalCapturePanelProps = ComponentProps<'div'>

// Natural capture mode: one document-like scroll column — the writing
// surface pinned at the top, finalized blocks as cards below it, newest
// first. The open block is not in the feed; it lives in the surface until
// its window expires and it collapses into a card here.
export const NaturalCapturePanel = ({
  className,
  ...props
}: NaturalCapturePanelProps): JSX.Element | null => {
  const {
    feedBlocks,
    matchIds,
    isSearching,
    blockContents,
    openBlockId,
    handleBlockSelect,
    handleBlockDelete
  } = useBlockFeed('desc')
  const { selectedCategory } = useGoals()

  // Writing happens at the top — keep it in view on category change, and
  // surface the best match when searching.
  const scrollRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map())
  const previousRectsRef = useRef<Map<string, DOMRect>>(new Map())
  const previousRoutingRef = useRef<Map<string, 'pending' | 'applied' | 'overridden' | undefined>>(new Map())
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [selectedCategory, isSearching])

  // The open block of this category is resumed by the writing surface, so
  // it is excluded from the cards; wait for its markdown before mounting
  // the editor. A pulsing dot marks an active session.
  const openTarget =
    openBlockId !== null ? feedBlocks?.find((block) => block.id === openBlockId) : undefined
  const resumeContent = openTarget ? blockContents[openTarget.id] : ''
  const closedBlocks = useMemo(
    () => (feedBlocks ?? []).filter((block) => block.id !== openBlockId),
    [feedBlocks, openBlockId]
  )

  const registerItemRef = useCallback((id: string) => (element: HTMLLIElement | null): void => {
    if (element) itemRefs.current.set(id, element)
    else itemRefs.current.delete(id)
  }, [])

  useLayoutEffect(() => {
    const currentRects = new Map<string, DOMRect>()
    const currentRouting = new Map<string, 'pending' | 'applied' | 'overridden' | undefined>()
    for (const block of closedBlocks) {
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
  }, [closedBlocks, selectedCategory])

  if (!feedBlocks) return null

  return (
    <div data-tour="block-feed" ref={scrollRef} className={cn('overflow-y-auto', className)} {...props}>
      <div className="relative border-b border-white/10 pb-1">
        {openTarget && (
          <span
            title="Capturing — writing keeps this block open"
            className="absolute right-1 top-1 z-10 inline-block h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse"
          />
        )}
        {resumeContent !== undefined ? (
          <NaturalCaptureEditor
            key={selectedCategory ?? 'quick-notes'}
            resumeBlockId={openTarget?.id ?? null}
            resumeContent={resumeContent}
            category={selectedCategory}
          />
        ) : (
          <div className="px-1 py-2 text-sm text-zinc-500">Loading...</div>
        )}
      </div>
      {closedBlocks.length > 0 && (
        <ul className="mt-4 space-y-3">
          {closedBlocks.map((block, index) => (
            <li data-tour={index === 0 ? 'newest-block' : undefined} key={block.id} ref={registerItemRef(block.id)}>
              <BlockCard
                block={block}
                content={blockContents[block.id]}
                isOpen={false}
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

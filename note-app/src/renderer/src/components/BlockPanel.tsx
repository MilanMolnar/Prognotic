import { BlockFeed, MarkdownEditor, NaturalCapturePanel } from '@/components'
import { useBlockActions, useBlocks, useSearch, useSettings } from '@renderer/context'
import { cn } from '@renderer/utils'
import { ComponentProps, JSX, useEffect, useRef } from 'react'
import { LuX } from 'react-icons/lu'

export type BlockPanelProps = ComponentProps<'div'>

// The middle of the right panel: the chronological feed, or — when a block
// is selected — the full markdown editor in its place. The block's short name
// is shown by FeedHeader while editing.
export const BlockPanel = ({ className, ...props }: BlockPanelProps): JSX.Element => {
  const { selectedBlockId, selectedBlock, contentVersion } = useBlocks()
  const { selectBlock } = useBlockActions()
  const { isSearchOpen, query } = useSearch()
  const { settings } = useSettings()

  // In-editor find: paints every case-insensitive occurrence of the query
  // inside the open block via the CSS Custom Highlight API — no DOM
  // mutation, so the Lexical editor is undisturbed.
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const trimmedQuery = query.trim().toLowerCase()
  useEffect(() => {
    CSS.highlights.delete('block-search')
    const container = editorContainerRef.current
    if (!container || !isSearchOpen || trimmedQuery.length === 0) return

    const ranges: Range[] = []
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      const text = node.textContent?.toLowerCase() ?? ''
      let index = text.indexOf(trimmedQuery)
      while (index !== -1) {
        const range = new Range()
        range.setStart(node, index)
        range.setEnd(node, index + trimmedQuery.length)
        ranges.push(range)
        index = text.indexOf(trimmedQuery, index + trimmedQuery.length)
      }
    }

    if (ranges.length > 0) {
      CSS.highlights.set('block-search', new Highlight(...ranges))
      ranges[0].startContainer.parentElement?.scrollIntoView({ block: 'nearest' })
    }

    return () => {
      CSS.highlights.delete('block-search')
    }
  }, [isSearchOpen, trimmedQuery, selectedBlockId, contentVersion])

  if (selectedBlockId === null) {
    return settings.captureMode === 'natural' ? (
      <NaturalCapturePanel className={className} {...props} />
    ) : (
      <BlockFeed className={className} {...props} />
    )
  }

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden animate-[block-expand_180ms_ease-out]',
        className
      )}
      {...props}
    >
      <button
        onClick={() => selectBlock(null)}
        title="Back to feed"
        className="absolute right-2 top-1 z-10 rounded-md p-1.5 text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors duration-100"
      >
        <LuX className="w-6 h-6" />
      </button>
      <div ref={editorContainerRef} className="flex-1 overflow-y-auto">
        {selectedBlock ? (
          <MarkdownEditor />
        ) : (
          <div className="text-sm text-center text-zinc-500 mt-5">Loading...</div>
        )}
      </div>
    </div>
  )
}

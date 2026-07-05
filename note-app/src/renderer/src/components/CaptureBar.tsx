import { MarkdownFormat, useQuickInput } from '@renderer/hooks/useQuickInput'
import { useBlocks, useGoals } from '@renderer/context'
import { blockLabel, cn } from '@renderer/utils'
import { ComponentProps, JSX } from 'react'
import { IconType } from 'react-icons'
import { LuBold, LuCode, LuHeading2, LuItalic, LuList, LuSend } from 'react-icons/lu'

const formatButtons: { format: MarkdownFormat; title: string; Icon: IconType }[] = [
  { format: 'heading', title: 'Heading', Icon: LuHeading2 },
  { format: 'bold', title: 'Bold', Icon: LuBold },
  { format: 'italic', title: 'Italic', Icon: LuItalic },
  { format: 'list', title: 'List', Icon: LuList },
  { format: 'code', title: 'Code', Icon: LuCode }
]

export type CaptureBarProps = ComponentProps<'form'>

// One chat-like control: a single rounded border wraps the markdown toolbar,
// the textarea, and the send button. The border's top-left legend names the
// block the next submit appends to — or "new" when it will start a fresh one.
// Faded and inert while a block is open in the editor.
export const CaptureBar = ({ className, ...props }: CaptureBarProps): JSX.Element => {
  const { text, setText, isSubmitting, textareaRef, submit, handleKeyDown, applyFormat } =
    useQuickInput()
  const { blocks, openBlockId, selectedBlockId } = useBlocks()
  const { selectedCategory } = useGoals()
  const isEditingBlock = selectedBlockId !== null

  // Mirrors submitQuickNote's targeting: the open block receives the append
  // only while its window is active (provider clears openBlockId on expiry)
  // and it belongs to the viewed category.
  const openTarget = openBlockId ? blocks?.find((block) => block.id === openBlockId) : undefined
  const appendTarget =
    openTarget && openTarget.category === selectedCategory ? openTarget : undefined

  return (
    <form
      className={cn(
        'transition-opacity duration-200',
        { 'opacity-40 pointer-events-none': isEditingBlock },
        className
      )}
      aria-disabled={isEditingBlock}
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      {...props}
    >
      <fieldset className="min-w-0 rounded-lg border border-zinc-400/50 bg-zinc-900/40 transition-colors duration-100 focus-within:border-zinc-300/60">
        <legend
          className={cn(
            'ml-3 max-w-[60%] truncate px-1 text-xs font-light',
            appendTarget ? 'text-yellow-600/80' : 'text-zinc-500'
          )}
        >
          {appendTarget ? blockLabel(appendTarget.excerpt) : 'new'}
        </legend>
        <div className="flex items-center gap-0.5 px-2 pt-0.5">
          {formatButtons.map(({ format, title, Icon }) => (
            <button
              key={format}
              type="button"
              title={title}
              disabled={isEditingBlock}
              onClick={() => applyFormat(format)}
              className="rounded p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-600/50 transition-colors duration-100"
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
          <span className="flex-1" />
          <button
            type="submit"
            title="Send"
            disabled={isEditingBlock || isSubmitting || text.trim().length === 0}
            className="rounded p-1.5 text-zinc-300 hover:bg-zinc-600/50 transition-colors duration-100 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <LuSend className="w-4 h-4" />
          </button>
        </div>
        <textarea
          ref={textareaRef}
          rows={2}
          value={text}
          disabled={isEditingBlock}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Jot something down..."
          className="block w-full resize-y min-h-12 max-h-48 bg-transparent px-3 pb-2 text-sm outline-none caret-yellow-500 placeholder:text-zinc-500"
        />
      </fieldset>
    </form>
  )
}

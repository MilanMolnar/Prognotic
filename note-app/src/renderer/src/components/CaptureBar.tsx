import { DictationButton } from '@renderer/components/DictationButton'
import { MarkdownFormat, useQuickInput } from '@renderer/hooks/useQuickInput'
import { dictationTitle, useDictation } from '@renderer/hooks/useDictation'
import { useBlockActions, useBlocks, useGoals } from '@renderer/context'
import { blockLabel, cn } from '@renderer/utils'
import { ComponentProps, JSX, useCallback, useEffect } from 'react'
import { IconType } from 'react-icons'
import { LuBold, LuCheck, LuCode, LuHeading2, LuItalic, LuList, LuSend } from 'react-icons/lu'

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
  const { text, setText, isSubmitting, textareaRef, submit, handleKeyDown, applyFormat, appendTranscript } =
    useQuickInput()
  const { blocks, openBlockId, selectedBlockId } = useBlocks()
  const { closeOpenBlock } = useBlockActions()
  const { selectedCategory } = useGoals()
  const isEditingBlock = selectedBlockId !== null

  const focusCaptureInput = useCallback((): void => {
    textareaRef.current?.focus()
  }, [textareaRef])

  const { dictationMode, isListening, interimText, error, notice, isAvailable, toggle, stop } =
    useDictation({ onFinalTranscript: appendTranscript, focusInput: focusCaptureInput })

  // Stop dictation when the bar becomes inert or the draft is sent.
  useEffect(() => {
    if (isEditingBlock || isSubmitting) stop()
  }, [isEditingBlock, isSubmitting, stop])

  const handleDictationClick = useCallback((): void => {
    toggle()
  }, [toggle])

  // Mirrors submitQuickNote's targeting: the open block receives the append
  // only while its window is active (provider clears openBlockId on expiry)
  // and the viewed category is among its categories.
  const openTarget = openBlockId ? blocks?.find((block) => block.id === openBlockId) : undefined
  const appendTarget =
    openTarget && openTarget.categories.includes(selectedCategory) ? openTarget : undefined

  const statusMessage = error ?? notice

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
          <DictationButton
            isListening={isListening}
            isAvailable={isAvailable}
            disabled={isEditingBlock}
            title={dictationTitle(dictationMode, isListening)}
            onClick={handleDictationClick}
          />
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
        {(isListening && interimText) || statusMessage ? (
          <p
            className={cn(
              'px-3 pt-0.5 text-xs',
              error ? 'text-red-400/90' : notice ? 'text-zinc-500' : 'text-zinc-500 italic'
            )}
            aria-live="polite"
          >
            {error ?? notice ?? interimText}
          </p>
        ) : null}
        <textarea
          ref={textareaRef}
          rows={2}
          value={text}
          disabled={isEditingBlock}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isListening ? 'Listening…' : 'Jot something down...'}
          className="block w-full resize-y min-h-12 max-h-48 bg-transparent px-3 pb-1 text-sm outline-none caret-yellow-500 placeholder:text-zinc-500"
        />
        {/* Manual finalize: closes the open block without touching the
            draft above — the block becomes a normal closed card. */}
        <div className="flex justify-end px-2 pb-1.5">
          <button
            type="button"
            title={appendTarget ? 'Close the open block' : 'No open block in this view'}
            disabled={isEditingBlock || !appendTarget}
            onClick={closeOpenBlock}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-zinc-400 transition-colors duration-100 hover:bg-zinc-600/50 hover:text-zinc-200 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <LuCheck className="h-3.5 w-3.5" />
            Close block
          </button>
        </div>
      </fieldset>
    </form>
  )
}

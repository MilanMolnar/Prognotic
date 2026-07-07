import { MDXEditor } from '@mdxeditor/editor'
import { dictationTitle, useDictation } from '@renderer/hooks/useDictation'
import { useNaturalCapture, UseNaturalCaptureParams } from '@renderer/hooks/useNaturalCapture'
import { cn } from '@renderer/utils'
import { JSX, useCallback, useState } from 'react'
import { DictationButton } from './DictationButton'
import { editorPlugins } from './editorPlugins'

export type NaturalCaptureEditorProps = UseNaturalCaptureParams

// The natural-mode writing surface: a bare document-style editor with live
// markdown shortcuts — no toolbar, no send button. It grows with its content,
// pushing the finalized cards below it downward. The parent keys it by
// category and mounts it only once the resume content (if any) is cached.
// The dictation mic sits at the end of the writing line (bottom-right), not
// on a separate row below the editor.
export const NaturalCaptureEditor = (props: NaturalCaptureEditorProps): JSX.Element => {
  const { initialContent, editorRef, handleChange, appendTranscript } = useNaturalCapture(props)
  const [isEmpty, setIsEmpty] = useState(() => initialContent.trim().length === 0)

  const handleEditorChange = useCallback(
    (markdown: string): void => {
      setIsEmpty(markdown.trim().length === 0)
      handleChange(markdown)
    },
    [handleChange]
  )

  const handleTranscript = useCallback(
    (text: string): void => {
      appendTranscript(text)
      if (text.trim().length > 0) setIsEmpty(false)
    },
    [appendTranscript]
  )

  const focusEditor = useCallback((): void => {
    const editable = document.querySelector(
      '.natural-capture-editor [contenteditable="true"]'
    ) as HTMLElement | null
    editable?.focus()
  }, [])

  const { dictationMode, isListening, interimText, error, notice, isAvailable, toggle } =
    useDictation({ onFinalTranscript: handleTranscript, focusInput: focusEditor })

  const statusMessage = error ?? notice ?? (isListening && interimText ? interimText : null)

  return (
    <div className="flex items-end gap-1 px-1">
      <div className="min-w-0 flex-1">
        <MDXEditor
          ref={editorRef}
          className={cn('natural-capture-editor', isEmpty && 'natural-capture-editor--empty')}
          markdown={initialContent}
          onChange={handleEditorChange}
          plugins={editorPlugins()}
          contentEditableClassName="outline-none min-h-0 max-w-none px-0 py-0 caret-yellow-500 prose prose-sm prose-invert prose-p:my-0 prose-p:leading-relaxed prose-headings:my-3 prose-blockquote:my-3 prose-ul:my-1.5 prose-li:my-0 prose-code:py-1 prose-code:text-red-500 prose-code:before:content-[''] prose-code:after:content-['']"
        />
      </div>
      <div className="flex shrink-0 items-center gap-2 pb-0.5">
        {statusMessage && (
          <p
            className={cn(
              'max-w-[10rem] truncate text-xs sm:max-w-[14rem]',
              error ? 'text-red-400/90' : notice ? 'text-zinc-500' : 'text-zinc-500 italic'
            )}
            aria-live="polite"
          >
            {statusMessage}
          </p>
        )}
        <DictationButton
          isListening={isListening}
          isAvailable={isAvailable}
          title={dictationTitle(dictationMode, isListening)}
          onClick={toggle}
        />
      </div>
    </div>
  )
}

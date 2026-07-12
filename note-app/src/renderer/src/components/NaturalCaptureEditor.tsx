import { MDXEditor } from '@mdxeditor/editor'
import { dictationTitle, useDictation } from '@renderer/hooks/useDictation'
import { useNaturalCapture, UseNaturalCaptureParams } from '@renderer/hooks/useNaturalCapture'
import { useImageRecognition } from '@renderer/hooks/useImageRecognition'
import { useSettings } from '@renderer/context'
import { useTranscriptPolish } from '@renderer/hooks/useTranscriptPolish'
import { cn } from '@renderer/utils'
import { isImageRecognitionReady, isLlmSelectionVerified } from '@shared/llmSettings'
import { JSX, useCallback, useState } from 'react'
import { DictationButton } from './DictationButton'
import { editorPlugins } from './editorPlugins'
import { ImageRecognitionButton } from './ImageRecognitionButton'
import { ImageRecognitionModal } from './ImageRecognitionModal'

export type NaturalCaptureEditorProps = UseNaturalCaptureParams

// The natural-mode writing surface: a bare document-style editor with live
// markdown shortcuts — no toolbar, no send button. It grows with its content,
// pushing the finalized cards below it downward. The parent keys it by
// category and mounts it only once the resume content (if any) is cached.
// The dictation mic sits at the end of the writing line (bottom-right), not
// on a separate row below the editor.
export const NaturalCaptureEditor = (props: NaturalCaptureEditorProps): JSX.Element => {
  const { initialContent, editorRef, handleChange, appendTranscript } = useNaturalCapture(props)
  const { settings } = useSettings()
  const [isEmpty, setIsEmpty] = useState(() => initialContent.trim().length === 0)

  const handleEditorChange = useCallback(
    (markdown: string): void => {
      setIsEmpty(markdown.trim().length === 0)
      handleChange(markdown)
    },
    [handleChange]
  )

  const focusEditor = useCallback((): void => {
    const editable = document.querySelector(
      '.natural-capture-editor [contenteditable="true"]'
    ) as HTMLElement | null
    editable?.focus()
  }, [])

  const acceptPolishedTranscript = useCallback((text: string): void => {
    appendTranscript(text)
    if (text.trim().length > 0) setIsEmpty(false)
  }, [appendTranscript])
  const { acceptTranscript, retryPolish, useOriginal, polishError, isPolishing, hasPendingTranscript } =
    useTranscriptPolish({
      enabled: settings.llm.polishDictation && isLlmSelectionVerified(settings.llm),
      onAccepted: acceptPolishedTranscript
    })

  const acceptRecognizedText = useCallback((text: string): void => {
    appendTranscript(text)
    if (text.trim().length > 0) setIsEmpty(false)
    requestAnimationFrame(focusEditor)
  }, [appendTranscript, focusEditor])
  const {
    isModalOpen: isImageModalOpen,
    isRecognizing,
    recognitionError,
    hasPendingRequest: hasPendingImage,
    openModal: openImageModal,
    closeModal: closeImageModal,
    submitImage,
    retryRecognition
  } = useImageRecognition({ onRecognized: acceptRecognizedText })
  const isImageRecognitionAvailable = isImageRecognitionReady(settings.llm)

  const { dictationMode, isListening, interimText, error, notice, isAvailable, toggle, stop } =
    useDictation({ onFinalTranscript: (text) => { void acceptTranscript(text) }, focusInput: focusEditor })

  const handleImageRecognitionClick = useCallback((): void => {
    stop()
    openImageModal()
  }, [openImageModal, stop])

  const statusMessage = recognitionError ?? (isRecognizing
    ? 'Recognizing image text...'
    : polishError ?? (isPolishing ? 'Polishing transcript...' : error ?? notice ?? (isListening && interimText ? interimText : null)))
  const hasStatusError = recognitionError !== null || polishError !== null || error !== null

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
          <div className="flex items-center gap-1 text-xs" aria-live="polite">
            <span className={cn('max-w-[10rem] truncate sm:max-w-[14rem]', hasStatusError ? 'text-red-400/90' : notice || isPolishing || isRecognizing ? 'text-zinc-500' : 'text-zinc-500 italic')}>{statusMessage}</span>
            {recognitionError && hasPendingImage && <button type="button" onClick={retryRecognition} disabled={isRecognizing} className="rounded border border-red-400/40 px-1 py-0.5 text-red-300 disabled:opacity-40">Retry</button>}
            {polishError && hasPendingTranscript && <><button type="button" onClick={retryPolish} disabled={isPolishing} className="rounded border border-red-400/40 px-1 py-0.5 text-red-300 disabled:opacity-40">Retry</button><button type="button" onClick={useOriginal} className="rounded border border-zinc-600 px-1 py-0.5 text-zinc-400">Use original</button></>}
          </div>
        )}
        <DictationButton
          isListening={isListening}
          isAvailable={isAvailable}
          title={dictationTitle(dictationMode, isListening)}
          onClick={toggle}
        />
        <ImageRecognitionButton
          isAvailable={isImageRecognitionAvailable}
          isRecognizing={isRecognizing}
          onClick={handleImageRecognitionClick}
        />
      </div>
      {isImageModalOpen && <ImageRecognitionModal
        isSubmitting={isRecognizing}
        recognitionError={recognitionError}
        onClose={closeImageModal}
        onSubmit={submitImage}
      />}
    </div>
  )
}

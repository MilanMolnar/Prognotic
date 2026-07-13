import { DictationButton } from '@renderer/components/DictationButton'
import { DocumentCaptureButton } from '@renderer/components/DocumentCaptureButton'
import { DocumentCaptureModal } from '@renderer/components/DocumentCaptureModal'
import { ImageRecognitionButton } from '@renderer/components/ImageRecognitionButton'
import { ImageRecognitionModal } from '@renderer/components/ImageRecognitionModal'
import { useDocumentCapture } from '@renderer/hooks/useDocumentCapture'
import { useImageRecognition } from '@renderer/hooks/useImageRecognition'
import { MarkdownFormat, useQuickInput } from '@renderer/hooks/useQuickInput'
import { dictationTitle, useDictation } from '@renderer/hooks/useDictation'
import { useTranscriptPolish } from '@renderer/hooks/useTranscriptPolish'
import { useBlockActions, useBlocks, useGoals, useSettings } from '@renderer/context'
import { blockLabel, cn } from '@renderer/utils'
import { isImageRecognitionReady, isLlmSelectionVerified } from '@shared/llmSettings'
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
  const { text, setText, isSubmitting, textareaRef, submit, handleKeyDown, applyFormat, appendTranscript, appendDocument } =
    useQuickInput()
  const { blocks, blockContents, openBlockId, selectedBlockId } = useBlocks()
  const { settings } = useSettings()
  const { closeOpenBlock } = useBlockActions()
  const { selectedCategory } = useGoals()
  const isEditingBlock = selectedBlockId !== null

  const focusCaptureInput = useCallback((): void => {
    textareaRef.current?.focus()
  }, [textareaRef])

  const { acceptTranscript, retryPolish, useOriginal, polishError, isPolishing, hasPendingTranscript } =
    useTranscriptPolish({
      enabled: settings.llm.polishDictation && isLlmSelectionVerified(settings.llm),
      onAccepted: appendTranscript
    })

  const { dictationMode, isListening, interimText, error, notice, isAvailable, toggle, stop } =
    useDictation({ onFinalTranscript: (text) => { void acceptTranscript(text) }, focusInput: focusCaptureInput })

  const {
    isModalOpen: isImageModalOpen,
    isRecognizing,
    recognitionError,
    hasPendingRequest: hasPendingImage,
    openModal: openImageModal,
    closeModal: closeImageModal,
    submitImage,
    retryRecognition
  } = useImageRecognition({ onRecognized: appendTranscript })
  const isImageRecognitionAvailable = isImageRecognitionReady(settings.llm)
  const {
    isModalOpen: isDocumentModalOpen,
    isParsing: isParsingDocument,
    isSummarizing: isSummarizingDocument,
    parseError: documentParseError,
    summaryError: documentSummaryError,
    parsedDocument,
    summaryText: documentSummaryText,
    summaryInputTruncated,
    hasPendingParse,
    hasPendingSummary,
    openModal: openDocumentModal,
    closeModal: closeDocumentModal,
    resetDocument,
    clearSummary,
    submitDocument,
    retryParse,
    summarize,
    retrySummary,
    insertText: insertDocumentText
  } = useDocumentCapture({ onInsert: appendDocument })
  const isTextLlmAvailable = isLlmSelectionVerified(settings.llm)

  // Stop dictation when the bar becomes inert or the draft is sent.
  useEffect(() => {
    if (isEditingBlock || isSubmitting) {
      stop()
      closeImageModal()
      closeDocumentModal()
    }
  }, [closeDocumentModal, closeImageModal, isEditingBlock, isSubmitting, stop])

  const handleDictationClick = useCallback((): void => {
    toggle()
  }, [toggle])

  const handleImageRecognitionClick = useCallback((): void => {
    stop()
    closeDocumentModal()
    openImageModal()
  }, [closeDocumentModal, openImageModal, stop])

  const handleDocumentCaptureClick = useCallback((): void => {
    stop()
    closeImageModal()
    openDocumentModal()
  }, [closeImageModal, openDocumentModal, stop])

  // Mirrors submitQuickNote's targeting: the open block receives the append
  // only while its window is active (provider clears openBlockId on expiry)
  // and the viewed category is among its categories.
  const openTarget = openBlockId ? blocks?.find((block) => block.id === openBlockId) : undefined
  const appendTarget =
    openTarget && openTarget.categories.includes(selectedCategory) ? openTarget : undefined
  const isDocumentTargetReady = !appendTarget || blockContents[appendTarget.id] !== undefined
  const appendTargetContentChars = appendTarget ? (blockContents[appendTarget.id]?.length ?? 0) : 0
  const pendingBlockSeparatorChars = appendTargetContentChars > 0 ? 2 : 0

  const statusMessage = recognitionError ?? (isRecognizing
    ? 'Recognizing image text...'
    : polishError ?? (isPolishing ? 'Polishing transcript...' : error ?? notice))
  const hasStatusError = recognitionError !== null || polishError !== null || error !== null

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
          {appendTarget ? blockLabel(appendTarget, settings.llm.aiBlockNameSummary) : 'new'}
        </legend>
        <div data-tour="capture-tools" className="flex items-center gap-0.5 px-2 pt-0.5">
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
          <ImageRecognitionButton
            isAvailable={isImageRecognitionAvailable}
            isRecognizing={isRecognizing}
            disabled={isEditingBlock || isSubmitting}
            onClick={handleImageRecognitionClick}
          />
          <DocumentCaptureButton
            isProcessing={isParsingDocument || isSummarizingDocument}
            disabled={isEditingBlock || isSubmitting || !isDocumentTargetReady}
            onClick={handleDocumentCaptureClick}
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
          <div className="flex items-center gap-2 px-3 pt-0.5 text-xs" aria-live="polite">
            <span className={cn(hasStatusError ? 'text-red-400/90' : notice || isPolishing || isRecognizing ? 'text-zinc-500' : 'text-zinc-500 italic')}>{statusMessage ?? interimText}</span>
            {recognitionError && hasPendingImage && <button type="button" onClick={retryRecognition} disabled={isRecognizing} className="rounded border border-red-400/40 px-1 py-0.5 text-red-300 disabled:opacity-40">Retry</button>}
            {polishError && hasPendingTranscript && <><button type="button" onClick={retryPolish} disabled={isPolishing} className="rounded border border-red-400/40 px-1 py-0.5 text-red-300 disabled:opacity-40">Retry</button><button type="button" onClick={useOriginal} className="rounded border border-zinc-600 px-1 py-0.5 text-zinc-400">Use original</button></>}
          </div>
        ) : null}
        <textarea
          data-tour="capture-input"
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
      {isImageModalOpen && <ImageRecognitionModal
        isSubmitting={isRecognizing}
        recognitionError={recognitionError}
        onClose={closeImageModal}
        onSubmit={submitImage}
      />}
      {isDocumentModalOpen && <DocumentCaptureModal
        isParsing={isParsingDocument}
        isSummarizing={isSummarizingDocument}
        parseError={documentParseError}
        summaryError={documentSummaryError}
        parsedDocument={parsedDocument}
        summaryText={documentSummaryText}
        summaryInputTruncated={summaryInputTruncated}
        hasPendingParse={hasPendingParse}
        hasPendingSummary={hasPendingSummary}
        aiAvailable={isTextLlmAvailable}
        currentContentChars={text.length + appendTargetContentChars + pendingBlockSeparatorChars}
        onClose={closeDocumentModal}
        onResetDocument={resetDocument}
        onClearSummary={clearSummary}
        onSubmit={submitDocument}
        onRetryParse={retryParse}
        onSummarize={summarize}
        onRetrySummary={retrySummary}
        onInsert={insertDocumentText}
      />}
    </form>
  )
}

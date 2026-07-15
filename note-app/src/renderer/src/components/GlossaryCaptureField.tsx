import { useI18n, useSettings } from '@renderer/context'
import { dictationTitle, useDictation } from '@renderer/hooks/useDictation'
import { useDocumentCapture } from '@renderer/hooks/useDocumentCapture'
import { useImageRecognition } from '@renderer/hooks/useImageRecognition'
import { useTranscriptPolish } from '@renderer/hooks/useTranscriptPolish'
import { cn } from '@renderer/utils'
import { isImageRecognitionReady, isLlmSelectionVerified } from '@shared/llmSettings'
import { JSX, KeyboardEvent, useCallback, useEffect, useRef } from 'react'
import { DictationButton } from './DictationButton'
import { DocumentCaptureButton } from './DocumentCaptureButton'
import { DocumentCaptureModal } from './DocumentCaptureModal'
import { ImageRecognitionButton } from './ImageRecognitionButton'
import { ImageRecognitionModal } from './ImageRecognitionModal'

export type GlossaryCaptureFieldId = 'key' | 'explanation'

export type GlossaryCaptureFieldProps = {
    fieldId: GlossaryCaptureFieldId
    label: string
    value: string
    placeholder: string
    // Single-line fields collapse inserted newlines and enforce maxLength.
    multiline?: boolean
    maxLength?: number
    // Dictation is exclusive across fields: the view records which field
    // started it and every other field shuts its own session down.
    activeDictationField: GlossaryCaptureFieldId | null
    onChange: (value: string) => void
    onDictationStart: (field: GlossaryCaptureFieldId) => void
}

export const GlossaryCaptureField = ({
    fieldId,
    label,
    value,
    placeholder,
    multiline = false,
    maxLength,
    activeDictationField,
    onChange,
    onDictationStart
}: GlossaryCaptureFieldProps): JSX.Element => {
    const { settings } = useSettings()
    const { t } = useI18n()
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

    const focusInput = useCallback((): void => {
        inputRef.current?.focus()
    }, [])

    // Selection-aware insertion mirroring useQuickInput: dictation stays
    // inline, documents get block boundaries — except in single-line fields,
    // where everything collapses to spaces and respects maxLength. The
    // controlled element's value mirrors the React state, so it is the
    // callback-safe source of the current text.
    const insertCaptureText = useCallback((chunk: string, blockBoundary: boolean): void => {
        const element = inputRef.current
        if (!element) return
        const trimmed = multiline ? chunk.trim() : chunk.trim().replace(/\s+/g, ' ')
        if (!trimmed) return

        const prev = element.value
        const start = element.selectionStart ?? prev.length
        const end = element.selectionEnd ?? prev.length
        const before = prev.slice(0, start)
        const after = prev.slice(end)
        const useBoundary = blockBoundary && multiline
        const prefix = useBoundary
            ? before.length === 0 || /\n\s*\n$/.test(before)
                ? ''
                : /\n$/.test(before) ? '\n' : '\n\n'
            : before.length > 0 && !/\s$/.test(before) ? ' ' : ''
        const suffix = useBoundary && after.length > 0
            ? /^\n\s*\n/.test(after) ? '' : /^\n/.test(after) ? '\n' : '\n\n'
            : ''
        let next = before + prefix + trimmed + suffix + after
        let cursor = before.length + prefix.length + trimmed.length
        if (maxLength !== undefined && next.length > maxLength) {
            next = next.slice(0, maxLength)
            cursor = Math.min(cursor, maxLength)
        }
        onChange(next)
        requestAnimationFrame(() => {
            element.focus()
            element.setSelectionRange(cursor, cursor)
        })
    }, [maxLength, multiline, onChange])

    const appendTranscript = useCallback((chunk: string): void => {
        insertCaptureText(chunk, false)
    }, [insertCaptureText])

    const appendDocument = useCallback((text: string): void => {
        insertCaptureText(text, true)
    }, [insertCaptureText])

    const { acceptTranscript, retryPolish, useOriginal, polishError, isPolishing, hasPendingTranscript } =
        useTranscriptPolish({
            enabled: settings.llm.polishDictation && isLlmSelectionVerified(settings.llm),
            onAccepted: appendTranscript
        })

    const { dictationMode, isListening, interimText, error, notice, isAvailable, toggle, stop } =
        useDictation({ onFinalTranscript: (text) => { void acceptTranscript(text) }, focusInput })

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

    // Another field claimed dictation — shut this field's session down.
    useEffect(() => {
        if (activeDictationField !== fieldId) stop()
    }, [activeDictationField, fieldId, stop])

    const handleDictationClick = useCallback((): void => {
        onDictationStart(fieldId)
        toggle()
    }, [fieldId, onDictationStart, toggle])

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

    // Enter saves the entry, Shift+Enter inserts a newline (single-line
    // inputs submit the surrounding form natively).
    const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
        event.preventDefault()
        event.currentTarget.form?.requestSubmit()
    }

    const statusMessage = recognitionError ?? (isRecognizing
        ? t('capture.recognizingImageText')
        : polishError ?? (isPolishing ? t('capture.polishingTranscript') : error ?? notice))
    const hasStatusError = recognitionError !== null || polishError !== null || error !== null

    const registerInput = (element: HTMLInputElement | HTMLTextAreaElement | null): void => {
        inputRef.current = element
    }

    return (
        <div className="min-w-0 flex-1">
            <fieldset className="min-w-0 rounded-lg border border-zinc-400/50 bg-zinc-900/40 transition-colors duration-100 focus-within:border-zinc-300/60">
                <legend className="ml-3 max-w-[60%] truncate px-1 text-xs font-light text-zinc-500">{label}</legend>
                <div className="flex items-center gap-0.5 px-2 pt-0.5">
                    <DictationButton
                        isListening={isListening}
                        isAvailable={isAvailable}
                        title={dictationTitle(dictationMode, isListening, t)}
                        onClick={handleDictationClick}
                    />
                    <ImageRecognitionButton
                        isAvailable={isImageRecognitionAvailable}
                        isRecognizing={isRecognizing}
                        onClick={handleImageRecognitionClick}
                    />
                    <DocumentCaptureButton
                        isProcessing={isParsingDocument || isSummarizingDocument}
                        onClick={handleDocumentCaptureClick}
                    />
                    <span className="flex-1" />
                    {maxLength !== undefined && (
                        <span className={cn('px-1 text-[10px] tabular-nums', value.length >= maxLength ? 'text-red-400' : 'text-zinc-500')}>
                            {value.length}/{maxLength}
                        </span>
                    )}
                </div>
                {(isListening && interimText) || statusMessage ? (
                    <div className="flex items-center gap-2 px-3 pt-0.5 text-xs" aria-live="polite" role={hasStatusError ? 'alert' : undefined}>
                        <span title={statusMessage ?? interimText} className={cn(hasStatusError ? 'text-red-400/90' : notice || isPolishing || isRecognizing ? 'text-zinc-500' : 'text-zinc-500 italic')}>{statusMessage ?? interimText}</span>
                        {recognitionError && hasPendingImage && <button type="button" onClick={retryRecognition} disabled={isRecognizing} className="rounded border border-red-400/40 px-1 py-0.5 text-red-300 disabled:opacity-40">{t('common.retry')}</button>}
                        {polishError && hasPendingTranscript && <><button type="button" onClick={retryPolish} disabled={isPolishing} className="rounded border border-red-400/40 px-1 py-0.5 text-red-300 disabled:opacity-40">{t('common.retry')}</button><button type="button" onClick={useOriginal} className="rounded border border-zinc-600 px-1 py-0.5 text-zinc-400">{t('common.useOriginal')}</button></>}
                    </div>
                ) : null}
                {multiline ? (
                    <textarea
                        ref={registerInput}
                        rows={2}
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        onKeyDown={handleTextareaKeyDown}
                        placeholder={isListening ? t('capture.listening') : placeholder}
                        className="block max-h-40 min-h-12 w-full resize-y bg-transparent px-3 pb-1.5 text-sm outline-none caret-yellow-500 placeholder:text-zinc-500"
                    />
                ) : (
                    <input
                        ref={registerInput}
                        type="text"
                        value={value}
                        maxLength={maxLength}
                        onChange={(event) => onChange(event.target.value)}
                        placeholder={isListening ? t('capture.listening') : placeholder}
                        className="block w-full bg-transparent px-3 pb-2 pt-1 text-sm outline-none caret-yellow-500 placeholder:text-zinc-500"
                    />
                )}
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
                currentContentChars={value.length}
                onClose={closeDocumentModal}
                onResetDocument={resetDocument}
                onClearSummary={clearSummary}
                onSubmit={submitDocument}
                onRetryParse={retryParse}
                onSummarize={summarize}
                onRetrySummary={retrySummary}
                onInsert={insertDocumentText}
            />}
        </div>
    )
}

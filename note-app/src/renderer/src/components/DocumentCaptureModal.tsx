import { cn } from '@renderer/utils'
import {
    defaultDocumentSummaryOptions,
    documentFileAccept,
    documentFormatForExtension,
    documentFormatLabel,
    documentMimeTypeMatches,
    documentSummaryStyles,
    DocumentSummaryOptions,
    maxDocumentBytesForFormat,
    prepareDocumentInsertion,
    supportedDocumentExtensionFor,
    supportedDocumentFileSummary,
    SupportedDocumentExtension
} from '@shared/documents'
import type { ParsedDocument } from '@shared/types'
import { DragEvent, JSX, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LuFileText, LuUpload } from 'react-icons/lu'

export type DocumentCaptureSelection = {
    file: File
    extension: SupportedDocumentExtension
}

export type DocumentCaptureModalProps = {
    isParsing: boolean
    isSummarizing: boolean
    parseError: string | null
    summaryError: string | null
    parsedDocument: ParsedDocument | null
    summaryText: string | null
    summaryInputTruncated: boolean
    hasPendingParse: boolean
    hasPendingSummary: boolean
    aiAvailable: boolean
    currentContentChars: number
    onClose: () => void
    onResetDocument: () => void
    onClearSummary: () => void
    onSubmit: (selection: DocumentCaptureSelection) => void
    onRetryParse: () => void
    onSummarize: (options: DocumentSummaryOptions) => void
    onRetrySummary: () => void
    onInsert: (text: string) => void
}

const previewCharacterLimit = 20_000

const formatBytes = (bytes: number): string => bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MiB`
    : `${Math.max(1, Math.ceil(bytes / 1024))} KiB`

const previewFor = (text: string): string => text.length > previewCharacterLimit
    ? `${text.slice(0, previewCharacterLimit)}\n\n[Preview ends here]`
    : text

export const DocumentCaptureModal = ({
    isParsing,
    isSummarizing,
    parseError,
    summaryError,
    parsedDocument,
    summaryText,
    summaryInputTruncated,
    hasPendingParse,
    hasPendingSummary,
    aiAvailable,
    currentContentChars,
    onClose,
    onResetDocument,
    onClearSummary,
    onSubmit,
    onRetryParse,
    onSummarize,
    onRetrySummary,
    onInsert
}: DocumentCaptureModalProps): JSX.Element => {
    const titleId = useId()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [selectedDocument, setSelectedDocument] = useState<DocumentCaptureSelection | null>(null)
    const [fileError, setFileError] = useState<string | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [summaryOptions, setSummaryOptions] = useState<DocumentSummaryOptions>(() => ({
        ...defaultDocumentSummaryOptions
    }))

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const selectFile = useCallback((file: File): void => {
        onResetDocument()
        setSelectedDocument(null)
        const rawExtension = file.name.toLowerCase().split('.').pop() ?? ''
        if (rawExtension === 'pdf') {
            setFileError('PDF capture is not supported yet. Convert it to text, DOCX, or an image first.')
            return
        }

        const extension = supportedDocumentExtensionFor(file.name)
        if (!extension) {
            setFileError(`Choose ${supportedDocumentFileSummary}.`)
            return
        }
        const format = documentFormatForExtension(extension)
        if (file.size === 0) {
            setFileError('The selected document is empty.')
            return
        }
        const byteLimit = maxDocumentBytesForFormat(format)
        if (file.size > byteLimit) {
            setFileError(`The selected document is larger than the ${byteLimit / 1024 / 1024} MiB limit for this format.`)
            return
        }
        if (!documentMimeTypeMatches(format, file.type)) {
            setFileError('The document file type does not match its extension.')
            return
        }

        setSelectedDocument({ file, extension })
        setFileError(null)
    }, [onResetDocument])

    const handleDrop = useCallback((event: DragEvent<HTMLDivElement>): void => {
        event.preventDefault()
        setIsDragging(false)
        const file = event.dataTransfer.files[0]
        if (!file) {
            setFileError(`Drop ${supportedDocumentFileSummary}.`)
            return
        }
        selectFile(file)
    }, [selectFile])

    const updateSummaryOptions = useCallback((patch: Partial<DocumentSummaryOptions>): void => {
        onClearSummary()
        setSummaryOptions((current) => ({ ...current, ...patch }))
    }, [onClearSummary])

    const rawInsertion = useMemo(
        () => parsedDocument ? prepareDocumentInsertion(parsedDocument.text, currentContentChars) : null,
        [currentContentChars, parsedDocument]
    )
    const summaryInsertion = useMemo(
        () => summaryText ? prepareDocumentInsertion(summaryText, currentContentChars) : null,
        [currentContentChars, summaryText]
    )
    const rawPreview = useMemo(
        () => parsedDocument ? previewFor(parsedDocument.text) : '',
        [parsedDocument]
    )
    const summaryPreview = useMemo(() => summaryText ? previewFor(summaryText) : '', [summaryText])
    const sourceWordCount = useMemo(
        () => parsedDocument?.text.trim().split(/\s+/).filter(Boolean).length ?? 0,
        [parsedDocument]
    )
    const cannotInsert = rawInsertion?.text.length === 0
    const activeError = fileError ?? parseError

    return createPortal((
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
            onClick={(event) => { event.stopPropagation(); onClose() }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
                onClick={(event) => event.stopPropagation()}
            >
                <h2 id={titleId} className="font-bold text-zinc-100">Insert from document</h2>
                <p className="mt-1 text-xs text-zinc-500">
                    Parsing happens locally. The source file is kept in memory and is not saved to your note vault.
                </p>

                <div
                    onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }}
                    onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }}
                    onDragLeave={(event) => { event.preventDefault(); setIsDragging(false) }}
                    onDrop={handleDrop}
                    className={cn(
                        'mt-4 rounded-lg border border-dashed p-4 transition-colors',
                        isDragging ? 'border-yellow-500/70 bg-yellow-500/10' : 'border-zinc-600 bg-zinc-950/30'
                    )}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={documentFileAccept}
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file) selectFile(file)
                            event.target.value = ''
                        }}
                    />
                    {selectedDocument ? (
                        <div className="flex items-center gap-3">
                            <LuFileText className="h-8 w-8 shrink-0 text-zinc-500" />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm text-zinc-200">{selectedDocument.file.name}</div>
                                <div className="mt-1 text-xs text-zinc-500">
                                    {formatBytes(selectedDocument.file.size)} · {documentFormatLabel(documentFormatForExtension(selectedDocument.extension))}
                                </div>
                            </div>
                            <button
                                type="button"
                                disabled={isParsing || isSummarizing}
                                onClick={() => fileInputRef.current?.click()}
                                className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
                            >
                                Choose another
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center text-center">
                            <LuFileText className="h-7 w-7 text-zinc-500" />
                            <p className="mt-2 text-sm text-zinc-300">Drop a document here</p>
                            <p className="mt-0.5 text-xs text-zinc-500">{supportedDocumentFileSummary}; up to 20 MiB</p>
                            <p className="mt-0.5 text-xs text-zinc-600">PDF is not supported in this capture path.</p>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="mt-3 inline-flex items-center gap-1 rounded-md border border-zinc-500/60 px-2 py-1 text-sm text-zinc-200 hover:bg-zinc-700"
                            >
                                <LuUpload className="h-4 w-4" />
                                Browse
                            </button>
                        </div>
                    )}
                </div>

                {activeError && <p className="mt-3 text-sm text-red-400" role="alert">{activeError}</p>}

                {!parsedDocument && (
                    <div className="mt-4 flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="rounded-md border border-zinc-500/50 px-2 py-1 text-sm text-zinc-200 hover:bg-zinc-700">Cancel</button>
                        {parseError && hasPendingParse ? (
                            <button
                                type="button"
                                disabled={isParsing}
                                onClick={onRetryParse}
                                className="rounded-md border border-yellow-500/50 px-2 py-1 text-sm text-zinc-100 hover:bg-yellow-500/20 disabled:opacity-40"
                            >
                                {isParsing ? 'Parsing...' : 'Retry parse'}
                            </button>
                        ) : (
                            <button
                                type="button"
                                disabled={!selectedDocument || isParsing}
                                onClick={() => selectedDocument && onSubmit(selectedDocument)}
                                className="rounded-md border border-yellow-500/50 px-2 py-1 text-sm text-zinc-100 hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {isParsing ? 'Parsing locally...' : 'Parse document'}
                            </button>
                        )}
                    </div>
                )}

                {parsedDocument && (
                    <>
                        <section className="mt-5">
                            <div className="flex flex-wrap items-end justify-between gap-2">
                                <div>
                                    <h3 className="text-sm font-semibold text-zinc-200">1. Local extraction</h3>
                                    <p className="mt-0.5 text-xs text-zinc-500">
                                        {parsedDocument.text.length.toLocaleString()} characters · {sourceWordCount.toLocaleString()} words
                                        {parsedDocument.text.length > previewCharacterLimit ? ` · previewing the first ${previewCharacterLimit.toLocaleString()} characters` : ''}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    disabled={cannotInsert || isParsing || isSummarizing}
                                    onClick={() => rawInsertion && onInsert(rawInsertion.text)}
                                    className="rounded-md border border-zinc-500/60 px-2 py-1 text-sm text-zinc-100 hover:bg-zinc-700 disabled:opacity-40"
                                >
                                    Insert raw
                                </button>
                            </div>
                            {parsedDocument.warnings?.map((warning) => (
                                <p key={warning} className="mt-2 text-xs text-amber-300/80">{warning}</p>
                            ))}
                            {rawInsertion?.truncated && (
                                <p className="mt-2 text-xs text-amber-300/80">The inserted raw text will be truncated to fit the current note block.</p>
                            )}
                            {cannotInsert && (
                                <p className="mt-2 text-xs text-red-400">The current capture draft is already at the 1,000,000-character block limit.</p>
                            )}
                            {!summaryText && (
                                <textarea
                                    readOnly
                                    aria-label="Parsed document preview"
                                    value={rawPreview}
                                    rows={10}
                                    className="mt-3 block w-full resize-y rounded-md border border-zinc-700 bg-zinc-950/50 p-3 font-mono text-xs leading-relaxed text-zinc-300 outline-none"
                                />
                            )}
                        </section>

                        <section className="mt-5 border-t border-zinc-700/70 pt-4">
                            <h3 className="text-sm font-semibold text-zinc-200">2. Optional AI summary</h3>
                            <p className="mt-0.5 text-xs text-zinc-500">
                                A bounded excerpt is sent only when you request a summary, using the verified global text model.
                            </p>
                            {!aiAvailable && (
                                <p className="mt-3 rounded-md border border-zinc-700 bg-zinc-950/40 p-2 text-xs text-zinc-400">
                                    AI is not ready. Choose a model and test the connection in Settings. Local parsing and raw insertion remain available.
                                </p>
                            )}

                            <fieldset disabled={!aiAvailable || isSummarizing} className="mt-3 grid gap-3 disabled:opacity-50 md:grid-cols-2">
                                <div>
                                    <label htmlFor="document-summary-style" className="block text-xs text-zinc-400">Style</label>
                                    <select
                                        id="document-summary-style"
                                        value={summaryOptions.style}
                                        onChange={(event) => updateSummaryOptions({ style: event.target.value as DocumentSummaryOptions['style'] })}
                                        className="mt-1 w-full rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-yellow-500/60"
                                    >
                                        {documentSummaryStyles.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
                                    </select>
                                    {summaryOptions.style === 'custom' && (
                                        <input
                                            value={summaryOptions.customStyle}
                                            maxLength={240}
                                            onChange={(event) => updateSummaryOptions({ customStyle: event.target.value })}
                                            placeholder="e.g. concise legal issue brief"
                                            className="mt-2 w-full rounded-md border border-zinc-600 bg-transparent px-2 py-1.5 text-sm text-zinc-200 outline-none caret-yellow-500"
                                        />
                                    )}
                                </div>
                                <div>
                                    <label htmlFor="document-summary-length" className="flex justify-between text-xs text-zinc-400">
                                        <span>Target length</span>
                                        <span>{summaryOptions.targetPercent}% of AI excerpt</span>
                                    </label>
                                    <input
                                        id="document-summary-length"
                                        type="range"
                                        min={10}
                                        max={80}
                                        step={5}
                                        value={summaryOptions.targetPercent}
                                        onChange={(event) => updateSummaryOptions({ targetPercent: Number(event.target.value) })}
                                        className="mt-3 w-full accent-yellow-500"
                                    />
                                    <div className="flex justify-between text-[10px] text-zinc-600"><span>Shorter</span><span>Longer</span></div>
                                </div>
                                <div>
                                    <label htmlFor="document-summary-focus" className="block text-xs text-zinc-400">Focus</label>
                                    <input
                                        id="document-summary-focus"
                                        value={summaryOptions.focus}
                                        maxLength={500}
                                        onChange={(event) => updateSummaryOptions({ focus: event.target.value })}
                                        placeholder="What should the summary emphasize or ignore?"
                                        className="mt-1 w-full rounded-md border border-zinc-600 bg-transparent px-2 py-1.5 text-sm text-zinc-200 outline-none caret-yellow-500"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="document-summary-instructions" className="block text-xs text-zinc-400">Extra instructions</label>
                                    <textarea
                                        id="document-summary-instructions"
                                        value={summaryOptions.instructions}
                                        maxLength={1_500}
                                        rows={2}
                                        onChange={(event) => updateSummaryOptions({ instructions: event.target.value })}
                                        placeholder="Optional constraints or output details"
                                        className="mt-1 w-full resize-y rounded-md border border-zinc-600 bg-transparent px-2 py-1.5 text-sm text-zinc-200 outline-none caret-yellow-500"
                                    />
                                </div>
                                <label className="flex items-center gap-2 text-xs text-zinc-400 md:col-span-2">
                                    <input
                                        type="checkbox"
                                        checked={summaryOptions.preserveStructure}
                                        onChange={(event) => updateSummaryOptions({ preserveStructure: event.target.checked })}
                                        className="accent-yellow-500"
                                    />
                                    Preserve useful source headings and structure
                                </label>
                            </fieldset>

                            {summaryError && <p className="mt-3 text-sm text-red-400" role="alert">{summaryError}</p>}
                            {summaryInputTruncated && (
                                <p className="mt-2 text-xs text-amber-300/80">The AI summarized a bounded head-and-tail excerpt; local raw text remains complete up to the capture limit.</p>
                            )}

                            <div className="mt-3 flex flex-wrap justify-end gap-2">
                                {summaryError && hasPendingSummary ? (
                                    <button
                                        type="button"
                                        disabled={isSummarizing}
                                        onClick={onRetrySummary}
                                        className="rounded-md border border-yellow-500/50 px-2 py-1 text-sm text-zinc-100 hover:bg-yellow-500/20 disabled:opacity-40"
                                    >
                                        {isSummarizing ? 'Summarizing...' : 'Retry summary'}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={!aiAvailable || isSummarizing || (summaryOptions.style === 'custom' && !summaryOptions.customStyle.trim())}
                                        onClick={() => onSummarize(summaryOptions)}
                                        className="rounded-md border border-yellow-500/50 px-2 py-1 text-sm text-zinc-100 hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        {isSummarizing ? 'Summarizing...' : summaryText ? 'Summarize again' : 'Summarize preview'}
                                    </button>
                                )}
                                {summaryError && (
                                    <button
                                        type="button"
                                        disabled={cannotInsert}
                                        onClick={() => rawInsertion && onInsert(rawInsertion.text)}
                                        className="rounded-md border border-zinc-600 px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
                                    >
                                        Use raw text
                                    </button>
                                )}
                            </div>
                        </section>

                        {summaryText && summaryInsertion && (
                            <section className="mt-5 grid gap-3 md:grid-cols-2">
                                <div>
                                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Before · parsed text</div>
                                    <textarea readOnly value={rawPreview} rows={12} className="block w-full resize-y rounded-md border border-zinc-700 bg-zinc-950/50 p-3 font-mono text-xs leading-relaxed text-zinc-400 outline-none" />
                                </div>
                                <div>
                                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-yellow-600/80">After · AI summary</div>
                                    <textarea readOnly value={summaryPreview} rows={12} className="block w-full resize-y rounded-md border border-yellow-700/40 bg-zinc-950/50 p-3 font-mono text-xs leading-relaxed text-zinc-200 outline-none" />
                                </div>
                                {summaryInsertion.truncated && (
                                    <p className="text-xs text-amber-300/80 md:col-span-2">The inserted summary will be truncated to fit the current note block.</p>
                                )}
                                <div className="flex justify-end gap-2 md:col-span-2">
                                    <button
                                        type="button"
                                        disabled={cannotInsert}
                                        onClick={() => rawInsertion && onInsert(rawInsertion.text)}
                                        className="rounded-md border border-zinc-600 px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
                                    >
                                        Insert raw instead
                                    </button>
                                    <button
                                        type="button"
                                        disabled={summaryInsertion.text.length === 0}
                                        onClick={() => onInsert(summaryInsertion.text)}
                                        className="rounded-md border border-yellow-500/50 px-2 py-1 text-sm text-zinc-100 hover:bg-yellow-500/20 disabled:opacity-40"
                                    >
                                        Insert summary
                                    </button>
                                </div>
                            </section>
                        )}

                        <div className="mt-5 flex justify-end">
                            <button type="button" onClick={onClose} className="rounded-md border border-zinc-500/50 px-2 py-1 text-sm text-zinc-200 hover:bg-zinc-700">Cancel</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    ), document.body)
}

import type { DocumentCaptureSelection } from '@renderer/components/DocumentCaptureModal'
import type { DocumentSummaryOptions } from '@shared/documents'
import type {
    ParseDocumentInput,
    ParsedDocument,
    SummarizeDocumentInput
} from '@shared/types'
import { useI18n } from '@renderer/context/I18nContext'
import { useCallback, useEffect, useRef, useState } from 'react'

export type UseDocumentCaptureParams = {
    onInsert: (text: string) => void
}

export type UseDocumentCaptureResult = {
    isModalOpen: boolean
    isParsing: boolean
    isSummarizing: boolean
    parseError: string | null
    summaryError: string | null
    parsedDocument: ParsedDocument | null
    summaryText: string | null
    summaryInputTruncated: boolean
    hasPendingParse: boolean
    hasPendingSummary: boolean
    openModal: () => void
    closeModal: () => void
    resetDocument: () => void
    clearSummary: () => void
    submitDocument: (selection: DocumentCaptureSelection) => void
    retryParse: () => void
    summarize: (options: DocumentSummaryOptions) => void
    retrySummary: () => void
    insertText: (text: string) => void
}

export const useDocumentCapture = ({ onInsert }: UseDocumentCaptureParams): UseDocumentCaptureResult => {
    const { t } = useI18n()
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isParsing, setIsParsing] = useState(false)
    const [isSummarizing, setIsSummarizing] = useState(false)
    const [parseError, setParseError] = useState<string | null>(null)
    const [summaryError, setSummaryError] = useState<string | null>(null)
    const [parsedDocument, setParsedDocument] = useState<ParsedDocument | null>(null)
    const [summaryText, setSummaryText] = useState<string | null>(null)
    const [summaryInputTruncated, setSummaryInputTruncated] = useState(false)
    const [hasPendingParse, setHasPendingParse] = useState(false)
    const [hasPendingSummary, setHasPendingSummary] = useState(false)
    const pendingParseRef = useRef<ParseDocumentInput | null>(null)
    const pendingSummaryRef = useRef<SummarizeDocumentInput | null>(null)
    const parseAttemptRef = useRef(0)
    const summaryAttemptRef = useRef(0)

    const clearSummary = useCallback((): void => {
        summaryAttemptRef.current += 1
        pendingSummaryRef.current = null
        setIsSummarizing(false)
        setSummaryError(null)
        setSummaryText(null)
        setSummaryInputTruncated(false)
        setHasPendingSummary(false)
    }, [])

    const resetDocument = useCallback((): void => {
        parseAttemptRef.current += 1
        summaryAttemptRef.current += 1
        pendingParseRef.current = null
        pendingSummaryRef.current = null
        setIsParsing(false)
        setIsSummarizing(false)
        setParseError(null)
        setSummaryError(null)
        setParsedDocument(null)
        setSummaryText(null)
        setSummaryInputTruncated(false)
        setHasPendingParse(false)
        setHasPendingSummary(false)
    }, [])

    useEffect(() => () => {
        parseAttemptRef.current += 1
        summaryAttemptRef.current += 1
        pendingParseRef.current = null
        pendingSummaryRef.current = null
    }, [])

    const runParse = useCallback(async (input: ParseDocumentInput, attempt: number): Promise<void> => {
        pendingParseRef.current = input
        setHasPendingParse(true)
        setParseError(null)
        setIsParsing(true)
        clearSummary()
        try {
            const result = await window.context.parseDocument(input)
            if (attempt !== parseAttemptRef.current) return
            if ('error' in result) {
                setParseError(t('document.error.parse'))
                return
            }
            setParsedDocument(result)
        } catch {
            if (attempt === parseAttemptRef.current) {
                setParseError(t('document.error.parse'))
            }
        } finally {
            if (attempt === parseAttemptRef.current) setIsParsing(false)
        }
    }, [clearSummary, t])

    const runSummary = useCallback(async (
        input: SummarizeDocumentInput,
        attempt: number
    ): Promise<void> => {
        pendingSummaryRef.current = input
        setHasPendingSummary(true)
        setSummaryError(null)
        setSummaryText(null)
        setSummaryInputTruncated(false)
        setIsSummarizing(true)
        try {
            const result = await window.context.summarizeDocument(input)
            if (attempt !== summaryAttemptRef.current) return
            if ('error' in result) {
                setSummaryError(t('document.error.summary'))
                return
            }
            setSummaryText(result.text)
            setSummaryInputTruncated(result.inputTruncated)
        } catch {
            if (attempt === summaryAttemptRef.current) {
                setSummaryError(t('document.error.summary'))
            }
        } finally {
            if (attempt === summaryAttemptRef.current) setIsSummarizing(false)
        }
    }, [t])

    const openModal = useCallback((): void => {
        resetDocument()
        setIsModalOpen(true)
    }, [resetDocument])

    const closeModal = useCallback((): void => {
        resetDocument()
        setIsModalOpen(false)
    }, [resetDocument])

    const submitDocument = useCallback((selection: DocumentCaptureSelection): void => {
        const attempt = ++parseAttemptRef.current
        setParseError(null)
        setParsedDocument(null)
        setIsParsing(true)
        void selection.file.arrayBuffer()
            .then((documentBytes) => {
                if (attempt !== parseAttemptRef.current) return
                return runParse({
                    documentBytes,
                    fileName: selection.file.name,
                    extension: selection.extension,
                    mimeType: selection.file.type
                }, attempt)
            })
            .catch(() => {
                if (attempt !== parseAttemptRef.current) return
                setParseError(t('document.error.read'))
                setIsParsing(false)
            })
    }, [runParse, t])

    const retryParse = useCallback((): void => {
        const input = pendingParseRef.current
        if (!input || isParsing) return
        const attempt = ++parseAttemptRef.current
        void runParse(input, attempt)
    }, [isParsing, runParse])

    const summarize = useCallback((options: DocumentSummaryOptions): void => {
        const parsed = parsedDocument
        const source = pendingParseRef.current
        if (!parsed || !source || isSummarizing) return
        const input: SummarizeDocumentInput = {
            text: parsed.text,
            fileName: source.fileName,
            format: parsed.format,
            sourceTruncated: parsed.truncated,
            options
        }
        const attempt = ++summaryAttemptRef.current
        void runSummary(input, attempt)
    }, [isSummarizing, parsedDocument, runSummary])

    const retrySummary = useCallback((): void => {
        const input = pendingSummaryRef.current
        if (!input || isSummarizing) return
        const attempt = ++summaryAttemptRef.current
        void runSummary(input, attempt)
    }, [isSummarizing, runSummary])

    const insertText = useCallback((text: string): void => {
        if (!text.trim()) return
        onInsert(text)
        closeModal()
    }, [closeModal, onInsert])

    return {
        isModalOpen,
        isParsing,
        isSummarizing,
        parseError,
        summaryError,
        parsedDocument,
        summaryText,
        summaryInputTruncated,
        hasPendingParse,
        hasPendingSummary,
        openModal,
        closeModal,
        resetDocument,
        clearSummary,
        submitDocument,
        retryParse,
        summarize,
        retrySummary,
        insertText
    }
}

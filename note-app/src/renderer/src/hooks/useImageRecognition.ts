import { ImageRecognitionSelection } from '@renderer/components/ImageRecognitionModal'
import { ImageRecognitionInput } from '@shared/types'
import { useCallback, useEffect, useRef, useState } from 'react'

export type UseImageRecognitionParams = {
    onRecognized: (text: string) => void
}

export type UseImageRecognitionResult = {
    isModalOpen: boolean
    isRecognizing: boolean
    recognitionError: string | null
    hasPendingRequest: boolean
    openModal: () => void
    closeModal: () => void
    submitImage: (selection: ImageRecognitionSelection) => void
    retryRecognition: () => void
}

export const useImageRecognition = ({
    onRecognized
}: UseImageRecognitionParams): UseImageRecognitionResult => {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isRecognizing, setIsRecognizing] = useState(false)
    const [recognitionError, setRecognitionError] = useState<string | null>(null)
    const [hasPendingRequest, setHasPendingRequest] = useState(false)
    const pendingRequestRef = useRef<ImageRecognitionInput | null>(null)
    const attemptRef = useRef(0)

    useEffect(() => () => {
        attemptRef.current += 1
        pendingRequestRef.current = null
    }, [])

    const runRecognition = useCallback(async (
        input: ImageRecognitionInput,
        attempt: number
    ): Promise<void> => {
        pendingRequestRef.current = input
        setHasPendingRequest(true)
        setRecognitionError(null)
        setIsRecognizing(true)
        try {
            const result = await window.context.recognizeImage(input)
            if (attempt !== attemptRef.current) return
            if ('error' in result) {
                setRecognitionError(result.error ?? 'Image recognition failed.')
                return
            }
            onRecognized(result.text)
            pendingRequestRef.current = null
            setHasPendingRequest(false)
            setIsModalOpen(false)
        } catch (error) {
            if (attempt === attemptRef.current) {
                setRecognitionError(error instanceof Error ? error.message : 'Image recognition failed.')
            }
        } finally {
            if (attempt === attemptRef.current) setIsRecognizing(false)
        }
    }, [onRecognized])

    const openModal = useCallback((): void => {
        attemptRef.current += 1
        setIsRecognizing(false)
        setRecognitionError(null)
        pendingRequestRef.current = null
        setHasPendingRequest(false)
        setIsModalOpen(true)
    }, [])

    const closeModal = useCallback((): void => {
        attemptRef.current += 1
        if (isRecognizing) {
            pendingRequestRef.current = null
            setHasPendingRequest(false)
            setRecognitionError(null)
        }
        setIsRecognizing(false)
        setIsModalOpen(false)
    }, [isRecognizing])

    const submitImage = useCallback((selection: ImageRecognitionSelection): void => {
        const attempt = ++attemptRef.current
        setRecognitionError(null)
        setIsRecognizing(true)
        void selection.file.arrayBuffer()
            .then((imageBytes) => {
                if (attempt !== attemptRef.current) return
                return runRecognition({
                    imageBytes,
                    mimeType: selection.mimeType,
                    language: selection.language,
                    containsHandwriting: selection.containsHandwriting
                }, attempt)
            })
            .catch((error) => {
                if (attempt !== attemptRef.current) return
                setRecognitionError(error instanceof Error ? error.message : 'Could not read the selected image.')
                setIsRecognizing(false)
            })
    }, [runRecognition])

    const retryRecognition = useCallback((): void => {
        const input = pendingRequestRef.current
        if (!input || isRecognizing) return
        const attempt = ++attemptRef.current
        void runRecognition(input, attempt)
    }, [isRecognizing, runRecognition])

    return {
        isModalOpen,
        isRecognizing,
        recognitionError,
        hasPendingRequest,
        openModal,
        closeModal,
        submitImage,
        retryRecognition
    }
}

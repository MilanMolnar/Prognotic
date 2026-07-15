import { cn } from '@renderer/utils'
import { useI18n } from '@renderer/context'
import { maxImageRecognitionBytes, supportedImageMimeTypes, SupportedImageMimeType } from '@shared/vision'
import { DragEvent, JSX, useCallback, useEffect, useId, useRef, useState } from 'react'
import { LuImage, LuUpload } from 'react-icons/lu'

export type ImageRecognitionSelection = {
    file: File
    mimeType: SupportedImageMimeType
    language: string
    containsHandwriting: boolean
}

export type ImageRecognitionModalProps = {
    isSubmitting: boolean
    recognitionError: string | null
    onClose: () => void
    onSubmit: (selection: ImageRecognitionSelection) => void
}

type SelectedImage = {
    file: File
    mimeType: SupportedImageMimeType
    previewUrl: string
}

const mimeTypeByExtension: Record<string, SupportedImageMimeType> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif'
}

const supportedMimeTypeFor = (file: File): SupportedImageMimeType | null => {
    if (supportedImageMimeTypes.includes(file.type as SupportedImageMimeType)) {
        return file.type as SupportedImageMimeType
    }
    if (file.type === 'image/jpg') return 'image/jpeg'
    if (file.type && file.type !== 'application/octet-stream') return null
    const extension = file.name.toLowerCase().split('.').pop() ?? ''
    return mimeTypeByExtension[extension] ?? null
}

export const ImageRecognitionModal = ({
    isSubmitting,
    recognitionError,
    onClose,
    onSubmit
}: ImageRecognitionModalProps): JSX.Element => {
    const { formatNumber, locale, t } = useI18n()
    const defaultImageLanguage = locale === 'hu'
        ? t('image.languageHungarian')
        : t('image.languageEnglish')
    const titleId = useId()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const previewUrlRef = useRef<string | null>(null)
    const [language, setLanguage] = useState(defaultImageLanguage)
    const [containsHandwriting, setContainsHandwriting] = useState(false)
    const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null)
    const [fileError, setFileError] = useState<string | null>(null)
    const [isDragging, setIsDragging] = useState(false)

    const clearPreview = useCallback((): void => {
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
    }, [])

    useEffect(() => clearPreview, [clearPreview])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const selectFile = useCallback((file: File): void => {
        clearPreview()
        setSelectedImage(null)
        const mimeType = supportedMimeTypeFor(file)
        if (!mimeType) {
            setFileError(t('image.error.type'))
            return
        }
        if (file.size === 0) {
            setFileError(t('image.error.empty'))
            return
        }
        if (file.size > maxImageRecognitionBytes) {
            setFileError(t('image.error.large'))
            return
        }

        const previewUrl = URL.createObjectURL(file)
        previewUrlRef.current = previewUrl
        setSelectedImage({ file, mimeType, previewUrl })
        setFileError(null)
    }, [clearPreview, t])

    const handleDrop = useCallback((event: DragEvent<HTMLDivElement>): void => {
        event.preventDefault()
        setIsDragging(false)
        const file = event.dataTransfer.files[0]
        if (!file) {
            setFileError(t('image.error.drop'))
            return
        }
        selectFile(file)
    }, [selectFile, t])

    const error = fileError ?? recognitionError

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
            onClick={(event) => { event.stopPropagation(); onClose() }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
                onClick={(event) => event.stopPropagation()}
            >
                <h2 id={titleId} className="font-bold text-zinc-100">{t('image.title')}</h2>
                <p className="mt-1 text-xs text-zinc-500">{t('image.privacy')}</p>

                <label htmlFor="image-language" className="mt-4 block text-sm text-zinc-300">{t('image.language')}</label>
                <input
                    id="image-language"
                    value={language}
                    maxLength={80}
                    onChange={(event) => setLanguage(event.target.value)}
                    placeholder={defaultImageLanguage}
                    className="mt-1 w-full rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500"
                />

                <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
                    <input
                        type="checkbox"
                        checked={containsHandwriting}
                        onChange={(event) => setContainsHandwriting(event.target.checked)}
                        className="accent-yellow-500"
                    />
                    {t('image.handwriting')}
                </label>

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
                        accept=".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file) selectFile(file)
                            event.target.value = ''
                        }}
                    />
                    {selectedImage ? (
                        <div className="flex items-center gap-3">
                            <img
                                src={selectedImage.previewUrl}
                                alt={t('image.selectedPreview')}
                                className="h-20 w-20 rounded-md border border-zinc-700 object-cover"
                            />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm text-zinc-200">{selectedImage.file.name}</div>
                                <div className="mt-1 text-xs text-zinc-500">{formatNumber(selectedImage.file.size / 1024 / 1024, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MiB</div>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="mt-2 rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                                >
                                    {t('image.chooseAnother')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center text-center">
                            <LuImage className="h-7 w-7 text-zinc-500" />
                            <p className="mt-2 text-sm text-zinc-300">{t('image.drop')}</p>
                            <p className="mt-0.5 text-xs text-zinc-500">{t('image.formats')}</p>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="mt-3 inline-flex items-center gap-1 rounded-md border border-zinc-500/60 px-2 py-1 text-sm text-zinc-200 hover:bg-zinc-700"
                            >
                                <LuUpload className="h-4 w-4" />
                                {t('common.browse')}
                            </button>
                        </div>
                    )}
                </div>

                {error && <p className="mt-3 text-sm text-red-400" role="alert">{error}</p>}

                <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="rounded-md border border-zinc-500/50 px-2 py-1 text-sm text-zinc-200 hover:bg-zinc-700">{t('common.cancel')}</button>
                    <button
                        type="button"
                        disabled={!selectedImage || isSubmitting}
                        onClick={() => selectedImage && onSubmit({
                            file: selectedImage.file,
                            mimeType: selectedImage.mimeType,
                            language,
                            containsHandwriting
                        })}
                        className="rounded-md border border-yellow-500/50 px-2 py-1 text-sm text-zinc-100 hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {isSubmitting ? t('image.recognizing') : recognitionError ? t('image.retry') : t('image.extract')}
                    </button>
                </div>
            </div>
        </div>
    )
}

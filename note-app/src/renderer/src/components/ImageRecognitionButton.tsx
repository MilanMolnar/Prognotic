import { cn } from '@renderer/utils'
import { JSX } from 'react'
import { LuImage, LuLoaderCircle } from 'react-icons/lu'

export type ImageRecognitionButtonProps = {
    isAvailable: boolean
    isRecognizing: boolean
    disabled?: boolean
    onClick: () => void
}

export const ImageRecognitionButton = ({
    isAvailable,
    isRecognizing,
    disabled = false,
    onClick
}: ImageRecognitionButtonProps): JSX.Element | null => {
    if (!isAvailable) return null

    return (
        <button
            data-tour="image-recognition"
            type="button"
            title="Extract text from an image"
            aria-haspopup="dialog"
            disabled={disabled || isRecognizing}
            onClick={onClick}
            className={cn(
                'rounded p-1.5 text-zinc-400 transition-colors duration-100 hover:bg-zinc-600/50 hover:text-zinc-200',
                (disabled || isRecognizing) && 'opacity-40 hover:bg-transparent'
            )}
        >
            {isRecognizing
                ? <LuLoaderCircle className="h-4 w-4 animate-spin" />
                : <LuImage className="h-4 w-4" />}
        </button>
    )
}

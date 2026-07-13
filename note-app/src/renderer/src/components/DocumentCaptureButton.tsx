import { cn } from '@renderer/utils'
import { JSX } from 'react'
import { LuFileUp, LuLoaderCircle } from 'react-icons/lu'

export type DocumentCaptureButtonProps = {
    isProcessing: boolean
    disabled?: boolean
    onClick: () => void
}

export const DocumentCaptureButton = ({
    isProcessing,
    disabled = false,
    onClick
}: DocumentCaptureButtonProps): JSX.Element => (
    <button
        data-tour="document-capture"
        type="button"
        title="Insert text from a document"
        aria-haspopup="dialog"
        disabled={disabled || isProcessing}
        onClick={onClick}
        className={cn(
            'rounded p-1.5 text-zinc-400 transition-colors duration-100 hover:bg-zinc-600/50 hover:text-zinc-200',
            (disabled || isProcessing) && 'opacity-40 hover:bg-transparent'
        )}
    >
        {isProcessing
            ? <LuLoaderCircle className="h-4 w-4 animate-spin" />
            : <LuFileUp className="h-4 w-4" />}
    </button>
)

import { cn } from '@renderer/utils'
import { JSX } from 'react'
import { LuMic, LuMicOff } from 'react-icons/lu'

export type DictationButtonProps = {
    isListening: boolean
    isAvailable: boolean
    disabled?: boolean
    title: string
    onClick: () => void
}

export const DictationButton = ({
    isListening,
    isAvailable,
    disabled = false,
    title,
    onClick
}: DictationButtonProps): JSX.Element => {
    const Icon = isListening ? LuMicOff : LuMic

    return (
        <button
            type="button"
            title={title}
            disabled={disabled || !isAvailable}
            onClick={onClick}
            className={cn(
                'relative rounded p-1.5 transition-colors duration-100',
                isListening
                    ? 'text-red-400 hover:bg-red-500/20'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-600/50',
                (disabled || !isAvailable) && 'opacity-40 hover:bg-transparent'
            )}
        >
            <Icon className="w-4 h-4" />
            {isListening && (
                <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
            )}
        </button>
    )
}

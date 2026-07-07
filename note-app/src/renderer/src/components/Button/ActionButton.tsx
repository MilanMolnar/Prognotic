import { ComponentProps, JSX } from "react"
import { twMerge } from "tailwind-merge"

export type ActionButtonProps = ComponentProps<'button'>

export const toolbarButtonClass =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-400/50 hover:bg-zinc-600/50 transition-colors duration-100'

export const ActionButton = ({className, children, ...props}: ActionButtonProps): JSX.Element => {
    return (
        <button className={twMerge(toolbarButtonClass, className)} {...props}>
            {children}
        </button>
    )
}

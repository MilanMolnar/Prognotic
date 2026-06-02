import { ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

const dateFromatter = new Intl.DateTimeFormat(window.context.locale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "CET",
})

export const formatDateFromMs = (ms: number) => {
    return dateFromatter.format(ms)
}


export const cn = (...args: ClassValue[]) => {
    return twMerge(clsx(args))
}
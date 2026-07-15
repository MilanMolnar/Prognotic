export const supportedUiLocales = ['en', 'hu'] as const

export type UiLocale = (typeof supportedUiLocales)[number]

export const normalizeUiLocale = (value: unknown): UiLocale => value === 'hu' ? 'hu' : 'en'

export const uiLocaleLanguageTag = (locale: UiLocale): string =>
    locale === 'hu' ? 'hu-HU' : 'en-US'

export const uiLocaleEnglishName = (locale: UiLocale): string =>
    locale === 'hu' ? 'Hungarian' : 'English'

export const uiLocaleNativeName = (locale: UiLocale): string =>
    locale === 'hu' ? 'Magyar' : 'English'

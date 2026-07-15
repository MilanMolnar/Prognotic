import { normalizeUiLocale, type UiLocale } from '@shared/locales'
import { en, type TranslationKey } from './en'
import { hu } from './hu'

export type TranslationParams = Record<string, string | number>
export type Translate = (key: TranslationKey, params?: TranslationParams) => string

const resources: Record<UiLocale, Record<TranslationKey, string>> = { en, hu }

export const translate = (
  locale: UiLocale,
  key: TranslationKey,
  params: TranslationParams = {}
): string => resources[normalizeUiLocale(locale)][key].replace(
  /\{(\w+)\}/g,
  (match, name: string) => name in params ? String(params[name]) : match
)

export const createTranslator = (locale: UiLocale): Translate =>
  (key, params) => translate(locale, key, params)

export type { TranslationKey }

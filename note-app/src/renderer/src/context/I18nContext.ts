import type { Translate } from '@renderer/i18n'
import type { UiLocale } from '@shared/locales'
import { createContext, useContext } from 'react'

export type I18nState = {
  locale: UiLocale
  languageTag: string
  t: Translate
  formatDateTime: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
}

export const I18nContext = createContext<I18nState | null>(null)

export const useI18n = (): I18nState => {
  const state = useContext(I18nContext)
  if (!state) throw new Error('useI18n must be used within an I18nProvider')
  return state
}

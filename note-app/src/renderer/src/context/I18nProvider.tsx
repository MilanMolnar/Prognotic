import { createTranslator } from '@renderer/i18n'
import { uiLocaleLanguageTag } from '@shared/locales'
import React, { useMemo } from 'react'
import { I18nContext, type I18nState } from './I18nContext'
import { useSettings } from './SettingsContext'

export const I18nProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
  const { settings } = useSettings()
  const value = useMemo<I18nState>(() => {
    const locale = settings.uiLocale
    const languageTag = uiLocaleLanguageTag(locale)
    const dateFormatters = new Map<string, Intl.DateTimeFormat>()
    const numberFormatters = new Map<string, Intl.NumberFormat>()

    return {
      locale,
      languageTag,
      t: createTranslator(locale),
      formatDateTime: (dateValue, options = { dateStyle: 'short', timeStyle: 'short' }) => {
        const cacheKey = JSON.stringify(options)
        let formatter = dateFormatters.get(cacheKey)
        if (!formatter) {
          formatter = new Intl.DateTimeFormat(languageTag, options)
          dateFormatters.set(cacheKey, formatter)
        }
        return formatter.format(dateValue)
      },
      formatNumber: (numberValue, options = {}) => {
        const cacheKey = JSON.stringify(options)
        let formatter = numberFormatters.get(cacheKey)
        if (!formatter) {
          formatter = new Intl.NumberFormat(languageTag, options)
          numberFormatters.set(cacheKey, formatter)
        }
        return formatter.format(numberValue)
      }
    }
  }, [settings.uiLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

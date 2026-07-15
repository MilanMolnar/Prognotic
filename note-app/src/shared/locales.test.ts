import { describe, expect, it } from 'vitest'
import {
    normalizeUiLocale,
    uiLocaleEnglishName,
    uiLocaleLanguageTag,
    uiLocaleNativeName
} from './locales'
import { defaultSettings } from './constants'

describe('UI locales', () => {
    it('defaults new and legacy settings to English', () => {
        expect(defaultSettings.uiLocale).toBe('en')
        expect(normalizeUiLocale(undefined)).toBe('en')
    })

    it('preserves supported stored values and clamps missing or unknown values to English', () => {
        expect(normalizeUiLocale('en')).toBe('en')
        expect(normalizeUiLocale('hu')).toBe('hu')
        expect(normalizeUiLocale('de')).toBe('en')
    })

    it('maps stable settings codes to formatter and language-hint values', () => {
        expect(uiLocaleLanguageTag('hu')).toBe('hu-HU')
        expect(uiLocaleEnglishName('hu')).toBe('Hungarian')
        expect(uiLocaleNativeName('hu')).toBe('Magyar')
    })
})

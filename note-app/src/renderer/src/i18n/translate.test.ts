import { describe, expect, it } from 'vitest'
import { translate } from './translate'

describe('translation resolution', () => {
  it('resolves Hungarian keys and interpolates named values', () => {
    expect(translate('hu', 'common.save')).toBe('Mentés')
    expect(translate('hu', 'block.dragAria', { label: 'Minta' })).toBe('Minta húzása')
  })
})

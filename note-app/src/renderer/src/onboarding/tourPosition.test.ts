import { describe, expect, it } from 'vitest'
import { computeBubblePosition } from './tourPosition'

describe('tour bubble placement', () => {
  it('flips away from a clipped preferred side', () => {
    const position = computeBubblePosition(
      { top: 200, right: 790, bottom: 240, left: 750, width: 40, height: 40 },
      { width: 300, height: 180 },
      'right',
      { width: 800, height: 600 }
    )
    expect(position.placement).toBe('left')
    expect(position.left).toBeGreaterThanOrEqual(12)
  })

  it('clamps oversized edge candidates inside viewport margins', () => {
    const position = computeBubblePosition(
      { top: 570, right: 420, bottom: 590, left: 380, width: 40, height: 20 },
      { width: 360, height: 220 },
      'bottom',
      { width: 800, height: 600 }
    )
    expect(position.placement).toBe('top')
    expect(position.top).toBeLessThanOrEqual(368)
    expect(position.left).toBeGreaterThanOrEqual(12)
  })
})


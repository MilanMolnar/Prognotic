import type { TourPlacement } from './types'

export type RectLike = {
  top: number
  right: number
  bottom: number
  left: number
  width: number
  height: number
}

export type ViewportSize = { width: number; height: number }
export type BubbleSize = { width: number; height: number }
export type BubblePosition = { top: number; left: number; placement: TourPlacement }

const viewportMargin = 12
const targetGap = 22

const oppositePlacement: Record<TourPlacement, TourPlacement> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left'
}

const candidatePosition = (
  target: RectLike,
  bubble: BubbleSize,
  placement: TourPlacement
): Omit<BubblePosition, 'placement'> => {
  if (placement === 'top') {
    return {
      top: target.top - bubble.height - targetGap,
      left: target.left + (target.width - bubble.width) / 2
    }
  }
  if (placement === 'bottom') {
    return {
      top: target.bottom + targetGap,
      left: target.left + (target.width - bubble.width) / 2
    }
  }
  if (placement === 'left') {
    return {
      top: target.top + (target.height - bubble.height) / 2,
      left: target.left - bubble.width - targetGap
    }
  }
  return {
    top: target.top + (target.height - bubble.height) / 2,
    left: target.right + targetGap
  }
}

const overflow = (
  position: Omit<BubblePosition, 'placement'>,
  bubble: BubbleSize,
  viewport: ViewportSize
): number =>
  Math.max(0, viewportMargin - position.left) +
  Math.max(0, position.left + bubble.width + viewportMargin - viewport.width) +
  Math.max(0, viewportMargin - position.top) +
  Math.max(0, position.top + bubble.height + viewportMargin - viewport.height)

export const computeBubblePosition = (
  target: RectLike,
  bubble: BubbleSize,
  preferred: TourPlacement,
  viewport: ViewportSize
): BubblePosition => {
  const perpendicular: TourPlacement[] = preferred === 'top' || preferred === 'bottom'
    ? ['right', 'left']
    : ['bottom', 'top']
  const placements = [preferred, oppositePlacement[preferred], ...perpendicular]
  const best = placements
    .map((placement) => ({ placement, ...candidatePosition(target, bubble, placement) }))
    .sort((a, b) => overflow(a, bubble, viewport) - overflow(b, bubble, viewport))[0]

  return {
    placement: best.placement,
    top: Math.min(
      Math.max(viewportMargin, best.top),
      Math.max(viewportMargin, viewport.height - bubble.height - viewportMargin)
    ),
    left: Math.min(
      Math.max(viewportMargin, best.left),
      Math.max(viewportMargin, viewport.width - bubble.width - viewportMargin)
    )
  }
}

export const centeredBubblePosition = (
  bubble: BubbleSize,
  viewport: ViewportSize,
  placement: TourPlacement
): BubblePosition => ({
  placement,
  top: Math.max(viewportMargin, (viewport.height - bubble.height) / 2),
  left: Math.max(viewportMargin, (viewport.width - bubble.width) / 2)
})


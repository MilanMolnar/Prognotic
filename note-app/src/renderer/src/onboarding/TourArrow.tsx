import { JSX } from 'react'
import type { RectLike } from './tourPosition'
import type { TourPlacement } from './types'

export type TourArrowProps = {
  bubbleRect: RectLike
  targetRect: RectLike
  placement: TourPlacement
}

export const TourArrow = ({ bubbleRect, targetRect, placement }: TourArrowProps): JSX.Element => {
  const start = placement === 'right'
    ? { x: bubbleRect.left, y: bubbleRect.top + bubbleRect.height / 2 }
    : placement === 'left'
      ? { x: bubbleRect.right, y: bubbleRect.top + bubbleRect.height / 2 }
      : placement === 'bottom'
        ? { x: bubbleRect.left + bubbleRect.width / 2, y: bubbleRect.top }
        : { x: bubbleRect.left + bubbleRect.width / 2, y: bubbleRect.bottom }
  const end = placement === 'right'
    ? { x: targetRect.right, y: targetRect.top + targetRect.height / 2 }
    : placement === 'left'
      ? { x: targetRect.left, y: targetRect.top + targetRect.height / 2 }
      : placement === 'bottom'
        ? { x: targetRect.left + targetRect.width / 2, y: targetRect.bottom }
        : { x: targetRect.left + targetRect.width / 2, y: targetRect.top }

  return (
    <svg className="pointer-events-none fixed inset-0 z-[6001] h-full w-full" aria-hidden>
      <defs>
        <marker id="tour-arrow-head" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="rgb(234 179 8)" />
        </marker>
      </defs>
      <path
        d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
        fill="none"
        stroke="rgb(234 179 8)"
        strokeWidth="2"
        strokeLinecap="round"
        markerEnd="url(#tour-arrow-head)"
      />
    </svg>
  )
}


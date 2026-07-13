import { RefObject, useLayoutEffect, useState } from 'react'
import {
  BubblePosition,
  centeredBubblePosition,
  computeBubblePosition,
  RectLike
} from './tourPosition'
import type { TourPlacement } from './types'

type TourAnchor = {
  targetRect: RectLike | null
  bubbleRect: RectLike
  position: BubblePosition
  targetFound: boolean
}

const defaultBubbleSize = { width: 360, height: 220 }

const rectFromDom = (rect: DOMRect): RectLike => ({
  top: rect.top,
  right: rect.right,
  bottom: rect.bottom,
  left: rect.left,
  width: rect.width,
  height: rect.height
})

const rectEquals = (a: RectLike | null, b: RectLike | null): boolean => {
  if (a === null || b === null) return a === b
  return Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.right - b.right) < 0.5 &&
    Math.abs(a.bottom - b.bottom) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
}

const visibleElementFor = (selectors: readonly string[]): HTMLElement | null => {
  for (const selector of selectors) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
        return element
      }
    }
  }
  return null
}

export const useTourAnchor = (
  selectors: readonly string[],
  preferredPlacement: TourPlacement,
  bubbleRef: RefObject<HTMLDivElement | null>
): TourAnchor => {
  const selectorsKey = selectors.join('\u0000')
  const [anchor, setAnchor] = useState<TourAnchor>(() => {
    const position = centeredBubblePosition(defaultBubbleSize, {
      width: window.innerWidth,
      height: window.innerHeight
    }, preferredPlacement)
    return {
      targetRect: null,
      bubbleRect: {
        ...defaultBubbleSize,
        ...position,
        right: position.left + defaultBubbleSize.width,
        bottom: position.top + defaultBubbleSize.height
      },
      position,
      targetFound: false
    }
  })

  useLayoutEffect(() => {
    let frame: number | null = null
    let target: HTMLElement | null = null
    let bubble: HTMLElement | null = null
    let hasRevealedTarget = false
    const resizeObserver = new ResizeObserver(() => scheduleMeasure())

    const measure = (): void => {
      frame = null
      const nextTarget = visibleElementFor(selectors)
      if (target !== nextTarget) {
        if (target) resizeObserver.unobserve(target)
        target = nextTarget
        hasRevealedTarget = false
        if (target) resizeObserver.observe(target)
      }
      const nextBubble = bubbleRef.current
      if (bubble !== nextBubble) {
        if (bubble) resizeObserver.unobserve(bubble)
        bubble = nextBubble
        if (bubble) resizeObserver.observe(bubble)
      }

      if (target && !hasRevealedTarget) {
        const targetRect = target.getBoundingClientRect()
        const isClipped = targetRect.top < 8 || targetRect.left < 8 ||
          targetRect.bottom > window.innerHeight - 8 || targetRect.right > window.innerWidth - 8
        if (isClipped) target.scrollIntoView({ block: 'center', inline: 'center' })
        hasRevealedTarget = true
      }

      const measuredBubble = bubbleRef.current?.getBoundingClientRect()
      const bubbleSize = measuredBubble && measuredBubble.width > 0 && measuredBubble.height > 0
        ? { width: measuredBubble.width, height: measuredBubble.height }
        : defaultBubbleSize
      const targetRect = target ? rectFromDom(target.getBoundingClientRect()) : null
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      const position = targetRect
        ? computeBubblePosition(targetRect, bubbleSize, preferredPlacement, viewport)
        : centeredBubblePosition(bubbleSize, viewport, preferredPlacement)
      const bubbleRect: RectLike = {
        top: position.top,
        left: position.left,
        width: bubbleSize.width,
        height: bubbleSize.height,
        right: position.left + bubbleSize.width,
        bottom: position.top + bubbleSize.height
      }

      setAnchor((previous) => {
        if (
          rectEquals(previous.targetRect, targetRect) &&
          rectEquals(previous.bubbleRect, bubbleRect) &&
          previous.position.placement === position.placement &&
          previous.targetFound === (target !== null)
        ) return previous
        return { targetRect, bubbleRect, position, targetFound: target !== null }
      })
    }

    const scheduleMeasure = (): void => {
      if (frame !== null) return
      frame = requestAnimationFrame(measure)
    }

    const mutationObserver = new MutationObserver(scheduleMeasure)
    mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true })
    window.addEventListener('resize', scheduleMeasure)
    window.addEventListener('scroll', scheduleMeasure, true)
    scheduleMeasure()

    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
      window.removeEventListener('scroll', scheduleMeasure, true)
    }
  }, [bubbleRef, preferredPlacement, selectors, selectorsKey])

  return anchor
}

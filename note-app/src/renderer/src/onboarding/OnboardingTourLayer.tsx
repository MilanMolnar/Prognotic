import { JSX, useMemo, useRef } from 'react'
import { useOnboarding } from '@renderer/context/OnboardingContext'
import { resolveTourTargetSelectors } from './tourLogic'
import { TourArrow } from './TourArrow'
import { TourBubble } from './TourBubble'
import { useTourAnchor } from './useTourAnchor'

export const OnboardingTourLayer = (): JSX.Element | null => {
  const { currentStep, runtime } = useOnboarding()
  const bubbleRef = useRef<HTMLDivElement>(null)
  const selectors = useMemo(
    () => currentStep ? resolveTourTargetSelectors(currentStep.target, runtime) : [],
    [currentStep, runtime]
  )
  const anchor = useTourAnchor(selectors, currentStep?.placement ?? 'right', bubbleRef)
  if (!currentStep) return null

  const padding = currentStep.highlight === false ? 0 : (currentStep.highlight ?? 5)
  const spotlight = anchor.targetRect && currentStep.highlight !== false
    ? {
        top: anchor.targetRect.top - padding,
        left: anchor.targetRect.left - padding,
        width: anchor.targetRect.width + padding * 2,
        height: anchor.targetRect.height + padding * 2
      }
    : null

  return (
    <>
      {spotlight ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[5999] rounded-md border border-yellow-500/70 shadow-[0_0_0_9999px_rgb(0_0_0_/_0.48)]"
          style={spotlight}
        />
      ) : (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[5999] bg-black/40" />
      )}
      {currentStep.arrow && anchor.targetRect && (
        <TourArrow
          bubbleRect={anchor.bubbleRect}
          targetRect={anchor.targetRect}
          placement={anchor.position.placement}
        />
      )}
      <TourBubble ref={bubbleRef} position={anchor.position} targetFound={anchor.targetFound} />
    </>
  )
}


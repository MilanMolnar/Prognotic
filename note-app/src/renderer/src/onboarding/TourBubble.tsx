import { cn } from '@renderer/utils'
import { forwardRef, JSX } from 'react'
import { useOnboarding, useOnboardingActions } from '@renderer/context/OnboardingContext'
import { useI18n } from '@renderer/context/I18nContext'
import { localizeTourChoice, localizeTourLink, localizeTourStep } from './tourTranslations'
import type { BubblePosition } from './tourPosition'

export type TourBubbleProps = {
  position: BubblePosition
  targetFound: boolean
}

const safeExternalLink = (href: string): boolean => {
  try {
    return new URL(href).protocol === 'https:'
  } catch {
    return false
  }
}

export const TourBubble = forwardRef<HTMLDivElement, TourBubbleProps>(
  ({ position, targetFound }, ref): JSX.Element | null => {
    const {
      currentStep,
      runtime,
      stepNumber,
      totalSteps,
      canGoBack,
      gateSatisfied,
      canContinueAnyway,
      persistenceError
    } = useOnboarding()
    const { nextStep, previousStep, continueAnyway, choose, skipTour } = useOnboardingActions()
    const { formatNumber, t } = useI18n()
    if (!currentStep) return null

    const localized = localizeTourStep(currentStep, runtime, t)
    const link = typeof currentStep.externalLink === 'function'
      ? currentStep.externalLink(runtime)
      : currentStep.externalLink
    const canUseNext = currentStep.advance === 'next' && gateSatisfied
    const isWaitingForTarget = currentStep.target !== undefined && !targetFound
    const gateHint = currentStep.advance === 'click-target'
      ? t('onboarding.useHighlighted')
      : currentStep.advance === 'event'
        ? t('onboarding.completeHighlighted')
        : currentStep.interactive && !gateSatisfied
          ? t('onboarding.completeStep')
          : null

    return (
      <div
        ref={ref}
        role="dialog"
        aria-modal="false"
        aria-label={localized.title || localized.section}
        className="fixed z-[6002] max-h-[calc(100vh-24px)] w-[min(360px,calc(100vw-24px))] overflow-y-auto rounded-md border border-yellow-500/60 bg-zinc-900 p-4 text-sm text-zinc-200 shadow-2xl"
        style={{ top: position.top, left: position.left }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-yellow-500/80">
              {localized.section} · {stepNumber ? formatNumber(stepNumber) : '–'}/{formatNumber(totalSteps)}
            </p>
            {localized.title && <h2 className="mt-1 font-semibold text-zinc-100">{localized.title}</h2>}
          </div>
          <button
            type="button"
            onClick={() => { void skipTour() }}
            className="shrink-0 text-xs text-zinc-500 hover:text-zinc-200"
          >
            {t('onboarding.skip')}
          </button>
        </div>
        <p className="mt-2 leading-relaxed text-zinc-300">{localized.body}</p>
        {isWaitingForTarget && (
          <p className="mt-2 text-xs text-zinc-500">{t('onboarding.waiting')}</p>
        )}
        {gateHint && <p className="mt-2 text-xs text-yellow-500/70">{gateHint}</p>}
        {link && safeExternalLink(link.href) && (
          <a
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex rounded-md border border-zinc-500/60 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700/70"
          >
            {localizeTourLink(runtime.selectedProvider, link.label, t)}
          </a>
        )}
        {persistenceError && <p className="mt-2 text-xs text-red-400" role="alert">{persistenceError}</p>}

        {currentStep.choices ? (
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {canGoBack && (
              <button type="button" onClick={previousStep} className="mr-auto rounded-md border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700">
                {t('common.back')}
              </button>
            )}
            {currentStep.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => choose(choice.id)}
                className={cn(
                  'rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                  choice.tone === 'primary'
                    ? 'border-yellow-500/60 text-yellow-200 hover:bg-yellow-500/15'
                    : 'border-zinc-600 text-zinc-300 hover:bg-zinc-700'
                )}
              >
                {localizeTourChoice(choice.id, choice.label, t)}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canGoBack}
              onClick={previousStep}
              className="rounded-md border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
            >
              {t('common.back')}
            </button>
            {currentStep.secondaryActions?.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => choose(action.id)}
                className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              >
                {localizeTourChoice(action.id, action.label, t)}
              </button>
            ))}
            <span className="min-w-0 flex-1" />
            {canContinueAnyway && (
              <button
                type="button"
                onClick={continueAnyway}
                className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                {t('onboarding.continueAnyway')}
              </button>
            )}
            <button
              type="button"
              disabled={!canUseNext}
              onClick={nextStep}
              className="rounded-md border border-yellow-500/60 px-2.5 py-1.5 text-xs text-yellow-200 hover:bg-yellow-500/15 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-600 disabled:hover:bg-transparent"
            >
              {localized.primaryLabel}
            </button>
          </div>
        )}
      </div>
    )
  }
)

TourBubble.displayName = 'TourBubble'

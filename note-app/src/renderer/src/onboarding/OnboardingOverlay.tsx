import { JSX } from 'react'
import { useOnboarding, useOnboardingActions } from '@renderer/context/OnboardingContext'
import { useI18n } from '@renderer/context'
import { OnboardingTourLayer } from './OnboardingTourLayer'

// App and nested modal layers currently stop at z-80. Onboarding owns the
// documented 5999–6002 range: dim/spotlight, arrow, then interactive bubble.
export const OnboardingOverlay = (): JSX.Element | null => {
  const { phase, currentStep, runtime, persistenceError } = useOnboarding()
  const { startTour, skipTour } = useOnboardingActions()
  const { t } = useI18n()

  if (phase === 'loading' || phase === 'hidden') return null

  if (phase === 'greeting') {
    return (
      <div className="fixed inset-0 z-[5999] flex items-center justify-center bg-black/65 p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="onboarding-welcome-title" className="w-full max-w-md rounded-md border border-yellow-500/60 bg-zinc-900 p-5 shadow-2xl">
          <p className="text-xs uppercase tracking-wider text-yellow-500/80">{t('onboarding.firstSteps')}</p>
          <h1 id="onboarding-welcome-title" className="mt-1 text-lg font-semibold text-zinc-100">{t('onboarding.welcomeTitle')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">{t('onboarding.welcomeBody')}</p>
          {persistenceError && <p className="mt-2 text-xs text-red-400" role="alert">{persistenceError}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => { void skipTour() }} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">{t('onboarding.skip')}</button>
            <button type="button" autoFocus onClick={startTour} className="rounded-md border border-yellow-500/60 px-3 py-1.5 text-sm text-yellow-200 hover:bg-yellow-500/15">{t('onboarding.start')}</button>
          </div>
        </div>
      </div>
    )
  }

  if (!currentStep || !runtime) return null
  return <OnboardingTourLayer />
}

import { useBlocks, useGoals, useI18n, useSettings } from '@renderer/context'
import { ReactNode, JSX, useEffect, useState } from 'react'

const minimumDisplayMs = 250
const fadeDurationMs = 200

export const LoadingSplash = ({ children }: { children: ReactNode }): JSX.Element => {
  const { isLoaded: settingsLoaded } = useSettings()
  const { goals } = useGoals()
  const { blocks } = useBlocks()
  const { t } = useI18n()
  const isReady = settingsLoaded && goals !== undefined && blocks !== undefined
  const [minimumDisplayElapsed, setMinimumDisplayElapsed] = useState(false)
  const [isFading, setIsFading] = useState(false)
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumDisplayElapsed(true), minimumDisplayMs)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!isReady || !minimumDisplayElapsed) return

    const fadeTimer = window.setTimeout(() => setIsFading(true), 0)
    const hideTimer = window.setTimeout(() => setIsVisible(false), fadeDurationMs)

    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(hideTimer)
    }
  }, [isReady, minimumDisplayElapsed])

  return (
    <>
      <div className="contents" inert={isVisible} aria-hidden={isVisible}>
        {children}
      </div>
      {isVisible && (
        // Onboarding owns z-5999 and above, so its greeting can replace the
        // splash as soon as startup data is ready without waiting for the fade.
        <div
          role="status"
          aria-label={t('splash.aria')}
          className={`fixed inset-0 z-[5998] flex items-center justify-center overflow-hidden bg-zinc-950 transition-opacity duration-200 ease-out ${isFading ? 'opacity-0' : 'opacity-100'}`}
        >
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgb(234_179_8_/_0.08),transparent_42%)]" />
          <div className="relative flex flex-col items-center">
            <div className="text-3xl font-bold tracking-[0.14em] text-zinc-100">
              <span className="text-yellow-500">P</span>rognotic
            </div>
            <div aria-hidden className="mt-5 h-px w-44 overflow-hidden bg-zinc-800">
              <span className="block h-full w-14 bg-yellow-500/80 animate-[startup-loading_1.4s_ease-in-out_infinite]" />
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-zinc-500">{t('splash.loadingNotes')}</p>
          </div>
        </div>
      )}
    </>
  )
}

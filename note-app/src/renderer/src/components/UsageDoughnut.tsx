import { useI18n } from '@renderer/context'
import { formatEstimatedUsd } from '@renderer/utils'
import { calculateLlmUsageDisplayPercentage, calculateLlmUsagePercentage, selectLlmUsageThresholdLevel } from '@shared/llmUsage'
import { LlmUsageThresholds } from '@shared/models'
import { JSX } from 'react'
import { LuCircleAlert } from 'react-icons/lu'

export type UsageDoughnutProps = {
  usedUsd: number
  limitUsd: number
  thresholds: LlmUsageThresholds
  onClick: () => void
}

const levelClass = {
  gray: 'text-zinc-400',
  yellow: 'text-yellow-400',
  red: 'text-red-400',
  critical: 'text-red-700'
} as const

export const UsageDoughnut = ({ usedUsd, limitUsd, thresholds, onClick }: UsageDoughnutProps): JSX.Element => {
  const { t } = useI18n()
  const percentage = calculateLlmUsagePercentage(usedUsd, limitUsd)
  const displayedPercentage = calculateLlmUsageDisplayPercentage(usedUsd, limitUsd)
  const level = selectLlmUsageThresholdLevel(percentage, thresholds)
  const radius = 10
  const circumference = 2 * Math.PI * radius
  const label = t('assistant.usageBudgetLabel', {
    used: formatEstimatedUsd(usedUsd),
    limit: formatEstimatedUsd(limitUsd),
    percent: Math.round(percentage)
  })

  return <button
    type="button"
    onClick={onClick}
    title={label}
    aria-label={label}
    className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-yellow-400"
  >
    <svg viewBox="0 0 28 28" aria-hidden="true" className={`h-7 w-7 -rotate-90 ${levelClass[level]}`}>
      <circle cx="14" cy="14" r={radius} fill="none" strokeWidth="3" className="stroke-zinc-700" />
      <circle
        cx="14"
        cy="14"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - displayedPercentage / 100)}
      />
    </svg>
    {level === 'critical' && <LuCircleAlert aria-hidden="true" className="absolute h-3.5 w-3.5 text-red-300" />}
  </button>
}

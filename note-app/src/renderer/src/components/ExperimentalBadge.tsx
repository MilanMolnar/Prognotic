import { JSX } from 'react'
import { useI18n } from '@renderer/context'

export const ExperimentalBadge = (): JSX.Element => {
  const { t } = useI18n()
  return (
    <span className="shrink-0 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-[9px] font-medium normal-case leading-none tracking-normal text-yellow-400/80">
      {t('common.experimental')}
    </span>
  )
}

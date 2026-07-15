import { JSX, useEffect, useId } from 'react'
import { useI18n } from '@renderer/context'

export type SettingInfoModalProps = {
  title: string
  body: string
  onClose: () => void
}

export const SettingInfoModal = ({ title, body, onClose }: SettingInfoModalProps): JSX.Element => {
  const { t } = useI18n()
  const titleId = useId()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return <div
    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
    onClick={(event) => { event.stopPropagation(); onClose() }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
      onClick={(event) => event.stopPropagation()}
    >
      <h2 id={titleId} className="font-bold text-zinc-100">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-zinc-300">{body}</p>
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onClose} className="rounded-md border border-zinc-500/50 px-2 py-1 text-sm text-zinc-200 hover:bg-zinc-700">{t('common.close')}</button>
      </div>
    </div>
  </div>
}

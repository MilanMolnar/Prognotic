import { JSX } from 'react'
import { LuX } from 'react-icons/lu'
import { useI18n } from '@renderer/context'

export type BlockMoveDialogProps = {
  targetLabel: string
  wasAlreadyInTarget: boolean
  isMoving: boolean
  onCopyOnly: () => void
  onMove: () => void
  onClose: () => void
}

export const BlockMoveDialog = ({
  targetLabel,
  wasAlreadyInTarget,
  isMoving,
  onCopyOnly,
  onMove,
  onClose
}: BlockMoveDialogProps): JSX.Element => {
  const { t } = useI18n()
  return (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={() => { if (!isMoving) onClose() }}>
    <div
      data-tour="block-move-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="block-move-dialog-title"
      className="relative w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        title={t('common.close')}
        aria-label={t('block.closeMoveDialog')}
        disabled={isMoving}
        onClick={onClose}
        className="absolute right-2 top-2 rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-40"
      >
        <LuX className="h-4 w-4" />
      </button>
      <h2 id="block-move-dialog-title" className="pr-8 font-bold">{t('block.moveQuestion', { goal: targetLabel })}</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        {wasAlreadyInTarget
          ? t('block.moveAlready', { goal: targetLabel })
          : t('block.moveCopied', { goal: targetLabel })}
        {' '}{t('block.moveClosing')}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          data-tour="block-copy-only"
          type="button"
          disabled={isMoving}
          onClick={onCopyOnly}
          className="rounded-md border border-zinc-500/50 px-2 py-1 text-sm hover:bg-zinc-700 disabled:opacity-40"
        >
          {t('block.copyOnly')}
        </button>
        <button
          data-tour="block-move"
          type="button"
          disabled={isMoving}
          onClick={onMove}
          className="rounded-md border border-yellow-500/50 px-2 py-1 text-sm text-yellow-300 hover:bg-yellow-500/15 disabled:opacity-40"
        >
          {isMoving ? t('block.moving') : t('common.move')}
        </button>
        <button
          type="button"
          disabled={isMoving}
          onClick={onClose}
          className="rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-700 disabled:opacity-40"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  </div>
  )
}

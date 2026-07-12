import { JSX } from 'react'
import { LuX } from 'react-icons/lu'

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
}: BlockMoveDialogProps): JSX.Element => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={() => { if (!isMoving) onClose() }}>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="block-move-dialog-title"
      className="relative w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        title="Close"
        aria-label="Close move dialog"
        disabled={isMoving}
        onClick={onClose}
        className="absolute right-2 top-2 rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-40"
      >
        <LuX className="h-4 w-4" />
      </button>
      <h2 id="block-move-dialog-title" className="pr-8 font-bold">Move note to {targetLabel}?</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        {wasAlreadyInTarget
          ? `This note already belongs to ${targetLabel}. You can keep its other goals or move it here exclusively.`
          : `The note was copied to ${targetLabel}. You can keep its existing goals or move it here exclusively.`}
        {' '}Closing this dialog keeps the copy.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          disabled={isMoving}
          onClick={onCopyOnly}
          className="rounded-md border border-zinc-500/50 px-2 py-1 text-sm hover:bg-zinc-700 disabled:opacity-40"
        >
          Copy only
        </button>
        <button
          type="button"
          disabled={isMoving}
          onClick={onMove}
          className="rounded-md border border-yellow-500/50 px-2 py-1 text-sm text-yellow-300 hover:bg-yellow-500/15 disabled:opacity-40"
        >
          {isMoving ? 'Moving...' : 'Move'}
        </button>
        <button
          type="button"
          disabled={isMoving}
          onClick={onClose}
          className="rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-700 disabled:opacity-40"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)

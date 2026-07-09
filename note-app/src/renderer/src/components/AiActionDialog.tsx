import { JSX } from 'react'

export type AiActionDialogProps = {
  title: string
  result: string
  onClose: () => void
  onReplace: () => void
  onContinue: () => void
}

export const AiActionDialog = ({ title, result, onClose, onReplace, onContinue }: AiActionDialogProps): JSX.Element => <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
  <div className="w-full max-w-xl rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
    <h2 className="font-bold">{title}</h2>
    <div className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded border border-white/10 bg-black/20 p-3 text-sm text-zinc-200">{result}</div>
    <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => void navigator.clipboard.writeText(result)} className="rounded-md border border-zinc-500/50 px-2 py-1 text-sm hover:bg-zinc-700">Copy</button><button type="button" onClick={onReplace} className="rounded-md border border-yellow-500/50 px-2 py-1 text-sm hover:bg-yellow-500/15">Replace note</button><button type="button" onClick={onContinue} className="rounded-md border border-zinc-500/50 px-2 py-1 text-sm hover:bg-zinc-700">Continue in chat</button><button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-700">Close</button></div>
  </div>
</div>

import { useGoalActions } from '@renderer/context'
import { Goal } from '@shared/models'
import { JSX, useEffect, useState } from 'react'

export type GoalDialogProps = {
  onClose: () => void
  goal?: Goal
  mode?: 'rename' | 'description'
}

export const GoalDialog = ({ onClose, goal, mode = 'rename' }: GoalDialogProps): JSX.Element => {
  const { createGoal, renameGoal } = useGoalActions()
  const [name, setName] = useState(goal?.name ?? '')
  const [description, setDescription] = useState(goal?.description ?? '')
  const [routingHints, setRoutingHints] = useState(goal?.routingHints ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleConfirm = async (): Promise<void> => {
    const trimmedName = name.trim()
    if (!trimmedName || isSubmitting) return

    setIsSubmitting(true)
    try {
      if (goal) await renameGoal(goal.id, trimmedName, description.trim(), routingHints.trim())
      else await createGoal(trimmedName, description.trim(), routingHints.trim())
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-96 rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-4 font-bold">{mode === 'description' ? 'Edit Goal Description' : goal ? 'Rename Goal' : 'New Goal'}</h2>
        {mode !== 'description' && <label className="block text-sm text-zinc-300">
          Name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Work, Gym, Game Dev"
            autoFocus
            className="mt-1 w-full rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500 placeholder:text-zinc-600 focus:border-zinc-300/50"
          />
        </label>}
        <label className="mt-3 block text-sm text-zinc-300">
          Goal description
          <textarea
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe this goal thoroughly — the description will guide automatic sorting of your notes."
            className="mt-1 w-full resize-none rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500 placeholder:text-zinc-600 focus:border-zinc-300/50"
          />
        </label>
        <label className="mt-3 block text-sm text-zinc-300">
          Routing examples or keywords
          <textarea
            rows={3}
            value={routingHints}
            onChange={(event) => setRoutingHints(event.target.value)}
            placeholder="Examples: sprint planning, customer feedback, quarterly report"
            className="mt-1 w-full resize-none rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500 placeholder:text-zinc-600 focus:border-zinc-300/50"
          />
          <span className="mt-1 block text-xs text-zinc-500">Used with the goal description when AI suggests a destination.</span>
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-2 py-1 rounded-md border border-zinc-400/50 hover:bg-zinc-600/50 transition-colors duration-100 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={isSubmitting || name.trim().length === 0}
            className="px-2 py-1 rounded-md border border-yellow-500/50 hover:bg-yellow-500/20 transition-colors duration-100 text-sm disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

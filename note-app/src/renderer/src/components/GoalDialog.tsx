import { useGoalActions, useI18n } from '@renderer/context'
import { Goal } from '@shared/models'
import { JSX, useEffect, useState } from 'react'
import { onboardingEvents } from '@renderer/onboarding/events'

export type GoalDialogProps = {
  onClose: () => void
  goal?: Goal
  mode?: 'rename' | 'description'
}

export const GoalDialog = ({ onClose, goal, mode = 'rename' }: GoalDialogProps): JSX.Element => {
  const { createGoal, renameGoal } = useGoalActions()
  const { t } = useI18n()
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

  useEffect(() => {
    window.addEventListener(onboardingEvents.closeGoalDialog, onClose)
    return () => window.removeEventListener(onboardingEvents.closeGoalDialog, onClose)
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
        data-tour="goal-dialog"
        className="w-96 rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-4 font-bold">{mode === 'description' ? t('goal.descriptionTitle') : goal ? t('goal.renameTitle') : t('goal.newTitle')}</h2>
        {mode !== 'description' && <label className="block text-sm text-zinc-300">
          {t('goal.name')}
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('goal.namePlaceholder')}
            autoFocus
            className="mt-1 w-full rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500 placeholder:text-zinc-600 focus:border-zinc-300/50"
          />
        </label>}
        <label className="mt-3 block text-sm text-zinc-300">
          {t('goal.description')}
          <textarea
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('goal.descriptionPlaceholder')}
            className="mt-1 w-full resize-none rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500 placeholder:text-zinc-600 focus:border-zinc-300/50"
          />
        </label>
        <label className="mt-3 block text-sm text-zinc-300">
          {t('goal.routingHints')}
          <textarea
            rows={3}
            value={routingHints}
            onChange={(event) => setRoutingHints(event.target.value)}
            placeholder={t('goal.routingPlaceholder')}
            className="mt-1 w-full resize-none rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500 placeholder:text-zinc-600 focus:border-zinc-300/50"
          />
          <span className="mt-1 block text-xs text-zinc-500">{t('goal.routingHintHelp')}</span>
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-2 py-1 rounded-md border border-zinc-400/50 hover:bg-zinc-600/50 transition-colors duration-100 text-sm"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={isSubmitting || name.trim().length === 0}
            className="px-2 py-1 rounded-md border border-yellow-500/50 hover:bg-yellow-500/20 transition-colors duration-100 text-sm disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

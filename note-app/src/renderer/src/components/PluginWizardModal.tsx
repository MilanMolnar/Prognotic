import { usePluginActions } from '@renderer/context'
import { cn } from '@renderer/utils'
import type {
  PluginWizardAnswer,
  PluginWizardInterviewResult,
  PluginWizardSpec
} from '@shared/plugins'
import { FormEvent, JSX, useEffect, useState } from 'react'
import { LuArrowLeft, LuCheck, LuSparkles, LuX } from 'react-icons/lu'

export type PluginWizardModalProps = { onClose: () => void }

type ReadyPlan = Extract<PluginWizardInterviewResult, { status: 'ready_to_generate' }>

export const PluginWizardModal = ({ onClose }: PluginWizardModalProps): JSX.Element => {
  const { interviewPluginWizard, createGeneratedPlugin } = usePluginActions()
  const [goal, setGoal] = useState('')
  const [answers, setAnswers] = useState<PluginWizardAnswer[]>([])
  const [question, setQuestion] = useState<string | null>(null)
  const [answerDraft, setAnswerDraft] = useState('')
  const [guidance, setGuidance] = useState<string | null>(null)
  const [plan, setPlan] = useState<ReadyPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ pluginId: string; folderName: string } | null>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [busy, onClose])

  const applyInterviewResult = (result: PluginWizardInterviewResult): void => {
    if (result.status === 'error') {
      setError(result.error)
      return
    }
    setError(null)
    if (result.status === 'question') {
      setQuestion(result.question)
      setGuidance(result.guidance ?? null)
      setAnswerDraft('')
      return
    }
    setQuestion(null)
    setGuidance(null)
    setPlan(result)
  }

  const runInterview = async (
    nextAnswers: PluginWizardAnswer[]
  ): Promise<PluginWizardInterviewResult> => {
    setBusy(true)
    setError(null)
    try {
      const result = await interviewPluginWizard({ goal: goal.trim(), answers: nextAnswers })
      applyInterviewResult(result)
      return result
    } finally {
      setBusy(false)
    }
  }

  const beginInterview = (event: FormEvent): void => {
    event.preventDefault()
    if (!goal.trim() || busy) return
    setAnswers([])
    setPlan(null)
    void runInterview([])
  }

  const submitAnswer = (event: FormEvent): void => {
    event.preventDefault()
    if (!question || !answerDraft.trim() || busy) return
    const nextAnswers = [...answers, { question, answer: answerDraft.trim() }]
    setAnswers(nextAnswers)
    void runInterview(nextAnswers).then((result) => {
      if (result.status === 'error') setAnswers(answers)
    })
  }

  const createPlugin = async (spec: PluginWizardSpec, revision?: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await createGeneratedPlugin(spec, revision)
      if (result.error) {
        setError(result.error)
        return
      }
      if (!result.pluginId || !result.folderName) {
        setError('The plugin was created but its identity was not returned.')
        return
      }
      setCreated({ pluginId: result.pluginId, folderName: result.folderName })
    } finally {
      setBusy(false)
    }
  }

  const restartPlan = (): void => {
    setPlan(null)
    setQuestion(null)
    setAnswers([])
    setGuidance(null)
    setError(null)
  }

  const title = created
    ? 'Plugin created'
    : plan
      ? 'Confirm plugin plan'
      : question
        ? 'Design your plugin'
        : 'Create a plugin with AI'

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plugin-wizard-title"
      onClick={(event) => {
        event.stopPropagation()
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-violet-500/20 bg-zinc-900 shadow-2xl">
        <div className="flex items-start gap-3 border-b border-white/10 p-4">
          <span className="mt-0.5 rounded-md border border-violet-500/30 bg-violet-500/10 p-2 text-violet-300">
            <LuSparkles className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="plugin-wizard-title" className="font-semibold text-zinc-100">{title}</h2>
            <p className="mt-1 text-xs text-zinc-500">
              The wizard stays within Prognotic plugin v1 and leaves the new plugin disabled for review.
            </p>
          </div>
          <button type="button" title="Close AI plugin wizard" disabled={busy} onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-40">
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!question && !plan && !created && (
            <form onSubmit={beginInterview}>
              <label htmlFor="plugin-wizard-goal" className="text-sm font-medium text-zinc-200">What should the plugin help you do?</label>
              <textarea
                id="plugin-wizard-goal"
                autoFocus
                disabled={busy}
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                rows={6}
                maxLength={4_000}
                placeholder="Example: Track gym exercises, sets, reps, and weight; show recent sessions and let AI analyze one workout for progress patterns."
                className="no-drag mt-2 w-full resize-y rounded-md border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 outline-none caret-violet-400 placeholder:text-zinc-600 focus:border-violet-500/50"
              />
              <p className="mt-2 text-xs text-zinc-600">The agent asks only about decisions that change the manifest or command code.</p>
              <div className="mt-4 flex justify-end">
                <button type="submit" disabled={!goal.trim() || busy} className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/40 px-3 py-2 text-sm text-violet-300 hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-40">
                  <LuSparkles className={cn('h-4 w-4', busy && 'animate-pulse')} />
                  {busy ? 'Planning...' : 'Start interview'}
                </button>
              </div>
            </form>
          )}

          {question && !plan && !created && (
            <div>
              <div className="space-y-3">
                <div className="rounded-md border border-white/10 bg-zinc-950/40 p-3 text-sm text-zinc-400">
                  <span className="text-xs uppercase tracking-wide text-zinc-600">Your goal</span>
                  <p className="mt-1 whitespace-pre-wrap">{goal}</p>
                </div>
                {answers.map((item, index) => (
                  <div key={`${item.question}:${index}`} className="space-y-1 text-sm">
                    <p className="text-zinc-500">{item.question}</p>
                    <p className="rounded-md bg-violet-500/10 px-3 py-2 text-zinc-200">{item.answer}</p>
                  </div>
                ))}
              </div>

              {guidance && <p className="mt-4 rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-yellow-200/80" role="note">{guidance}</p>}

              <form className="mt-4" onSubmit={submitAnswer}>
                <label htmlFor="plugin-wizard-answer" className="text-sm font-medium text-zinc-100">{question}</label>
                <textarea
                  id="plugin-wizard-answer"
                  autoFocus
                  disabled={busy}
                  value={answerDraft}
                  onChange={(event) => setAnswerDraft(event.target.value)}
                  rows={3}
                  maxLength={2_000}
                  className="no-drag mt-2 w-full resize-y rounded-md border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 outline-none caret-violet-400 focus:border-violet-500/50"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-600">Question {answers.length + 1}; normally up to 8</span>
                  <button type="submit" disabled={!answerDraft.trim() || busy} className="rounded-md border border-violet-500/40 px-3 py-1.5 text-sm text-violet-300 hover:bg-violet-500/10 disabled:opacity-40">
                    {busy ? 'Thinking...' : 'Continue'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {plan && !created && (
            <div>
              <p className="text-sm text-zinc-300">Review the exact v1 plan before the wizard writes <code className="text-violet-300">plugin.json</code> and <code className="text-violet-300">index.cjs</code>.</p>
              <ul className="mt-3 space-y-2">
                {plan.summary.map((item) => (
                  <li key={item} className="flex gap-2 rounded-md border border-white/10 bg-zinc-950/30 p-2.5 text-sm text-zinc-300">
                    <LuCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-400" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {plan.constraints.length > 0 && (
                <div className="mt-3 rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-yellow-400/80">v1 reframing</p>
                  {plan.constraints.map((constraint) => <p key={constraint} className="mt-1 text-xs text-yellow-100/70">{constraint}</p>)}
                </div>
              )}
            </div>
          )}

          {created && (
            <div className="rounded-md border border-green-500/20 bg-green-500/5 p-4">
              <div className="flex items-center gap-2 text-green-300">
                <LuCheck className="h-5 w-5" aria-hidden />
                <p className="font-medium">Ready in the plugin manager</p>
              </div>
              <p className="mt-2 text-sm text-zinc-300">Created <code>{created.folderName}</code> with id <code>{created.pluginId}</code>. It is disabled until you enable it in the manager.</p>
            </div>
          )}

          {error && <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300" role="alert">{error}</p>}
        </div>

        {(plan || created) && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 p-4">
            {created ? (
              <button type="button" onClick={onClose} className="rounded-md border border-green-500/40 px-3 py-1.5 text-sm text-green-300 hover:bg-green-500/10">Done</button>
            ) : (
              <>
                <button type="button" disabled={busy} onClick={restartPlan} className="mr-auto inline-flex items-center gap-1 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 disabled:opacity-40">
                  <LuArrowLeft className="h-4 w-4" /> Edit goal
                </button>
                {error && (
                  <button type="button" disabled={busy} onClick={() => { if (plan) void createPlugin(plan.spec, error) }} className="rounded-md border border-violet-500/40 px-3 py-1.5 text-sm text-violet-300 hover:bg-violet-500/10 disabled:opacity-40">
                    {busy ? 'Revising...' : 'Revise with AI'}
                  </button>
                )}
                <button type="button" disabled={busy} onClick={() => { if (plan) void createPlugin(plan.spec) }} className="inline-flex items-center gap-1.5 rounded-md border border-yellow-500/50 px-3 py-1.5 text-sm text-yellow-300 hover:bg-yellow-500/10 disabled:opacity-40">
                  <LuSparkles className={cn('h-4 w-4', busy && 'animate-pulse')} />
                  {busy ? 'Generating and validating...' : 'Confirm and create'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

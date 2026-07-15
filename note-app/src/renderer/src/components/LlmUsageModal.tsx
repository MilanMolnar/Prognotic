import { JSX, useEffect, useId } from 'react'
import { useI18n } from '@renderer/context'
import { formatEstimatedUsd } from '@renderer/utils'
import { LlmUsageSummary } from '@shared/llmUsage'
import { LlmProvider } from '@shared/models'

export type LlmUsageModalProps = {
  summary: LlmUsageSummary
  onClose: () => void
}

const providerLabels: Record<LlmProvider, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Claude',
  local: 'LM Studio'
}

export const LlmUsageModal = ({ summary, onClose }: LlmUsageModalProps): JSX.Element => {
  const { formatNumber, t } = useI18n()
  const titleId = useId()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const totalInputTokens = summary.buckets.reduce((sum, bucket) => sum + bucket.inputTokens, 0)
  const totalOutputTokens = summary.buckets.reduce((sum, bucket) => sum + bucket.outputTokens, 0)

  return <div
    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
    onClick={(event) => { event.stopPropagation(); onClose() }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
      onClick={(event) => event.stopPropagation()}
    >
      <h2 id={titleId} className="font-bold text-zinc-100">{t('settings.aiUsageTitle')}</h2>
      <p className="mt-1 text-xs text-zinc-500">{t('settings.aiUsageEstimate')}</p>
      {summary.buckets.length === 0
        ? <p className="mt-4 text-sm text-zinc-400">{t('settings.aiUsageEmpty')}</p>
        : <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-xs text-zinc-500">
                  <th className="py-1.5 pr-3 text-left font-medium">{t('settings.aiUsageProvider')}</th>
                  <th className="py-1.5 pr-3 text-left font-medium">{t('settings.aiUsageModel')}</th>
                  <th className="py-1.5 pr-3 text-right font-medium">{t('settings.aiUsageInputTokens')}</th>
                  <th className="py-1.5 pr-3 text-right font-medium">{t('settings.aiUsageOutputTokens')}</th>
                  <th className="py-1.5 text-right font-medium">{t('settings.aiUsageCost')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.buckets.map((bucket) => <tr key={`${bucket.provider}:${bucket.model}`} className="border-b border-white/5 text-zinc-300">
                  <td className="py-1.5 pr-3">{providerLabels[bucket.provider]}</td>
                  <td className="max-w-56 truncate py-1.5 pr-3" title={bucket.model}>{bucket.model}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(bucket.inputTokens)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(bucket.outputTokens)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatEstimatedUsd(bucket.estimatedUsd)}</td>
                </tr>)}
              </tbody>
              <tfoot>
                <tr className="font-medium text-zinc-100">
                  <td className="py-2 pr-3" colSpan={2}>{t('settings.aiUsageTotal')}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatNumber(totalInputTokens)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatNumber(totalOutputTokens)}</td>
                  <td className="py-2 text-right tabular-nums">{formatEstimatedUsd(summary.totalEstimatedUsd)}</td>
                </tr>
              </tfoot>
            </table>
          </div>}
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onClose} className="rounded-md border border-zinc-500/50 px-2 py-1 text-sm text-zinc-200 hover:bg-zinc-700">{t('common.close')}</button>
      </div>
    </div>
  </div>
}

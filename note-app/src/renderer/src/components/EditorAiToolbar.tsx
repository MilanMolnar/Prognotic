import { MDXEditorMethods } from '@mdxeditor/editor'
import { useAssistantActions, useI18n } from '@renderer/context'
import { RefObject, JSX, useCallback, useEffect, useState } from 'react'
import { LuLanguages, LuLightbulb } from 'react-icons/lu'
import { AiActionDialog } from './AiActionDialog'

export type EditorAiToolbarProps = {
  blockId: string
  editorRef: RefObject<MDXEditorMethods | null>
  onSelectionReplaced: () => void
}

export const EditorAiToolbar = ({ blockId, editorRef, onSelectionReplaced }: EditorAiToolbarProps): JSX.Element => {
  const { continueWithText } = useAssistantActions()
  const { t } = useI18n()
  const [hasSelection, setHasSelection] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [failure, setFailure] = useState<{ action: 'translate' | 'explain'; message: string } | null>(null)
  const [result, setResult] = useState<{ action: 'translate' | 'explain'; text: string } | null>(null)

  const refreshSelection = useCallback((): void => {
    setHasSelection((editorRef.current?.getSelectionMarkdown().trim().length ?? 0) > 0)
  }, [editorRef])

  useEffect(() => {
    document.addEventListener('selectionchange', refreshSelection)
    return () => document.removeEventListener('selectionchange', refreshSelection)
  }, [refreshSelection])

  const run = async (action: 'translate' | 'explain'): Promise<void> => {
    const selection = editorRef.current?.getSelectionMarkdown().trim() ?? ''
    if (!selection) {
      setFailure({ action, message: t('ai.selectTextFirst') })
      return
    }

    setFailure(null)
    setIsRunning(true)
    try {
      const response = await window.context.runInlineAction(action, selection, blockId)
      if ('error' in response) {
        setFailure({ action, message: response.error ?? t('ai.actionFailed') })
        return
      }
      setResult({ action, text: response.text })
    } catch (error) {
      setFailure({ action, message: error instanceof Error ? error.message : t('ai.actionFailed') })
    } finally {
      setIsRunning(false)
    }
  }

  const replaceSelection = (): void => {
    if (!result) return
    editorRef.current?.insertMarkdown(result.text)
    window.setTimeout(onSelectionReplaced, 0)
    setResult(null)
  }

  const actionButtonClass = 'flex items-center gap-1 rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-300 hover:border-yellow-500/50 hover:text-yellow-400 disabled:opacity-40'

  return <>
    <div className="flex min-h-9 items-center gap-2 border-b border-white/10 px-4 py-1.5">
      <span className="text-xs text-zinc-500">{t('common.selectedText')}</span>
      <button type="button" disabled={!hasSelection || isRunning} onMouseDown={(event) => event.preventDefault()} onClick={() => { void run('translate') }} className={actionButtonClass}><LuLanguages className="h-3.5 w-3.5" />{t('common.translate')}</button>
      <button type="button" disabled={!hasSelection || isRunning} onMouseDown={(event) => event.preventDefault()} onClick={() => { void run('explain') }} className={actionButtonClass}><LuLightbulb className="h-3.5 w-3.5" />{t('common.explain')}</button>
      {isRunning && <span className="text-xs text-zinc-500" role="status">{t('common.running')}</span>}
      {failure && <span className="min-w-0 flex-1 truncate text-xs text-red-400" role="alert">{failure.message}</span>}
      {failure && <button type="button" disabled={isRunning || !hasSelection} onMouseDown={(event) => event.preventDefault()} onClick={() => { void run(failure.action) }} className="rounded border border-red-400/40 px-1.5 py-0.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40">{t('common.retry')}</button>}
    </div>
    {result && <AiActionDialog
      title={result.action === 'translate' ? t('ai.selectionTranslation') : t('ai.selectionExplanation')}
      result={result.text}
      replaceLabel={t('ai.replaceSelection')}
      preserveSelectionOnReplace
      onClose={() => setResult(null)}
      onReplace={replaceSelection}
      onContinue={() => { continueWithText(result.text); setResult(null) }}
    />}
  </>
}

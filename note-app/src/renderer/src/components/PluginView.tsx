import { useI18n, usePluginActions, usePlugins } from '@renderer/context'
import { cn } from '@renderer/utils'
import { isBlockUnvisitedInGoal } from '@shared/goalPresence'
import {
  pluginEntryFor,
  pluginUiLayout,
  type PluginActionElement,
  type PluginBlockRecord,
  type PluginCapture,
  type PluginCommandInput,
  type PluginEntryElement,
  type PluginGroupedListElement,
  type PluginListElement,
  type PluginNotificationTone,
  type PluginStatDefinition,
  type PluginUiLayoutElement,
  type PluginViewAction
} from '@shared/plugins'
import { ComponentProps, JSX, useEffect, useState } from 'react'
import { LuCheck, LuPencil, LuSparkles, LuTrash2, LuX } from 'react-icons/lu'

export type PluginViewProps = ComponentProps<'div'> & { pluginId: string }

const actionClasses = (action: PluginViewAction): string => cn(
  'inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40',
  action.tone === 'ai'
    ? 'border-violet-500/40 text-violet-300 hover:bg-violet-500/10'
    : action.tone === 'review'
      ? 'border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10'
      : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
)

export const PluginView = ({ pluginId, className, ...props }: PluginViewProps): JSX.Element => {
  const { plugins, blocksByPlugin, loadingPluginIds, error } = usePlugins()
  const { refreshPluginBlocks, runPluginCommand } = usePluginActions()
  const { formatDateTime, formatNumber, t } = useI18n()
  const [captureText, setCaptureText] = useState('')
  const [editing, setEditing] = useState<{ blockId: string; content: string } | null>(null)
  const [runningKey, setRunningKey] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ message: string; tone: PluginNotificationTone } | null>(null)
  const defaultStats: PluginStatDefinition[] = [
    { key: 'today', label: t('plugin.stat.today') },
    { key: 'unvisited', label: t('plugin.stat.review') },
    { key: 'total', label: t('plugin.stat.total') }
  ]

  const plugin = plugins?.find((candidate) => candidate.id === pluginId)
  const records = blocksByPlugin[pluginId]
  const isLoading = loadingPluginIds.has(pluginId)

  useEffect(() => {
    setEditing(null)
    setNotice(null)
    void refreshPluginBlocks(pluginId)
  }, [pluginId, refreshPluginBlocks])

  const run = async (
    command: string,
    input: PluginCommandInput,
    key: string
  ): Promise<boolean> => {
    setRunningKey(key)
    setNotice(null)
    try {
      const result = await runPluginCommand(pluginId, command, input)
      if (!result.ok) {
        setNotice({ message: result.error, tone: 'error' })
        return false
      }
      const notification = result.notifications?.at(-1)
      setNotice(notification ?? {
        message: result.value?.message ?? t('plugin.actionCompleted'),
        tone: 'success'
      })
      return true
    } finally {
      setRunningKey(null)
    }
  }

  const capture = async (config: PluginCapture): Promise<void> => {
    if (!captureText.trim()) return
    if (await run(config.command, { text: captureText.trim() }, 'capture')) setCaptureText('')
  }

  const saveEdit = async (command: string): Promise<void> => {
    if (!editing) return
    if (await run(command, { blockId: editing.blockId, content: editing.content }, `edit:${editing.blockId}`)) {
      setEditing(null)
    }
  }

  const deleteRecord = async (record: PluginBlockRecord, command: string): Promise<void> => {
    if (!window.confirm(t('plugin.deleteConfirm'))) return
    await run(command, { blockId: record.block.id }, `delete:${record.block.id}`)
  }

  const runEntryAction = async (record: PluginBlockRecord, action: PluginViewAction): Promise<void> => {
    await run(action.command, { blockId: record.block.id }, `${action.command}:${record.block.id}`)
  }

  if (!plugin || plugins === undefined) {
    return <div className={cn('flex flex-1 items-center justify-center text-sm text-zinc-500', className)} {...props}>{t('plugin.loading')}</div>
  }
  if (!plugin.enabled || !plugin.valid) {
    return <div className={cn('flex flex-1 items-center justify-center text-sm text-red-400', className)} {...props}>{plugin.reason ?? t('plugin.unavailable')}</div>
  }

  const ui = plugin.ui
  const categoryId = plugin.categoryId
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayStartMs = todayStart.getTime()
  const todayCount = (records ?? []).filter((record) => record.block.createdAt >= todayStartMs).length
  const statValue = (key: PluginStatDefinition['key']): number => {
    if (key === 'today') return todayCount
    if (key === 'unvisited') return plugin.badgeCount
    return records?.length ?? 0
  }

  const renderSectionLabel = (label: string): JSX.Element => (
    <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-600">{label}</h2>
  )

  const renderEntry = (record: PluginBlockRecord, entry: PluginEntryElement): JSX.Element => {
    const unvisited = categoryId ? isBlockUnvisitedInGoal(record.block, categoryId) : false
    const isEditing = editing?.blockId === record.block.id
    const showTimestamp = entry.showTimestamp !== false
    const showReviewBadge = entry.showReviewBadge !== false
    const editor = entry.editor
    const deleteCommand = entry.deleteCommand
    const displayContent = entry.content === 'excerpt'
      ? record.block.aiLabel ?? record.block.excerpt
      : record.content

    return (
      <article key={record.block.id} className={cn('rounded-lg border p-3', unvisited ? 'border-yellow-500/30 bg-yellow-500/[0.03]' : 'border-white/10')}>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          {showTimestamp && <span>{formatDateTime(record.block.createdAt, { dateStyle: 'short', timeStyle: 'short' })}</span>}
          {showReviewBadge && unvisited && <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-medium text-yellow-400">{t('plugin.needsReview')}</span>}
          <span className="flex-1" />
          {editor && !isEditing && <button type="button" title={t('plugin.editEntry')} onClick={() => setEditing({ blockId: record.block.id, content: record.content })} className="rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"><LuPencil className="h-3.5 w-3.5" /></button>}
          {deleteCommand && <button type="button" title={t('plugin.deleteEntry')} disabled={runningKey !== null} onClick={() => { void deleteRecord(record, deleteCommand) }} className="rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"><LuTrash2 className="h-3.5 w-3.5" /></button>}
        </div>

        {isEditing && editor ? (
          <div className="mt-2">
            <textarea value={editing.content} onChange={(event) => setEditing({ ...editing, content: event.target.value })} rows={8} className="no-drag w-full resize-y rounded-md border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 outline-none caret-yellow-500 focus:border-yellow-500/50" />
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"><LuX className="h-3.5 w-3.5" /> {t('common.cancel')}</button>
              <button type="button" disabled={!editing.content.trim() || runningKey !== null} onClick={() => { void saveEdit(editor.command) }} className="inline-flex items-center gap-1 rounded border border-yellow-500/40 px-2 py-1 text-xs text-yellow-400 hover:bg-yellow-500/10 disabled:opacity-40"><LuCheck className="h-3.5 w-3.5" /> {t('common.save')}</button>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-sm leading-relaxed text-zinc-200">
            {displayContent.split(/\n{2,}/).map((paragraph, index) => <p key={index} className="my-1 whitespace-pre-wrap first:mt-0 last:mb-0">{paragraph}</p>)}
          </div>
        )}

        {!isEditing && entry.actions && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-2">
            {entry.actions
              .filter((action) => action.showWhen !== 'unvisited' || unvisited)
              .map((action) => (
                <button
                  type="button"
                  key={action.command}
                  disabled={runningKey !== null}
                  onClick={() => { void runEntryAction(record, action) }}
                  className={actionClasses(action)}
                >
                  {action.tone === 'ai' && <LuSparkles className="h-3.5 w-3.5" />}
                  {runningKey === `${action.command}:${record.block.id}` ? t('plugin.working') : action.label}
                </button>
              ))}
          </div>
        )}
      </article>
    )
  }

  const renderList = (element?: PluginListElement): JSX.Element | null => {
    if (!ui || !records?.length) return null
    const entry = pluginEntryFor(ui, element)
    return <div className="space-y-3">{records.map((record) => renderEntry(record, entry))}</div>
  }

  const renderGroupedList = (element?: PluginGroupedListElement): JSX.Element | null => {
    if (!ui || !records?.length) return null
    const entry = pluginEntryFor(ui, element)
    const groupBy = element?.groupBy ?? 'today-recent'
    const groups = groupBy === 'day'
      ? [...records.reduce((map, record) => {
          const key = new Date(record.block.createdAt).toDateString()
          const group = map.get(key) ?? []
          group.push(record)
          map.set(key, group)
          return map
        }, new Map<string, PluginBlockRecord[]>())].map(([key, groupRecords]) => ({
          label: formatDateTime(groupRecords[0].block.createdAt, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: new Date(groupRecords[0].block.createdAt).getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
          }),
          records: groupRecords,
          key
        }))
      : [
          { label: element?.labels?.today ?? t('common.today'), records: records.filter((record) => record.block.createdAt >= todayStartMs), key: 'today' },
          { label: element?.labels?.recent ?? t('plugin.recent'), records: records.filter((record) => record.block.createdAt < todayStartMs), key: 'recent' }
        ].filter((group) => group.records.length > 0)

    return (
      <div>
        {groups.map((group) => (
          <section key={group.key} className="mb-5 last:mb-0">
            {renderSectionLabel(group.label)}
            <div className="space-y-3">{group.records.map((record) => renderEntry(record, entry))}</div>
          </section>
        ))}
      </div>
    )
  }

  const renderLayoutElement = (element: PluginUiLayoutElement, index: number): JSX.Element | null => {
    const type = typeof element === 'string' ? element : element.type
    const key = `${type}:${index}`

    if (type === 'header') {
      const config = typeof element === 'object' && element.type === 'header' ? element : undefined
      return (
        <section key={key} className="border-b border-white/10 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">{config?.title ?? plugin.sidebar?.label ?? plugin.name}</h1>
              <p className="mt-0.5 text-sm text-zinc-500">{config?.description ?? plugin.description}</p>
            </div>
            {config?.showReviewCount !== false && plugin.badgeCount > 0 && <span className="shrink-0 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-1 text-xs text-yellow-400">{t('plugin.reviewCount', { count: formatNumber(plugin.badgeCount) })}</span>}
          </div>
        </section>
      )
    }

    if (type === 'capture') {
      const config = typeof element === 'object' && element.type === 'capture' ? element : ui?.capture
      if (!config) return null
      return (
        <form key={key} className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void capture(config) }}>
          <textarea
            value={captureText}
            onChange={(event) => setCaptureText(event.target.value)}
            placeholder={config.placeholder}
            rows={2}
            className="no-drag min-h-16 min-w-0 flex-1 resize-y rounded-md border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 outline-none caret-yellow-500 placeholder:text-zinc-600 focus:border-yellow-500/50"
          />
          <button type="submit" disabled={!captureText.trim() || runningKey !== null} className="self-end rounded-md border border-yellow-500/40 px-3 py-2 text-sm text-yellow-400 hover:bg-yellow-500/10 disabled:cursor-not-allowed disabled:opacity-40">{runningKey === 'capture' ? t('plugin.adding') : config.label}</button>
        </form>
      )
    }

    if (type === 'stat-row') {
      const items = typeof element === 'object' && element.type === 'stat-row'
        ? element.items ?? ui?.stats ?? defaultStats
        : ui?.stats ?? defaultStats
      return (
        <div key={key} className="flex flex-wrap gap-2">
          {items.map((item) => <span key={item.key} className="rounded-full border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-zinc-400"><strong className="font-medium text-zinc-200">{formatNumber(statValue(item.key))}</strong> {item.label}</span>)}
        </div>
      )
    }

    if (type === 'list') {
      const config = typeof element === 'object' && element.type === 'list' ? element : undefined
      return <div key={key}>{renderList(config)}</div>
    }
    if (type === 'grouped-list') {
      const config = typeof element === 'object' && element.type === 'grouped-list' ? element : undefined
      return <div key={key}>{renderGroupedList(config)}</div>
    }
    if (type === 'empty-state') {
      const message = typeof element === 'object' && element.type === 'empty-state'
        ? element.message
        : undefined
      if (isLoading || records === undefined || records.length > 0) return null
      return <p key={key} className="rounded border border-dashed border-zinc-700 p-4 text-sm text-zinc-500">{message ?? ui?.emptyState ?? t('plugin.empty')}</p>
    }
    if (typeof element === 'object' && element.type === 'section-label') {
      return <div key={key}>{renderSectionLabel(element.label)}</div>
    }
    if (typeof element === 'object' && element.type === 'action') {
      const action: PluginActionElement = element
      if (action.showWhen === 'unvisited' && plugin.badgeCount === 0) return null
      return (
        <div key={key}>
          <button type="button" disabled={runningKey !== null} onClick={() => { void run(action.command, {}, `global:${action.command}`) }} className={actionClasses(action)}>
            {action.tone === 'ai' && <LuSparkles className="h-3.5 w-3.5" />}
            {runningKey === `global:${action.command}` ? t('plugin.working') : action.label}
          </button>
        </div>
      )
    }
    return null
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-2', className)} {...props}>
      {(notice || error) && <p className={cn('mb-2 text-xs', (notice?.tone === 'error' || (!notice && error)) ? 'text-red-400' : notice?.tone === 'success' ? 'text-green-400' : 'text-zinc-400')} role={notice?.tone === 'error' || (!notice && error) ? 'alert' : 'status'}>{notice?.message ?? error}</p>}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-3">
        {!ui && <div className="rounded border border-dashed border-zinc-700 p-4 text-sm text-zinc-500">{t('plugin.noView')}</div>}
        {isLoading && records === undefined && <p className="text-sm text-zinc-500">{t('plugin.loadingEntries')}</p>}
        {ui && pluginUiLayout(ui).map(renderLayoutElement)}
      </div>
    </div>
  )
}

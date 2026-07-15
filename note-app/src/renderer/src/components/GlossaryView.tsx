import { useGlossary, useGlossaryActions, useI18n, useSettings } from '@renderer/context'
import type { TranslationKey } from '@renderer/i18n'
import { cn } from '@renderer/utils'
import { filterGlossaryEntries, GlossarySearchScope } from '@renderer/utils/glossarySearch'
import { validateGlossaryFields } from '@shared/glossary'
import type { GlossaryEntry } from '@shared/models'
import type { GlossaryErrorCode } from '@shared/types'
import { FormEvent, JSX, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { LuBookMarked, LuTrash2 } from 'react-icons/lu'
import { GlossaryCaptureField, GlossaryCaptureFieldId } from './GlossaryCaptureField'

const scopeOptions: { scope: GlossarySearchScope; labelKey: TranslationKey }[] = [
    { scope: 'keys', labelKey: 'glossary.scope.keys' },
    { scope: 'explanations', labelKey: 'glossary.scope.explanations' },
    { scope: 'both', labelKey: 'glossary.scope.both' }
]

const glossaryErrorKeys: Record<Exclude<GlossaryErrorCode, 'key-too-long'>, TranslationKey> = {
    'empty-key': 'glossary.error.emptyKey',
    'empty-explanation': 'glossary.error.emptyExplanation',
    'duplicate-key': 'glossary.error.duplicateKey',
    'not-found': 'glossary.error.notFound'
}

// Personal dictionary page: a dual capture row on top (key | explanation)
// and an aligned two-column list below, split by a draggable divider.
// Selecting a row loads it into the capture row; Save (or Enter) creates or
// updates the entry.
export const GlossaryView = (): JSX.Element => {
    const { entries, isLoading, loadFailed, splitRatio } = useGlossary()
    const { createEntry, updateEntry, deleteEntry, setSplitRatio } = useGlossaryActions()
    const { settings } = useSettings()
    const { t } = useI18n()

    const keyMaxLength = settings.glossaryKeyMaxLength
    const [keyText, setKeyText] = useState('')
    const [explanationText, setExplanationText] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [formError, setFormError] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [query, setQuery] = useState('')
    const [scope, setScope] = useState<GlossarySearchScope>('both')
    const [activeDictationField, setActiveDictationField] = useState<GlossaryCaptureFieldId | null>(null)
    const [isResizing, setIsResizing] = useState(false)
    const listAreaRef = useRef<HTMLDivElement>(null)

    const filteredEntries = useMemo(
        () => filterGlossaryEntries(entries ?? [], query, scope),
        [entries, query, scope]
    )
    const editingEntry = editingId ? entries?.find((entry) => entry.id === editingId) ?? null : null

    useEffect(() => {
        if (!isResizing) return
        const move = (event: MouseEvent): void => {
            const rect = listAreaRef.current?.getBoundingClientRect()
            if (!rect || rect.width === 0) return
            setSplitRatio((event.clientX - rect.left) / rect.width)
        }
        const up = (): void => setIsResizing(false)
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
        document.body.style.cursor = 'col-resize'
        return () => {
            window.removeEventListener('mousemove', move)
            window.removeEventListener('mouseup', up)
            document.body.style.cursor = ''
        }
    }, [isResizing, setSplitRatio])

    const errorText = (code: GlossaryErrorCode): string =>
        code === 'key-too-long'
            ? t('glossary.error.keyTooLong', { max: keyMaxLength })
            : t(glossaryErrorKeys[code])

    const resetForm = (): void => {
        setEditingId(null)
        setKeyText('')
        setExplanationText('')
        setFormError(null)
    }

    const handleSubmit = async (event: FormEvent): Promise<void> => {
        event.preventDefault()
        if (isSaving) return
        // Immediate feedback; main revalidates the same rules on save.
        const validated = validateGlossaryFields(keyText, explanationText, keyMaxLength)
        if (validated.error) {
            setFormError(errorText(validated.error))
            return
        }
        setIsSaving(true)
        try {
            const outcome = editingId
                ? await updateEntry(editingId, keyText, explanationText)
                : await createEntry(keyText, explanationText)
            if (!outcome.ok) {
                setFormError(errorText(outcome.error))
                return
            }
            resetForm()
        } catch {
            setFormError(t('glossary.error.save'))
        } finally {
            setIsSaving(false)
        }
    }

    const loadForEdit = (entry: GlossaryEntry): void => {
        setEditingId(entry.id)
        setKeyText(entry.key)
        setExplanationText(entry.explanation)
        setFormError(null)
    }

    const handleDelete = async (entry: GlossaryEntry): Promise<void> => {
        if (!window.confirm(t('glossary.deleteConfirm', { key: entry.key }))) return
        const deleted = await deleteEntry(entry.id).catch(() => false)
        if (!deleted) {
            setFormError(t('glossary.error.delete'))
            return
        }
        if (editingId === entry.id) resetForm()
    }

    const keyColumnWidth = `${splitRatio * 100}%`
    const hasEntries = (entries?.length ?? 0) > 0

    return (
        <section className="flex h-full min-h-0 flex-col px-2 pb-2">
            <header className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3 pt-1">
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-zinc-300">
                    <LuBookMarked className="h-4 w-4 text-yellow-500/70" aria-hidden />
                    {t('glossary.title')}
                </h2>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <input
                        type="text"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t('glossary.searchPlaceholder')}
                        aria-label={t('glossary.searchPlaceholder')}
                        className="w-56 rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 text-sm outline-none caret-yellow-500 placeholder:text-zinc-500 focus:border-zinc-300/60"
                    />
                    <div role="group" aria-label={t('glossary.searchScope')} className="flex overflow-hidden rounded-md border border-zinc-400/50 text-xs">
                        {scopeOptions.map(({ scope: option, labelKey }) => (
                            <button
                                key={option}
                                type="button"
                                aria-pressed={scope === option}
                                onClick={() => setScope(option)}
                                className={cn(
                                    'px-2 py-1.5 transition-colors duration-75',
                                    scope === option
                                        ? 'bg-yellow-500/15 text-yellow-300'
                                        : 'text-zinc-400 hover:bg-zinc-600/50 hover:text-zinc-200'
                                )}
                            >
                                {t(labelKey)}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <form onSubmit={(event) => { void handleSubmit(event) }} className="mt-2">
                <div className="flex items-start gap-2">
                    <GlossaryCaptureField
                        fieldId="key"
                        label={t('glossary.keyLabel')}
                        value={keyText}
                        placeholder={t('glossary.keyPlaceholder')}
                        maxLength={keyMaxLength}
                        activeDictationField={activeDictationField}
                        onChange={setKeyText}
                        onDictationStart={setActiveDictationField}
                    />
                    <GlossaryCaptureField
                        fieldId="explanation"
                        label={t('glossary.explanationLabel')}
                        value={explanationText}
                        placeholder={t('glossary.explanationPlaceholder')}
                        multiline
                        activeDictationField={activeDictationField}
                        onChange={setExplanationText}
                        onDictationStart={setActiveDictationField}
                    />
                    <div className="flex shrink-0 flex-col gap-1 self-center">
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="rounded-md border border-yellow-500/50 px-2.5 py-1.5 text-sm text-zinc-200 hover:bg-yellow-500/20 disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                            {editingId ? t('glossary.updateEntry') : t('glossary.addEntry')}
                        </button>
                        {editingId && (
                            <button
                                type="button"
                                onClick={resetForm}
                                className="rounded-md border border-zinc-400/50 px-2.5 py-1.5 text-sm text-zinc-400 hover:bg-zinc-600/50"
                            >
                                {t('glossary.cancelEdit')}
                            </button>
                        )}
                    </div>
                </div>
                {formError
                    ? <p role="alert" className="mt-1 px-1 text-xs text-red-400">{formError}</p>
                    : editingEntry && <p className="mt-1 px-1 text-xs text-yellow-600/80">{t('glossary.editingEntry', { key: editingEntry.key })}</p>}
            </form>

            <div className="mt-2 flex min-h-0 flex-1 flex-col">
                <div className="flex rounded-t-md border border-white/10 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
                    <div className="shrink-0 truncate px-3 py-1.5" style={{ width: keyColumnWidth }}>{t('glossary.keyLabel')}</div>
                    <div className="min-w-0 flex-1 border-l border-white/10 px-3 py-1.5">{t('glossary.explanationLabel')}</div>
                </div>
                <div ref={listAreaRef} className="relative min-h-0 flex-1 rounded-b-md border border-t-0 border-white/10 bg-zinc-900/30">
                    <div className="h-full overflow-y-auto">
                        {loadFailed && <p role="alert" className="px-3 py-2 text-xs text-red-400">{t('glossary.error.load')}</p>}
                        {isLoading && !hasEntries
                            ? <p className="px-3 py-3 text-sm text-zinc-500">{t('glossary.loading')}</p>
                            : !hasEntries
                                ? !loadFailed && <p className="px-3 py-3 text-sm text-zinc-500">{t('glossary.empty')}</p>
                                : filteredEntries.length === 0
                                    ? <p className="px-3 py-3 text-sm text-zinc-500">{t('glossary.noMatches')}</p>
                                    : (
                                        <ul>
                                            {filteredEntries.map((entry) => (
                                                <li
                                                    key={entry.id}
                                                    title={t('glossary.editEntry')}
                                                    onClick={() => loadForEdit(entry)}
                                                    className={cn(
                                                        'group flex cursor-pointer items-stretch border-b border-white/5 transition-colors duration-75 hover:bg-zinc-600/20',
                                                        editingId === entry.id && 'bg-yellow-500/5'
                                                    )}
                                                >
                                                    <div className="shrink-0 whitespace-pre-wrap break-words px-3 py-2 text-sm text-zinc-200" style={{ width: keyColumnWidth }}>
                                                        {entry.key}
                                                    </div>
                                                    <div className="min-w-0 flex-1 whitespace-pre-wrap break-words border-l border-white/10 px-3 py-2 text-sm text-zinc-400">
                                                        {entry.explanation}
                                                    </div>
                                                    <div className="flex shrink-0 items-start px-1 py-1.5">
                                                        <button
                                                            type="button"
                                                            title={t('glossary.deleteEntry')}
                                                            aria-label={t('glossary.deleteEntry')}
                                                            onClick={(event) => { event.stopPropagation(); void handleDelete(entry) }}
                                                            className="rounded p-1 text-zinc-600 opacity-0 transition-opacity duration-100 hover:bg-red-500/10 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                                                        >
                                                            <LuTrash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                    </div>
                    <div
                        onMouseDown={(event: ReactMouseEvent) => { event.preventDefault(); setIsResizing(true) }}
                        title={t('glossary.dragResize')}
                        className={cn(
                            'absolute top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-zinc-400/40',
                            isResizing && 'bg-zinc-400/40'
                        )}
                        style={{ left: keyColumnWidth }}
                    />
                </div>
            </div>
        </section>
    )
}

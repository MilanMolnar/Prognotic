import { MDXEditorMethods } from '@mdxeditor/editor'
import { useBlockActions, useBlocks } from '@renderer/context'
import { autoSavingTime } from '@shared/constants'
import { RefObject, useCallback, useEffect, useRef, useState } from 'react'

export type UseNaturalCaptureParams = {
    // The open block of this category to resume writing into, or null to
    // start fresh; its cached markdown. Read once at mount — the consuming
    // component is keyed by category, so one mount = one capture session.
    resumeBlockId: string | null
    resumeContent: string
    category: string | null
}

type UseNaturalCaptureResult = {
    initialContent: string
    editorRef: RefObject<MDXEditorMethods | null>
    handleChange: (markdown: string) => void
    appendTranscript: (chunk: string) => void
}

// Drives the natural-mode writing surface: a document-style editor that IS
// the open block of the current category. Typing persists the full markdown
// on a throttle — each write bumps updatedAt, which resets the block window
// exactly like chat appends do. The first flush of a fresh session creates
// the block (and opens it); when the window expires the provider clears
// openBlockId and this hook finalizes: unsaved text is flushed to the
// now-closed block and the surface is cleared, so the block collapses into
// a card in the feed below.
export const useNaturalCapture = ({
    resumeBlockId,
    resumeContent,
    category
}: UseNaturalCaptureParams): UseNaturalCaptureResult => {
    const { openBlockId } = useBlocks()
    const { updateBlockContent, createCaptureBlock, cleanupBlockIfEmpty, closeOpenBlock } =
        useBlockActions()

    const editorRef = useRef<MDXEditorMethods>(null)

    // The block this surface is writing into; null until the first flush of
    // a fresh session creates one.
    const sessionIdRef = useRef(resumeBlockId)
    // Markdown as typed (null = untouched this session) vs. last persisted.
    const latestRef = useRef<string | null>(null)
    const savedRef = useRef(resumeContent)
    // Serializes persists so a create and a follow-up write cannot interleave.
    const queueRef = useRef<Promise<void>>(Promise.resolve())
    const throttleTimerRef = useRef<number | null>(null)

    // Frozen at mount: MDXEditor treats markdown as the initial value only,
    // and later cache updates for this block must not disturb typing.
    const [initialContent] = useState(resumeContent)

    const persistNow = useCallback(async (): Promise<void> => {
        const content = latestRef.current
        if (content === null || content === savedRef.current) return

        if (sessionIdRef.current !== null) {
            await updateBlockContent(sessionIdRef.current, { content })
            savedRef.current = content
            return
        }

        // First flush of a fresh session starts the block — but never for
        // pure whitespace (blank lines are just visual spacing).
        if (content.trim().length === 0) return
        const meta = await createCaptureBlock(content, category)
        sessionIdRef.current = meta.id
        savedRef.current = content
    }, [updateBlockContent, createCaptureBlock, category])

    const enqueuePersist = useCallback((): void => {
        queueRef.current = queueRef.current.then(persistNow).catch(() => undefined)
    }, [persistNow])

    // Throttled save: the first change in a window arms the timer, further
    // changes just refresh latestRef; the flush picks up whatever was typed
    // by then.
    const handleChange = useCallback(
        (markdown: string): void => {
            latestRef.current = markdown
            if (throttleTimerRef.current !== null) return
            throttleTimerRef.current = window.setTimeout(() => {
                throttleTimerRef.current = null
                enqueuePersist()
            }, autoSavingTime)
        },
        [enqueuePersist]
    )

    // Dictated text lands at the end of the document (with smart spacing) so
    // the user can review it in place; it persists through the same throttled
    // save as typing.
    const appendTranscript = useCallback(
        (chunk: string): void => {
            const trimmed = chunk.trim()
            if (!trimmed) return

            const current = editorRef.current?.getMarkdown() ?? latestRef.current ?? savedRef.current
            const needsSpace = current.length > 0 && !/\s$/.test(current)
            const next = `${current}${needsSpace ? ' ' : ''}${trimmed}`
            editorRef.current?.setMarkdown(next)
            handleChange(next)
        },
        [handleChange]
    )

    // Manual finalize (Ctrl+S): flush whatever the surface holds, then close
    // the open block — it becomes a normal closed card below (or, if left
    // blank, the close's empty cleanup removes it). The write and the close
    // run in order through the persist queue, so the cleanup's emptiness
    // check always sees the final content.
    const closeSession = useCallback((): void => {
        const sessionId = sessionIdRef.current
        if (sessionId === null) return

        if (throttleTimerRef.current !== null) {
            clearTimeout(throttleTimerRef.current)
            throttleTimerRef.current = null
        }
        const pending = latestRef.current
        const saved = savedRef.current
        sessionIdRef.current = null
        latestRef.current = null
        savedRef.current = ''
        queueRef.current = queueRef.current
            .then(async () => {
                if (pending !== null && pending !== saved) {
                    await updateBlockContent(sessionId, { content: pending })
                }
                closeOpenBlock()
            })
            .catch(() => undefined)
        editorRef.current?.setMarkdown('')
    }, [updateBlockContent, closeOpenBlock])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent): void => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault()
                closeSession()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [closeSession])

    // Finalize when the session block stops being the open one (window
    // expired). Snapshot-flush any unsaved text to the now-closed block —
    // or, if the surface was left blank, remove the empty block silently —
    // then clear the surface so a finalized block shows up as a card below.
    useEffect(() => {
        const sessionId = sessionIdRef.current
        if (sessionId === null || openBlockId === sessionId) return

        if (throttleTimerRef.current !== null) {
            clearTimeout(throttleTimerRef.current)
            throttleTimerRef.current = null
        }
        const pending = latestRef.current
        const saved = savedRef.current
        sessionIdRef.current = null
        latestRef.current = null
        savedRef.current = ''
        const finalContent = pending ?? saved
        if (finalContent.trim().length === 0) {
            queueRef.current = queueRef.current
                .then(() => cleanupBlockIfEmpty(sessionId))
                .catch(() => undefined)
        } else if (pending !== null && pending !== saved) {
            queueRef.current = queueRef.current
                .then(() => updateBlockContent(sessionId, { content: pending }))
                .catch(() => undefined)
        }
        editorRef.current?.setMarkdown('')
    }, [openBlockId, updateBlockContent, cleanupBlockIfEmpty])

    // Flush unsaved text before the surface goes away (mode or category
    // switch, or a block opened for editing) — or, if the session block was
    // left blank, remove it silently. persistNow re-reads the session refs
    // when it runs, so it cannot double-create against an in-flight save.
    useEffect(() => {
        return () => {
            if (throttleTimerRef.current !== null) clearTimeout(throttleTimerRef.current)
            const sessionId = sessionIdRef.current
            const finalContent = latestRef.current ?? savedRef.current
            // Persist first so a just-cleared surface is flushed before the
            // emptiness check — both run in order through main's index lock.
            enqueuePersist()
            if (sessionId !== null && finalContent.trim().length === 0) {
                queueRef.current = queueRef.current
                    .then(() => cleanupBlockIfEmpty(sessionId))
                    .catch(() => undefined)
            }
        }
    }, [enqueuePersist, cleanupBlockIfEmpty])

    return {
        initialContent,
        editorRef,
        handleChange,
        appendTranscript
    }
}

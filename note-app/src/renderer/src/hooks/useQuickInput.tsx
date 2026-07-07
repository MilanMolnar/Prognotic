import { useBlockActions } from "@renderer/context";
import { KeyboardEvent, RefObject, useCallback, useRef, useState } from "react";

export type MarkdownFormat = 'heading' | 'bold' | 'italic' | 'list' | 'code'

type UseQuickInputResult = {
    text: string
    setText: (text: string) => void
    isSubmitting: boolean
    textareaRef: RefObject<HTMLTextAreaElement | null>
    submit: () => Promise<void>
    handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
    applyFormat: (format: MarkdownFormat) => void
    appendTranscript: (chunk: string) => void
}

export const useQuickInput = (): UseQuickInputResult => {
    const { submitQuickNote } = useBlockActions();
    const [text, setText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const textRef = useRef(text);
    textRef.current = text;

    const submit = async (): Promise<void> => {
        const trimmed = text.trim();
        if (!trimmed || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await submitQuickNote(trimmed);
            setText('');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Enter submits, Shift+Enter inserts a newline.
    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void submit();
        }
    };

    // Toolbar formatting: inline formats wrap the current selection, line
    // formats prefix the current line. The cursor/selection is restored after
    // React re-renders the controlled textarea.
    const applyFormat = (format: MarkdownFormat): void => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const { selectionStart: start, selectionEnd: end } = textarea;
        let next: string;
        let nextStart: number;
        let nextEnd: number;

        if (format === 'heading' || format === 'list') {
            const prefix = format === 'heading' ? '## ' : '- ';
            const lineStart = text.lastIndexOf('\n', start - 1) + 1;
            next = text.slice(0, lineStart) + prefix + text.slice(lineStart);
            nextStart = start + prefix.length;
            nextEnd = end + prefix.length;
        } else {
            const marker = format === 'bold' ? '**' : format === 'italic' ? '*' : '`';
            next = text.slice(0, start) + marker + text.slice(start, end) + marker + text.slice(end);
            nextStart = start + marker.length;
            nextEnd = end + marker.length;
        }

        setText(next);
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(nextStart, nextEnd);
        });
    };

    // Inserts dictated text at the caret so the user can review before Send.
    const appendTranscript = useCallback((chunk: string): void => {
        const trimmed = chunk.trim();
        if (!trimmed) return;

        const textarea = textareaRef.current;
        const prev = textRef.current;
        const start = textarea?.selectionStart ?? prev.length;
        const end = textarea?.selectionEnd ?? prev.length;
        const before = prev.slice(0, start);
        const after = prev.slice(end);
        const needsSpaceBefore = before.length > 0 && !/\s$/.test(before);
        const insert = `${needsSpaceBefore ? ' ' : ''}${trimmed}`;
        const next = before + insert + after;
        const cursor = before.length + insert.length;
        setText(next);
        requestAnimationFrame(() => {
            textarea?.focus();
            textarea?.setSelectionRange(cursor, cursor);
        });
    }, []);

    return {
        text,
        setText,
        isSubmitting,
        textareaRef,
        submit,
        handleKeyDown,
        applyFormat,
        appendTranscript
    };
}

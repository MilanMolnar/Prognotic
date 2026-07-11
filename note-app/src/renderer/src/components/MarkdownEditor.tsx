import { MDXEditor } from '@mdxeditor/editor'
import { useMarkdownEditor } from '@renderer/hooks/useMarkdownEditor';
import { useBlockActions } from '@renderer/context'
import { JSX } from 'react'
import { editorPlugins } from './editorPlugins'
import { EditorAiToolbar } from './EditorAiToolbar'

// Full block editor shown in the right panel when a block is selected.
// Live markdown shortcuts (markdownShortcutPlugin) render `# header`,
// `**bold**`, lists etc. as you type — no toolbar needed.
export const MarkdownEditor = (): JSX.Element | null => {
  const { selectedBlock, editorKey, editorRef, handleAutoSaving, handleBlur } = useMarkdownEditor();
  const { saveBlock } = useBlockActions()

  if (!selectedBlock) return null

  const persistSelectionReplacement = (): void => {
    const content = editorRef.current?.getMarkdown()
    if (content !== undefined) void saveBlock({ content })
  }

  return (<div className="flex h-full min-h-0 flex-col">
    <EditorAiToolbar blockId={selectedBlock.id} editorRef={editorRef} onSelectionReplaced={persistSelectionReplacement} />
    <MDXEditor
      ref={editorRef}
      key={editorKey}
      markdown={selectedBlock.content}
      onChange={handleAutoSaving}
      onBlur={handleBlur}
      plugins={editorPlugins()}
      contentEditableClassName="outline-none min-h-full max-w-none text-lg px-8 py-5 caret-yellow-500 prose prose-invert prose-p:my-1.5 prose-p:leading-normal prose-headings:my-3 prose-blockquote:my-3 prose-ul:my-1.5 prose-li:my-0 prose-code:py-1 prose-code:text-red-500 prose-code:before:content-[''] prose-code:after:content-['']" />
  </div>)
}

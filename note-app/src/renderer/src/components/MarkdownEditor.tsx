import { MDXEditor } from '@mdxeditor/editor'
import { useMarkdownEditor } from '@renderer/hooks/useMarkdownEditor';
import { JSX } from 'react'
import { editorPlugins } from './editorPlugins'

// Full block editor shown in the right panel when a block is selected.
// Live markdown shortcuts (markdownShortcutPlugin) render `# header`,
// `**bold**`, lists etc. as you type — no toolbar needed.
export const MarkdownEditor = (): JSX.Element | null => {
  const { selectedBlock, editorKey, editorRef, handleAutoSaving, handleBlur } = useMarkdownEditor();

  if (!selectedBlock) return null

  return (
    <MDXEditor
      ref={editorRef}
      key={editorKey}
      markdown={selectedBlock.content}
      onChange={handleAutoSaving}
      onBlur={handleBlur}
      plugins={editorPlugins()}
      contentEditableClassName="outline-none min-h-full max-w-none text-lg px-8 py-5 caret-yellow-500 prose prose-invert prose-p:my-1.5 prose-p:leading-normal prose-headings:my-3 prose-blockquote:my-3 prose-ul:my-1.5 prose-li:my-0 prose-code:py-1 prose-code:text-red-500 prose-code:before:content-[''] prose-code:after:content-['']" />
  )
}

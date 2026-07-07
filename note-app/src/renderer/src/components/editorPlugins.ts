import {
  codeBlockPlugin,
  headingsPlugin,
  imagePlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  RealmPlugin
} from '@mdxeditor/editor'

// Shared by the block editor and the natural capture surface so live
// markdown behaves identically in both. Own file (not a component module)
// to keep react-refresh happy.
export const editorPlugins = (): RealmPlugin[] => [
  headingsPlugin(),
  listsPlugin(),
  quotePlugin(),
  linkPlugin(),
  imagePlugin(),
  codeBlockPlugin(),
  markdownShortcutPlugin()
]

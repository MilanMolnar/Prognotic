// Quick actions offered on a block's right-click menu. Kept as a
// configurable list so a future settings UI can let users edit their own
// quick LLM actions; the defaults below are hardcoded for now.
export type QuickAction = {
  id: string
  label: string
}

export const defaultQuickActions: QuickAction[] = [
  { id: 'translate', label: 'Translate' },
  { id: 'send-to-research', label: 'Send to research' },
  { id: 'explain', label: 'Explain' }
]

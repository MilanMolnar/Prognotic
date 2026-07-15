// Quick actions offered on a block's right-click menu. Kept as a
// configurable list so a future settings UI can let users edit their own
// quick LLM actions; the defaults below are hardcoded for now.
export type QuickAction = {
  id: 'translate' | 'send-to-research' | 'explain'
}

export const defaultQuickActions: QuickAction[] = [
  { id: 'translate' },
  { id: 'send-to-research' },
  { id: 'explain' }
]

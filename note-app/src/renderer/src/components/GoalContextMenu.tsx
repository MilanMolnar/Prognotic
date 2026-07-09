import { Goal } from '@shared/models'
import { JSX, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export type GoalContextMenuProps = {
  goal: Goal
  position: { x: number; y: number }
  onRename: () => void
  onEditDescription: () => void
  onDelete: () => void
  onClose: () => void
}

const menuWidth = 144

export const GoalContextMenu = ({ goal, position, onRename, onEditDescription, onDelete, onClose }: GoalContextMenuProps): JSX.Element => {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const pointerDown = (event: MouseEvent): void => { if (!menuRef.current?.contains(event.target as Node)) onClose() }
    const keyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    window.addEventListener('mousedown', pointerDown, true)
    window.addEventListener('contextmenu', pointerDown, true)
    window.addEventListener('keydown', keyDown)
    return () => { window.removeEventListener('mousedown', pointerDown, true); window.removeEventListener('contextmenu', pointerDown, true); window.removeEventListener('keydown', keyDown) }
  }, [onClose])

  const left = Math.max(8, Math.min(position.x, window.innerWidth - menuWidth - 8))
  const top = Math.max(8, Math.min(position.y, window.innerHeight - 112))
  return createPortal(<div ref={menuRef} style={{ left, top }} className="fixed z-50 w-36 rounded-md border border-zinc-700 bg-zinc-900/95 py-1 shadow-xl">
    <button type="button" onClick={onRename} className="block w-full px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-yellow-500/10 hover:text-yellow-500">Rename</button>
    <button type="button" onClick={onEditDescription} className="block w-full px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-yellow-500/10 hover:text-yellow-500">Edit description</button>
    <button type="button" onClick={onDelete} className="block w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-red-500/10">Delete {goal.name}</button>
  </div>, document.body)
}

export const flyLabelToCategoryRow = (
  label: string,
  from: { x: number; y: number },
  categoryRowId: string
): void => {
  const row = document.querySelector(`[data-category-row="${categoryRowId}"]`)
  if (!row) return

  const rowRect = row.getBoundingClientRect()
  const ghost = document.createElement('div')
  ghost.textContent = label
  ghost.className =
    'pointer-events-none fixed z-[80] max-w-[12rem] truncate rounded-md border border-yellow-500/50 bg-zinc-900/95 px-2 py-1 text-xs text-yellow-500 shadow-xl'
  ghost.style.left = `${from.x}px`
  ghost.style.top = `${from.y}px`
  document.body.appendChild(ghost)

  const flight = ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${rowRect.left + rowRect.width / 2 - from.x}px, ${rowRect.top + rowRect.height / 2 - from.y}px) scale(0.4)`, opacity: 0.4 }
    ],
    { duration: 550, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
  )
  flight.onfinish = (): void => {
    ghost.remove()
    row.animate(
      [
        { boxShadow: 'inset 0 0 0 1px rgb(234 179 8 / 0)', backgroundColor: 'rgb(234 179 8 / 0)' },
        { boxShadow: 'inset 0 0 0 1px rgb(234 179 8 / 0.7)', backgroundColor: 'rgb(234 179 8 / 0.15)', offset: 0.25 },
        { boxShadow: 'inset 0 0 0 1px rgb(234 179 8 / 0)', backgroundColor: 'rgb(234 179 8 / 0)' }
      ],
      { duration: 900, easing: 'ease-out' }
    )
  }
}

// Subtle bottom-center notice. A new block toast replaces any visible one
// instead of stacking with it.
export const showBlockToast = (message: string): void => {
  document.querySelector('[data-block-toast]')?.remove()

  const toast = document.createElement('div')
  toast.textContent = message
  toast.setAttribute('data-block-toast', '')
  toast.className =
    'pointer-events-none fixed bottom-6 left-1/2 z-50 rounded-md border border-zinc-700 bg-zinc-900/95 px-3 py-1.5 text-xs text-zinc-300 shadow-xl'
  document.body.appendChild(toast)

  const appearance = toast.animate(
    [
      { opacity: 0, transform: 'translate(-50%, 8px)' },
      { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.08 },
      { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.85 },
      { opacity: 0, transform: 'translate(-50%, 4px)' }
    ],
    { duration: 2400, easing: 'ease-out' }
  )
  appearance.onfinish = (): void => toast.remove()
}

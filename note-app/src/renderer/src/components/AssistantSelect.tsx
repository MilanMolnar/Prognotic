import { cn } from '@renderer/utils'
import { JSX, KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { LuCheck, LuChevronDown, LuSearch, LuSparkles } from 'react-icons/lu'

export type AssistantSelectOption = {
  value: string
  label: string
  isDefault?: boolean
}

export type AssistantSelectProps = {
  ariaLabel: string
  value: string
  options: AssistantSelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  placement?: 'down' | 'up'
  maxVisibleOptions?: number
  searchableThreshold?: number
  searchPlaceholder?: string
}

export const AssistantSelect = ({
  ariaLabel,
  value,
  options,
  onChange,
  disabled = false,
  className,
  placement = 'down',
  maxVisibleOptions,
  searchableThreshold,
  searchPlaceholder = 'Filter options...'
}: AssistantSelectProps): JSX.Element => {
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [search, setSearch] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()
  const selected = options.find((option) => option.value === value) ?? options[0]
  const isSearchable = searchableThreshold !== undefined && options.length >= searchableThreshold
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query ? options.filter((option) => option.label.toLowerCase().includes(query)) : options
  }, [options, search])

  const close = useCallback((): void => {
    setIsOpen(false)
    setActiveIndex(-1)
    setSearch('')
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const closeFromOutside = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    window.addEventListener('pointerdown', closeFromOutside, true)
    return () => window.removeEventListener('pointerdown', closeFromOutside, true)
  }, [close, isOpen])

  useEffect(() => {
    if (isOpen && isSearchable) searchRef.current?.focus()
  }, [isOpen, isSearchable])

  const choose = (index: number): void => {
    const option = filteredOptions[index]
    if (!option) return
    onChange(option.value)
    close()
  }

  const moveActive = (direction: 1 | -1): void => {
    if (filteredOptions.length === 0) return
    setIsOpen(true)
    setActiveIndex((current) => {
      if (current >= 0) return (current + direction + filteredOptions.length) % filteredOptions.length
      const selectedIndex = filteredOptions.findIndex((option) => option.value === value)
      if (selectedIndex >= 0) return (selectedIndex + direction + filteredOptions.length) % filteredOptions.length
      return direction === 1 ? 0 : filteredOptions.length - 1
    })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      close()
      triggerRef.current?.focus()
      return
    }
    if (event.key === 'Enter' || (event.key === ' ' && event.currentTarget === triggerRef.current)) {
      event.preventDefault()
      if (isOpen && activeIndex >= 0) choose(activeIndex)
      else setIsOpen(true)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    moveActive(event.key === 'ArrowDown' ? 1 : -1)
  }

  return <div ref={rootRef} className={cn('relative min-w-0', className)}>
    <button
      ref={triggerRef}
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      aria-controls={listboxId}
      disabled={disabled}
      onClick={() => {
        if (isOpen) close()
        else {
          setActiveIndex(-1)
          setIsOpen(true)
        }
      }}
      onKeyDown={handleKeyDown}
      className={cn('flex w-full items-center gap-1 rounded border bg-zinc-900 px-1.5 py-1 text-left text-xs outline-none transition-colors disabled:opacity-40', isOpen ? 'border-yellow-500/60 text-yellow-400' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500')}
    >
      {selected?.isDefault && <LuSparkles className="h-3 w-3 shrink-0 text-yellow-500" />}
      <span className="min-w-0 flex-1 truncate">{selected?.label ?? 'Select'}</span>
      <LuChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', isOpen && 'rotate-180')} />
    </button>
    {isOpen && <div className={cn('absolute left-0 right-0 z-50 rounded border border-zinc-700 bg-zinc-900 p-1 shadow-xl', placement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1')}>
      {isSearchable && <div className="mb-1 flex items-center gap-1 rounded border border-zinc-700 bg-zinc-950 px-1.5 focus-within:border-yellow-500/50">
        <LuSearch className="h-3 w-3 shrink-0 text-zinc-500" />
        <input ref={searchRef} value={search} onChange={(event) => { setSearch(event.target.value); setActiveIndex(-1) }} onKeyDown={handleKeyDown} placeholder={searchPlaceholder} className="min-w-0 flex-1 bg-transparent py-1 text-xs text-zinc-300 outline-none placeholder:text-zinc-600" />
      </div>}
      <div id={listboxId} role="listbox" aria-label={ariaLabel} className="overflow-y-auto" style={{ maxHeight: (maxVisibleOptions ?? 9) * 24 }}>
      {filteredOptions.map((option, index) => {
        const isSelected = option.value === value
        const isActive = index === activeIndex
        return <button
          type="button"
          role="option"
          aria-selected={isSelected}
          key={option.value}
          onMouseEnter={() => setActiveIndex(index)}
          onMouseLeave={() => setActiveIndex(-1)}
          onClick={() => choose(index)}
          className={cn('flex h-6 w-full items-center gap-1.5 rounded px-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-yellow-500/15 hover:text-yellow-400', isActive && 'bg-yellow-500/15 text-yellow-400')}
        >
          {option.isDefault ? <LuSparkles className="h-3 w-3 shrink-0 text-yellow-500" /> : <span className="h-3 w-3 shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{option.label}</span>
          {isSelected && <LuCheck className="h-3 w-3 shrink-0 text-yellow-500" />}
        </button>
      })}
      {filteredOptions.length === 0 && <p className="px-1.5 py-2 text-center text-xs text-zinc-500">No matching options</p>}
      </div>
    </div>}
  </div>
}

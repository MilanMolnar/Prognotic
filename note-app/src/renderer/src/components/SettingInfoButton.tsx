import { JSX, MouseEvent } from 'react'
import { LuInfo } from 'react-icons/lu'

export type SettingInfoButtonProps = {
  settingName: string
  onOpen: () => void
}

export const SettingInfoButton = ({ settingName, onOpen }: SettingInfoButtonProps): JSX.Element => {
  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    onOpen()
  }

  return <button
    type="button"
    aria-label={`More information about ${settingName}`}
    title={`More information about ${settingName}`}
    onClick={handleClick}
    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-yellow-500/70"
  >
    <LuInfo className="h-3.5 w-3.5" />
  </button>
}

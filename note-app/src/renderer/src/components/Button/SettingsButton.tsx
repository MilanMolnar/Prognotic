import {ActionButton, ActionButtonProps, SettingsModal} from "@/components";
import { onboardingEvents } from '@renderer/onboarding/events'
import { JSX, useEffect, useState } from "react";
import {LuSettings} from "react-icons/lu"

export const SettingsButton = ({...props}: ActionButtonProps): JSX.Element => {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const open = (): void => setIsOpen(true)
        window.addEventListener(onboardingEvents.openSettingsModal, open)
        return () => window.removeEventListener(onboardingEvents.openSettingsModal, open)
    }, [])

    return (
        <>
            <ActionButton data-tour="settings" onClick={() => setIsOpen(true)} {...props}>
                <LuSettings className="w-4 h-4 text-zinc-300" />
            </ActionButton>
            {isOpen && <SettingsModal onClose={() => setIsOpen(false)} />}
        </>
    )
}

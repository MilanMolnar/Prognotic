import {ActionButton, ActionButtonProps, SettingsModal, SettingsSection} from "@/components";
import { onboardingEvents } from '@renderer/onboarding/events'
import { useI18n } from '@renderer/context'
import { JSX, useEffect, useState } from "react";
import {LuSettings} from "react-icons/lu"

export const SettingsButton = ({...props}: ActionButtonProps): JSX.Element => {
    const { t } = useI18n()
    const [isOpen, setIsOpen] = useState(false);
    const [initialSection, setInitialSection] = useState<SettingsSection>('general')

    useEffect(() => {
        const open = (event: Event): void => {
            const detail = (event as CustomEvent<{ section?: SettingsSection }>).detail
            setInitialSection(detail?.section ?? 'general')
            setIsOpen(true)
        }
        window.addEventListener(onboardingEvents.openSettingsModal, open)
        return () => window.removeEventListener(onboardingEvents.openSettingsModal, open)
    }, [])

    return (
        <>
            <ActionButton data-tour="settings" title={t('navigation.settings')} onClick={() => { setInitialSection('general'); setIsOpen(true) }} {...props}>
                <LuSettings className="w-4 h-4 text-zinc-300" />
            </ActionButton>
            {isOpen && <SettingsModal initialSection={initialSection} onClose={() => setIsOpen(false)} />}
        </>
    )
}

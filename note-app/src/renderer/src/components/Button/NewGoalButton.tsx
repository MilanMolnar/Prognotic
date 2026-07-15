import {ActionButton, ActionButtonProps, GoalDialog} from "@/components";
import { onboardingEvents } from '@renderer/onboarding/events'
import { useI18n } from '@renderer/context'
import { JSX, useEffect, useState } from "react";
import {LuPlus} from "react-icons/lu"

export const NewGoalButton = ({...props}: ActionButtonProps): JSX.Element => {
    const { t } = useI18n()
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const open = (): void => setIsOpen(true)
        window.addEventListener(onboardingEvents.openGoalDialog, open)
        return () => window.removeEventListener(onboardingEvents.openGoalDialog, open)
    }, [])

    return (
        <>
            <ActionButton data-tour="new-goal" title={t('navigation.newGoal')} onClick={() => setIsOpen(true)} {...props}>
                <LuPlus className="w-4 h-4 text-zinc-300" />
            </ActionButton>
            {isOpen && <GoalDialog onClose={() => setIsOpen(false)} />}
        </>
    )
}

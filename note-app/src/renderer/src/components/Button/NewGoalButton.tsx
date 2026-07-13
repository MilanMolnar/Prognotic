import {ActionButton, ActionButtonProps, GoalDialog} from "@/components";
import { onboardingEvents } from '@renderer/onboarding/events'
import { JSX, useEffect, useState } from "react";
import {LuPlus} from "react-icons/lu"

export const NewGoalButton = ({...props}: ActionButtonProps): JSX.Element => {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const open = (): void => setIsOpen(true)
        window.addEventListener(onboardingEvents.openGoalDialog, open)
        return () => window.removeEventListener(onboardingEvents.openGoalDialog, open)
    }, [])

    return (
        <>
            <ActionButton data-tour="new-goal" onClick={() => setIsOpen(true)} {...props}>
                <LuPlus className="w-4 h-4 text-zinc-300" />
            </ActionButton>
            {isOpen && <GoalDialog onClose={() => setIsOpen(false)} />}
        </>
    )
}

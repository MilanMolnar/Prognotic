import {ActionButton, ActionButtonProps, GoalDialog} from "@/components";
import { JSX, useState } from "react";
import {LuPlus} from "react-icons/lu"

export const NewGoalButton = ({...props}: ActionButtonProps): JSX.Element => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <ActionButton onClick={() => setIsOpen(true)} {...props}>
                <LuPlus className="w-4 h-4 text-zinc-300" />
            </ActionButton>
            {isOpen && <GoalDialog onClose={() => setIsOpen(false)} />}
        </>
    )
}

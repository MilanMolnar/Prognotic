import {ActionButton, ActionButtonProps, SettingsModal} from "@/components";
import { JSX, useState } from "react";
import {LuSettings} from "react-icons/lu"

export const SettingsButton = ({...props}: ActionButtonProps): JSX.Element => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <ActionButton onClick={() => setIsOpen(true)} {...props}>
                <LuSettings className="w-4 h-4 text-zinc-300" />
            </ActionButton>
            {isOpen && <SettingsModal onClose={() => setIsOpen(false)} />}
        </>
    )
}

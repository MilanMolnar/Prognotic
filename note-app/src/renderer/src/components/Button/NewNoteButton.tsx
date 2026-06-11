import {ActionButton, ActionButtonProps} from "@/components";
import { useNoteActions } from "@renderer/context";
import { JSX } from "react";
import {LuPlus} from "react-icons/lu"

export const NewNoteButton = ({...props}: ActionButtonProps): JSX.Element => {
    const { createEmptyNote } = useNoteActions();

    const handleCreation = async (): Promise<void> => {
        await createEmptyNote();
    }

    return (
        <ActionButton onClick={handleCreation} {...props}>
            <LuPlus className="w-4 h-4 text-zinc-300" />
        </ActionButton>
    )
}
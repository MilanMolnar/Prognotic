import {ActionButton, ActionButtonProps} from "@/components";
import {FaRegTrashAlt} from "react-icons/fa"
import { useNoteActions } from "@renderer/context";
import { JSX } from "react";

export const DeleteNoteButton = ({...props}: ActionButtonProps): JSX.Element => {
    const { deleteNote } = useNoteActions();

    const handleDeletion = async (): Promise<void> => {
       await deleteNote();
    }

    return (
        <ActionButton onClick={handleDeletion} {...props}>
            <FaRegTrashAlt className="w-4 h-4 text-zinc-300" />
        </ActionButton>
    )
}  
import React from "react";
import {ActionButton, ActionButtonProps} from "@/components";
import {FaRegTrashAlt} from "react-icons/fa"

export const DeleteNoteButton = ({...props}: ActionButtonProps) => {
    return (
        <ActionButton {...props}>
            <FaRegTrashAlt className="w-4 h-4 text-zinc-300" />
        </ActionButton>
    )
}  
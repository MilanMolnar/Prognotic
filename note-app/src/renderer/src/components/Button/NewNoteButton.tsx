import {ActionButton, ActionButtonProps} from "@/components";
import {LuPlus} from "react-icons/lu"

export const NewNoteButton = ({...props}: ActionButtonProps) => {
    return (
        <ActionButton {...props}>
            <LuPlus className="w-4 h-4 text-zinc-300" />
        </ActionButton>
    )
}
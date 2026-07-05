import { createContext, useContext } from 'react'

// Open/collapsed state of the two side panels: the goals sidebar (left) and
// the AI assistant chat panel (right), plus the chat panel's resizable width.
export type PanelsState = {
    isLeftPanelOpen: boolean
    isRightPanelOpen: boolean
    rightPanelWidth: number
}

export type PanelsActions = {
    toggleLeftPanel: () => void
    toggleRightPanel: () => void
    setRightPanelWidth: (width: number) => void
}

export const minRightPanelWidth = 220
export const maxRightPanelWidth = 520

export const PanelsStateContext = createContext<PanelsState | null>(null)
export const PanelsActionsContext = createContext<PanelsActions | null>(null)

export const usePanels = (): PanelsState => {
    const state = useContext(PanelsStateContext)
    if (!state) {
        throw new Error('usePanels must be used within a PanelsProvider')
    }
    return state
}

export const usePanelActions = (): PanelsActions => {
    const actions = useContext(PanelsActionsContext)
    if (!actions) {
        throw new Error('usePanelActions must be used within a PanelsProvider')
    }
    return actions
}

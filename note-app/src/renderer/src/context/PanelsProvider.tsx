import React, { useCallback, useMemo, useState } from 'react'
import {
    maxRightPanelWidth,
    minRightPanelWidth,
    PanelsActions,
    PanelsActionsContext,
    PanelsState,
    PanelsStateContext
} from './PanelsContext'

export const PanelsProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
    const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true)
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(true)
    const [rightPanelWidth, setRightPanelWidthState] = useState(400)

    const toggleLeftPanel = useCallback(() => {
        setIsLeftPanelOpen((prev) => !prev)
    }, [])

    const toggleRightPanel = useCallback(() => {
        setIsRightPanelOpen((prev) => !prev)
    }, [])

    const setRightPanelWidth = useCallback((width: number) => {
        setRightPanelWidthState(
            Math.min(maxRightPanelWidth, Math.max(minRightPanelWidth, Math.round(width)))
        )
    }, [])

    const stateValue: PanelsState = useMemo(
        () => ({ isLeftPanelOpen, isRightPanelOpen, rightPanelWidth }),
        [isLeftPanelOpen, isRightPanelOpen, rightPanelWidth]
    )

    const actionsValue: PanelsActions = useMemo(
        () => ({ toggleLeftPanel, toggleRightPanel, setRightPanelWidth }),
        [toggleLeftPanel, toggleRightPanel, setRightPanelWidth]
    )

    return (
        <PanelsStateContext.Provider value={stateValue}>
            <PanelsActionsContext.Provider value={actionsValue}>
                {children}
            </PanelsActionsContext.Provider>
        </PanelsStateContext.Provider>
    )
}

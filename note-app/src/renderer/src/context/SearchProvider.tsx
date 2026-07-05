import React, { useCallback, useMemo, useState } from 'react'
import {
    SearchActions,
    SearchActionsContext,
    SearchState,
    SearchStateContext
} from './SearchContext'

export const SearchProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
    const [isSearchOpen, setIsSearchOpen] = useState(false)
    const [query, setQueryState] = useState('')

    const openSearch = useCallback(() => {
        setIsSearchOpen(true)
    }, [])

    const closeSearch = useCallback(() => {
        setIsSearchOpen(false)
        setQueryState('')
    }, [])

    const setQuery = useCallback((nextQuery: string) => {
        setQueryState(nextQuery)
    }, [])

    const stateValue: SearchState = useMemo(
        () => ({ isSearchOpen, query }),
        [isSearchOpen, query]
    )

    const actionsValue: SearchActions = useMemo(
        () => ({ openSearch, closeSearch, setQuery }),
        [openSearch, closeSearch, setQuery]
    )

    return (
        <SearchStateContext.Provider value={stateValue}>
            <SearchActionsContext.Provider value={actionsValue}>
                {children}
            </SearchActionsContext.Provider>
        </SearchStateContext.Provider>
    )
}

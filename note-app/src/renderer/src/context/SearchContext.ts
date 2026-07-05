import { createContext, useContext } from 'react'

// Context-aware search state shared by the feed header (input), the feed
// (relevance ordering) and the block panel (in-editor highlighting). The
// scope is implied by the view: feed view searches the selected category,
// block edit view searches the open block's content.
export type SearchState = {
    isSearchOpen: boolean
    query: string
}

export type SearchActions = {
    openSearch: () => void
    closeSearch: () => void
    setQuery: (query: string) => void
}

export const SearchStateContext = createContext<SearchState | null>(null)
export const SearchActionsContext = createContext<SearchActions | null>(null)

export const useSearch = (): SearchState => {
    const state = useContext(SearchStateContext)
    if (!state) {
        throw new Error('useSearch must be used within a SearchProvider')
    }
    return state
}

export const useSearchActions = (): SearchActions => {
    const actions = useContext(SearchActionsContext)
    if (!actions) {
        throw new Error('useSearchActions must be used within a SearchProvider')
    }
    return actions
}

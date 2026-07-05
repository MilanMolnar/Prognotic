import { useBlockActions, useBlocks, useGoals, useSearch } from "@renderer/context";
import { fuzzyScore } from "@renderer/utils";
import { BlockMeta } from "@shared/models";
import { useMemo } from "react";

type UseBlockFeedResult = {
    feedBlocks: BlockMeta[] | undefined
    matchIds: ReadonlySet<string>
    isSearching: boolean
    blockContents: Record<string, string>
    openBlockId: string | null
    handleBlockSelect: (id: string | null) => () => void
    handleBlockDelete: (id: string) => () => Promise<void>
}

// Blocks of the selected category in chat order: oldest at the top, newest
// next to the capture bar at the bottom. While searching, fuzzy matches move
// to the top ordered by relevance (best first); the rest keep chat order.
export const useBlockFeed = (): UseBlockFeedResult => {
    const { blocks, blockContents, openBlockId } = useBlocks();
    const { selectedCategory } = useGoals();
    const { isSearchOpen, query } = useSearch();
    const { selectBlock, deleteBlock } = useBlockActions();

    const trimmedQuery = query.trim();
    const isSearching = isSearchOpen && trimmedQuery.length > 0;

    const { feedBlocks, matchIds } = useMemo(() => {
        const categoryBlocks = blocks
            ?.filter((block) => block.category === selectedCategory)
            .sort((a, b) => a.createdAt - b.createdAt);

        if (!categoryBlocks || !isSearching) {
            return { feedBlocks: categoryBlocks, matchIds: new Set<string>() };
        }

        const scored = categoryBlocks.map((block) => ({
            block,
            score: fuzzyScore(trimmedQuery, blockContents[block.id] ?? block.excerpt)
        }));
        const matches = scored
            .filter((entry) => entry.score !== null)
            .sort((a, b) => (b.score as number) - (a.score as number))
            .map((entry) => entry.block);
        const rest = scored.filter((entry) => entry.score === null).map((entry) => entry.block);

        return {
            feedBlocks: [...matches, ...rest],
            matchIds: new Set(matches.map((block) => block.id))
        };
    }, [blocks, blockContents, selectedCategory, isSearching, trimmedQuery]);

    const handleBlockSelect = (id: string | null) => () => {
        selectBlock(id);
    };

    const handleBlockDelete = (id: string) => async (): Promise<void> => {
        await deleteBlock(id);
    };

    return {
        feedBlocks,
        matchIds,
        isSearching,
        blockContents,
        openBlockId,
        handleBlockSelect,
        handleBlockDelete
    };
}

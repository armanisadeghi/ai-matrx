// lib/redux/selectors/promptSelectors.ts
//
// Memoized selector factories for the prompt list system.
//
// All filter, sort, search-scoring, category/tag extraction, and pagination
// logic lives here — not in components. Components call the factory once
// (stable reference across renders when bound to a fixed consumerId) and
// consume the result directly from useAppSelector.
//
// Factory pattern rationale:
//   createSelector(inputA, inputB, resultFn) is memoized PER INSTANCE.
//   If you call makeSelectFilteredPrompts("a") and makeSelectFilteredPrompts("b")
//   each gets its own memoization cache, so consumers never invalidate each other.
//   Call each factory once outside the component (or inside useMemo with a stable
//   consumerId) so React doesn't recreate it on every render.

import { createSelector } from "@reduxjs/toolkit";
import { idMatchesQuery } from "@/utils/search-scoring";
import type { RootState } from "@/lib/redux/store";
import {
  selectAllUserPrompts,
  selectSharedPrompts,
} from "../slices/promptCacheSlice";
import {
  selectConsumer,
  DEFAULT_CONSUMER_STATE,
  NONE_SENTINEL,
} from "../slices/promptConsumersSlice";
import type {
  PromptConsumerState,
  PromptSortOption,
} from "../slices/promptConsumersSlice";
import type { PromptData } from "@/features/prompts/types/core";
import type { SharedPromptRecord } from "../slices/promptCacheSlice";

// ── Constants ─────────────────────────────────────────────────────────────────

export const CARDS_DISPLAY_LIMIT_DESKTOP = 8;
export const CARDS_DISPLAY_LIMIT_MOBILE = 4;
export const LIST_ITEMS_PER_PAGE = 20;

// ── Pure scoring / filtering helpers ─────────────────────────────────────────
// These are pure functions; selectors call them. They live here so components
// never need to re-implement the same logic.

/**
 * Compute a relevance score for a prompt against a lower-cased query string.
 * Higher = more relevant.
 */
export function computeSearchScore(prompt: PromptData, query: string): number {
  const q = query.toLowerCase();
  let score = 0;
  const name = (prompt.name ?? "").toLowerCase();
  const desc = (prompt.description ?? "").toLowerCase();

  if (name === q) score += 10000;
  else if (name.startsWith(q)) score += 5000;
  else if (name.includes(q)) score += 2000;

  if (desc === q) score += 1000;
  else if (desc.includes(q)) score += 500;

  if (prompt.category?.toLowerCase().includes(q)) score += 300;
  if (prompt.tags?.some((t) => t.toLowerCase().includes(q))) score += 300;
  if (prompt.modelId?.toLowerCase().includes(q)) score += 100;
  if (prompt.outputFormat?.toLowerCase().includes(q)) score += 100;
  if (prompt.id?.toLowerCase().includes(q)) score += 50;

  if (
    prompt.messages?.some(
      (m) =>
        m.content?.toLowerCase().includes(q) ||
        m.role?.toLowerCase().includes(q),
    )
  )
    score += 20;

  if (
    prompt.variableDefaults?.some(
      (v) =>
        v.name?.toLowerCase().includes(q) ||
        v.defaultValue?.toLowerCase().includes(q) ||
        v.helpText?.toLowerCase().includes(q),
    )
  )
    score += 10;

  return score;
}

export function matchesSearch(prompt: PromptData, query: string): boolean {
  return computeSearchScore(prompt, query) > 0;
}

export function applySortComparator(
  a: PromptData,
  b: PromptData,
  sortBy: PromptSortOption,
): number {
  switch (sortBy) {
    case "name-asc":
      return (a.name ?? "").localeCompare(b.name ?? "");
    case "name-desc":
      return (b.name ?? "").localeCompare(a.name ?? "");
    case "created-desc":
      return +(b.createdAt ?? 0) - +(a.createdAt ?? 0);
    case "category-asc":
      return (a.category ?? "").localeCompare(b.category ?? "");
    case "updated-desc":
    default:
      return +(b.updatedAt ?? 0) - +(a.updatedAt ?? 0);
  }
}

// ── Input selectors ───────────────────────────────────────────────────────────

/** Returns the consumer state for a given consumerId (stable reference for factories). */
const makeSelectConsumerState =
  (consumerId: string) =>
  (state: RootState): PromptConsumerState =>
    state.promptConsumers?.consumers[consumerId] ?? DEFAULT_CONSUMER_STATE;

// ── Category / tag metadata selectors ────────────────────────────────────────

/**
 * Returns all unique categories across owned prompts, sorted alphabetically.
 * Single shared instance — all consumers see the same category list.
 */
export const selectAllCategories = createSelector(
  selectAllUserPrompts,
  (prompts): string[] => {
    const cats = new Set<string>();
    for (const p of prompts) {
      if (p.category) cats.add(p.category);
    }
    return Array.from(cats).sort();
  },
);

/**
 * Returns all unique tags across owned prompts, sorted alphabetically.
 * Single shared instance — all consumers see the same tag list.
 */
export const selectAllTags = createSelector(
  selectAllUserPrompts,
  (prompts): string[] => {
    const tags = new Set<string>();
    for (const p of prompts) {
      p.tags?.forEach((t) => tags.add(t));
    }
    return Array.from(tags).sort();
  },
);

// ── Filtered / sorted owned prompts ──────────────────────────────────────────

/**
 * Factory: returns a memoized selector that filters and sorts owned prompts
 * according to the given consumer's current state.
 *
 * Call once (outside render or inside useMemo with a stable consumerId):
 *
 * @example
 * const selectFiltered = useMemo(() => makeSelectFilteredPrompts("prompts-main"), []);
 * const filtered = useAppSelector(selectFiltered);
 */
export const makeSelectFilteredPrompts = (consumerId: string) =>
  createSelector(
    selectAllUserPrompts,
    makeSelectConsumerState(consumerId),
    (prompts, consumer): PromptData[] => {
      const {
        searchTerm,
        sortBy,
        includedCats,
        includedTags,
        favFilter,
        archFilter,
        favoritesFirst,
      } = consumer;

      let filtered = prompts.filter((prompt) => {
        if (archFilter === "active" && prompt.isArchived) return false;
        if (archFilter === "archived" && !prompt.isArchived) return false;

        if (favFilter === "yes" && !prompt.isFavorite) return false;
        if (favFilter === "no" && prompt.isFavorite) return false;

        // Category INCLUSION model: empty = show all
        if (includedCats.length > 0) {
          const isUncategorized = !prompt.category;
          if (isUncategorized) {
            if (!includedCats.includes(NONE_SENTINEL)) return false;
          } else {
            if (!includedCats.includes(prompt.category!)) return false;
          }
        }

        // Tag INCLUSION model: empty = show all
        if (includedTags.length > 0) {
          const isUntagged = !prompt.tags?.length;
          if (isUntagged) {
            if (!includedTags.includes(NONE_SENTINEL)) return false;
          } else {
            if (!prompt.tags?.some((t) => includedTags.includes(t)))
              return false;
          }
        }

        if (searchTerm && !matchesSearch(prompt, searchTerm)) return false;

        return true;
      });

      if (searchTerm) {
        // Sort by relevance score, tie-break with chosen sort
        const scores = new Map<string, number>();
        filtered.forEach((p) => {
          if (p.id) scores.set(p.id, computeSearchScore(p, searchTerm));
        });

        filtered.sort((a, b) => {
          const sa = a.id ? (scores.get(a.id) ?? 0) : 0;
          const sb = b.id ? (scores.get(b.id) ?? 0) : 0;
          if (sb !== sa) return sb - sa;
          return applySortComparator(a, b, sortBy);
        });
      } else {
        filtered.sort((a, b) => {
          if (favoritesFirst && favFilter === "all") {
            const aFav = a.isFavorite ? 1 : 0;
            const bFav = b.isFavorite ? 1 : 0;
            if (bFav !== aFav) return bFav - aFav;
          }
          return applySortComparator(a, b, sortBy);
        });
      }

      return filtered;
    },
  );

// ── Filtered / sorted shared prompts ─────────────────────────────────────────

/**
 * Factory: returns a memoized selector for shared prompts filtered by the
 * consumer's search term and sorted by name.
 */
export const makeSelectFilteredSharedPrompts = (consumerId: string) =>
  createSelector(
    selectSharedPrompts,
    makeSelectConsumerState(consumerId),
    (sharedPrompts, consumer): SharedPromptRecord[] => {
      const { searchTerm, sortBy } = consumer;

      let filtered = sharedPrompts.filter((prompt) => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return (
          prompt.name.toLowerCase().includes(q) ||
          (prompt.description &&
            prompt.description.toLowerCase().includes(q)) ||
          (prompt.ownerEmail && prompt.ownerEmail.toLowerCase().includes(q)) ||
          idMatchesQuery(prompt, q)
        );
      });

      filtered.sort((a, b) => {
        switch (sortBy) {
          case "name-asc":
            return a.name.localeCompare(b.name);
          case "name-desc":
            return b.name.localeCompare(a.name);
          default:
            return 0;
        }
      });

      return filtered;
    },
  );

// ── Card / list split ─────────────────────────────────────────────────────────

/**
 * Factory: slices filtered owned prompts into the "cards" section.
 * Depends on makeSelectFilteredPrompts for the given consumer.
 */
export const makeSelectPromptCards = (
  consumerId: string,
  isMobile: boolean,
) => {
  const selectFiltered = makeSelectFilteredPrompts(consumerId);
  const limit = isMobile
    ? CARDS_DISPLAY_LIMIT_MOBILE
    : CARDS_DISPLAY_LIMIT_DESKTOP;
  return createSelector(selectFiltered, (filtered): PromptData[] =>
    filtered.slice(0, limit),
  );
};

/**
 * Factory: returns the paginated subset of list-items for owned prompts
 * (i.e. everything after the cards section, paginated by listPage).
 */
export const makeSelectPromptListItems = (
  consumerId: string,
  isMobile: boolean,
) => {
  const selectFiltered = makeSelectFilteredPrompts(consumerId);
  const limit = isMobile
    ? CARDS_DISPLAY_LIMIT_MOBILE
    : CARDS_DISPLAY_LIMIT_DESKTOP;
  return createSelector(
    selectFiltered,
    makeSelectConsumerState(consumerId),
    (
      filtered,
      consumer,
    ): { items: PromptData[]; hasMore: boolean; totalAfterCards: number } => {
      const afterCards = filtered.slice(limit);
      const pageEnd = consumer.listPage * LIST_ITEMS_PER_PAGE;
      const items = afterCards.slice(0, pageEnd);
      return {
        items,
        hasMore: items.length < afterCards.length,
        totalAfterCards: afterCards.length,
      };
    },
  );
};

/**
 * Factory: slices filtered shared prompts into the "cards" section.
 */
export const makeSelectSharedPromptCards = (
  consumerId: string,
  isMobile: boolean,
) => {
  const selectFiltered = makeSelectFilteredSharedPrompts(consumerId);
  const limit = isMobile
    ? CARDS_DISPLAY_LIMIT_MOBILE
    : CARDS_DISPLAY_LIMIT_DESKTOP;
  return createSelector(selectFiltered, (filtered): SharedPromptRecord[] =>
    filtered.slice(0, limit),
  );
};

/**
 * Factory: returns the paginated subset of list-items for shared prompts.
 */
export const makeSelectSharedPromptListItems = (
  consumerId: string,
  isMobile: boolean,
) => {
  const selectFiltered = makeSelectFilteredSharedPrompts(consumerId);
  const limit = isMobile
    ? CARDS_DISPLAY_LIMIT_MOBILE
    : CARDS_DISPLAY_LIMIT_DESKTOP;
  return createSelector(
    selectFiltered,
    makeSelectConsumerState(consumerId),
    (
      filtered,
      consumer,
    ): {
      items: SharedPromptRecord[];
      hasMore: boolean;
      totalAfterCards: number;
    } => {
      const afterCards = filtered.slice(limit);
      const pageEnd = consumer.sharedPage * LIST_ITEMS_PER_PAGE;
      const items = afterCards.slice(0, pageEnd);
      return {
        items,
        hasMore: items.length < afterCards.length,
        totalAfterCards: afterCards.length,
      };
    },
  );
};

// ── Convenience count selectors ───────────────────────────────────────────────

/** Factory: total count of filtered owned prompts for a consumer. */
export const makeSelectFilteredPromptsCount = (consumerId: string) => {
  const selectFiltered = makeSelectFilteredPrompts(consumerId);
  return createSelector(selectFiltered, (filtered) => filtered.length);
};

/** Factory: total count of filtered shared prompts for a consumer. */
export const makeSelectFilteredSharedPromptsCount = (consumerId: string) => {
  const selectFiltered = makeSelectFilteredSharedPrompts(consumerId);
  return createSelector(selectFiltered, (filtered) => filtered.length);
};

// ── Consumer state convenience selectors ─────────────────────────────────────

/** Returns whether a consumer has any non-default filters active. */
export const makeSelectConsumerHasActiveFilters = (consumerId: string) =>
  createSelector(
    makeSelectConsumerState(consumerId),
    (consumer): boolean =>
      consumer.tab !== DEFAULT_CONSUMER_STATE.tab ||
      consumer.sortBy !== DEFAULT_CONSUMER_STATE.sortBy ||
      consumer.searchTerm !== "" ||
      consumer.includedCats.length > 0 ||
      consumer.includedTags.length > 0 ||
      consumer.favFilter !== DEFAULT_CONSUMER_STATE.favFilter ||
      consumer.archFilter !== DEFAULT_CONSUMER_STATE.archFilter ||
      consumer.favoritesFirst !== DEFAULT_CONSUMER_STATE.favoritesFirst,
  );

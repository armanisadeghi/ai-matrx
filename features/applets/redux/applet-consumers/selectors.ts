// features/applets/redux/applet-consumers/selectors.ts
//
// Memoized selector factories for the applet list system.
//
// All filter, sort, search-scoring, category/tag extraction, and
// pagination logic lives here — not in components. Components call the
// factory once (stable reference across renders when bound to a fixed
// consumerId) and consume the result directly from useAppSelector.
//
// Extensibility:
//   - To add a new FILTER dimension: append a predicate to FILTER_PREDICATES.
//     Each predicate gets `(app, ctx)` and returns true to keep the row.
//     `ctx` carries the consumer state plus any joined data (e.g.
//     agents-by-id) the predicate might need.
//   - To add a new SORT dimension: add a key to AppletSortOption + an
//     entry to SORT_COMPARATORS. The factory picks the comparator by enum.
//   - To add a new SEARCH-SCORE field: extend computeAppSearchScore.
// Adding a dimension is a single-spot edit in each direction.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type {
  AppletRow,
  AppletDefinition,
} from "@/features/agents/redux/applets/types";
import { selectAllApps } from "@/features/agents/redux/applets/selectors";
import { appletJobs } from "@/features/applets/types";
import { isOpenEntry, readBuildRequests } from "@/features/applets-host/builder/build-session";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  DEFAULT_APPLET_CONSUMER_STATE,
  APPLET_NONE_SENTINEL,
} from "./slice";
import type {
  AppletConsumerState,
  AppletSortOption,
} from "./slice";

// ── Constants ──────────────────────────────────────────────────────────────────

export const APP_CARDS_LIMIT_DESKTOP = 8;
export const APP_CARDS_LIMIT_MOBILE = 4;
export const APP_LIST_ITEMS_PER_PAGE = 20;

// ── Joined "card model" the UI consumes ────────────────────────────────────────
// We don't mutate the slice record; we project a card-shaped view that joins
// in the agent name + ownership flag so cards / list items render cheaply
// and so the search/sort code can reach the agent name in one place.

export interface AppletCardModel {
  // Identity
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;

  // Classification
  category: string | null;
  tags: string[];

  // The jobs the Applet runs (mandate keys)
  job_keys: string[];

  // Status & web state
  status: AppletRow["status"];
  published_to_web: AppletRow["published_to_web"];
  is_featured: boolean | null;
  is_verified: boolean | null;

  // Stats
  total_executions: number | null;
  success_rate: number | null;
  avg_execution_time_ms: number | null;
  total_cost: number | null;
  unique_users_count: number | null;
  last_execution_at: string | null;

  // Metadata for ownership / scope
  created_by: string | null;
  organization_id: string | null;
  isOwner: boolean;

  // Timestamps
  created_at: string;
  updated_at: string;
  published_at: string | null;

  // Display
  preview_image_url: string | null;
  favicon_url: string | null;

  /** A build request is still running — the card opens the build at /applets/build/<id>. */
  build_open: boolean;
}

// ── Pure scoring / search helpers ─────────────────────────────────────────────

export function computeAppSearchScore(
  app: AppletCardModel,
  query: string,
): number {
  const q = query.toLowerCase();
  let score = 0;

  const name = (app.name ?? "").toLowerCase();
  const tagline = (app.tagline ?? "").toLowerCase();
  const desc = (app.description ?? "").toLowerCase();
  const slug = (app.slug ?? "").toLowerCase();

  if (name === q) score += 10000;
  else if (name.startsWith(q)) score += 5000;
  else if (name.includes(q)) score += 2000;

  if (tagline.includes(q)) score += 800;
  if (desc.includes(q)) score += 500;
  if (slug.includes(q)) score += 400;

  if (app.category?.toLowerCase().includes(q)) score += 300;
  if (app.tags?.some((t) => t.toLowerCase().includes(q))) score += 300;

  if (app.job_keys.some((k) => k.toLowerCase().includes(q))) score += 600;

  // App ID exact match
  if (app.id?.toLowerCase() === q) score += 100000;

  return score;
}

export function appMatchesSearch(
  app: AppletCardModel,
  query: string,
): boolean {
  return computeAppSearchScore(app, query) > 0;
}

// ── Sort comparators ──────────────────────────────────────────────────────────

type Comparator = (a: AppletCardModel, b: AppletCardModel) => number;

const SORT_COMPARATORS: Record<AppletSortOption, Comparator> = {
  "updated-desc": (a, b) =>
    +new Date(b.updated_at ?? 0) - +new Date(a.updated_at ?? 0),
  "created-desc": (a, b) =>
    +new Date(b.created_at ?? 0) - +new Date(a.created_at ?? 0),
  "name-asc": (a, b) => (a.name ?? "").localeCompare(b.name ?? ""),
  "name-desc": (a, b) => (b.name ?? "").localeCompare(a.name ?? ""),
  "category-asc": (a, b) =>
    (a.category ?? "").localeCompare(b.category ?? ""),
  "executions-desc": (a, b) =>
    (b.total_executions ?? 0) - (a.total_executions ?? 0),
  "last-run-desc": (a, b) =>
    +new Date(b.last_execution_at ?? 0) -
    +new Date(a.last_execution_at ?? 0),
};

export function applyAppSortComparator(
  a: AppletCardModel,
  b: AppletCardModel,
  sortBy: AppletSortOption,
): number {
  return (SORT_COMPARATORS[sortBy] ?? SORT_COMPARATORS["updated-desc"])(a, b);
}

// ── Filter predicates ─────────────────────────────────────────────────────────
// Each predicate returns true to KEEP the row. To add a new filter dimension:
//   1. Add the field to AppletConsumerState in slice.ts.
//   2. Add a predicate here.
//   3. Append it to FILTER_PREDICATES.

interface FilterContext {
  consumer: AppletConsumerState;
  currentUserId: string | null;
}

type FilterPredicate = (
  app: AppletCardModel,
  ctx: FilterContext,
) => boolean;

const matchesTab: FilterPredicate = (app, { consumer, currentUserId }) => {
  if (consumer.tab === "all") return true;
  const ownedByMe = currentUserId != null && app.created_by === currentUserId;
  if (consumer.tab === "mine") return ownedByMe;
  if (consumer.tab === "shared") return !ownedByMe;
  return true;
};

const matchesArchive: FilterPredicate = (app, { consumer }) => {
  // status enum: "draft" | "published" | "archived" | "suspended"
  const isArchived = app.status === "archived";
  if (consumer.archFilter === "active") return !isArchived;
  if (consumer.archFilter === "archived") return isArchived;
  return true; // "both"
};

const matchesVisibility: FilterPredicate = (app, { consumer }) => {
  if (consumer.visibilityFilter === "all") return true;
  if (consumer.visibilityFilter === "public") return app.published_to_web;
  if (consumer.visibilityFilter === "personal") return !app.published_to_web;
  return true;
};

const matchesCategories: FilterPredicate = (app, { consumer }) => {
  if (consumer.includedCats.length === 0) return true;
  const isUncategorized = !app.category;
  if (isUncategorized) {
    return consumer.includedCats.includes(APPLET_NONE_SENTINEL);
  }
  return consumer.includedCats.includes(app.category!);
};

const matchesTags: FilterPredicate = (app, { consumer }) => {
  if (consumer.includedTags.length === 0) return true;
  const isUntagged = !app.tags?.length;
  if (isUntagged) {
    return consumer.includedTags.includes(APPLET_NONE_SENTINEL);
  }
  return app.tags!.some((t) => consumer.includedTags.includes(t));
};

const matchesSearch: FilterPredicate = (app, { consumer }) =>
  consumer.searchTerm === "" || appMatchesSearch(app, consumer.searchTerm);

const FILTER_PREDICATES: FilterPredicate[] = [
  matchesTab,
  matchesArchive,
  matchesVisibility,
  matchesCategories,
  matchesTags,
  matchesSearch,
];

// ── Input selector factory (stable per consumerId) ────────────────────────────

const makeSelectAppletConsumerState =
  (consumerId: string) =>
  (state: RootState): AppletConsumerState =>
    state.appletConsumers?.consumers[consumerId] ??
    DEFAULT_APPLET_CONSUMER_STATE;

const selectCurrentUserId = (state: RootState): string | null =>
  selectUserId(state);

// ── Card models ──────────────────────────────────────────────────────────────

/**
 * Project all live Applet records into card models (with their job keys).
 * Stable reference until apps
 * change.
 */
export const selectAllAppCardModels = createSelector(
  selectAllApps,
  selectCurrentUserId,
  (
    appsById,
    currentUserId,
  ): AppletCardModel[] => {
    const models: AppletCardModel[] = [];
    for (const id of Object.keys(appsById)) {
      const r = appsById[id] as AppletDefinition;
      models.push({
        id: r.id,
        slug: r.slug,
        name: r.name,
        tagline: r.tagline,
        description: r.description,
        category: r.category,
        tags: r.tags ?? [],
        job_keys: appletJobs(r).map((j) => j.key),
        status: r.status,
        published_to_web: r.published_to_web,
        is_featured: r.is_featured,
        is_verified: r.is_verified,
        total_executions: r.total_executions,
        success_rate: r.success_rate,
        avg_execution_time_ms: r.avg_execution_time_ms,
        total_cost: r.total_cost,
        unique_users_count: r.unique_users_count,
        last_execution_at: r.last_execution_at,
        created_by: r.created_by,
        organization_id: r.organization_id,
        isOwner:
          currentUserId != null && r.created_by === currentUserId ? true : false,
        created_at: r.created_at,
        updated_at: r.updated_at,
        published_at: r.published_at,
        preview_image_url: r.preview_image_url,
        favicon_url: r.favicon_url,
        build_open: isOpenEntry(readBuildRequests(r.metadata).at(-1)),
      });
    }
    return models;
  },
);

// ── Derived metadata (categories, tags) ────────────────────────

export const selectAllAppCategories = createSelector(
  selectAllAppCardModels,
  (models): string[] => {
    const cats = new Set<string>();
    for (const m of models) if (m.category) cats.add(m.category);
    return Array.from(cats).sort();
  },
);

export const selectAllAppTags = createSelector(
  selectAllAppCardModels,
  (models): string[] => {
    const tags = new Set<string>();
    for (const m of models) m.tags?.forEach((t) => tags.add(t));
    return Array.from(tags).sort();
  },
);

// ── Filtered + sorted apps ────────────────────────────────────────────────────

export const makeSelectFilteredApps = (consumerId: string) =>
  createSelector(
    selectAllAppCardModels,
    makeSelectAppletConsumerState(consumerId),
    selectCurrentUserId,
    (models, consumer, currentUserId): AppletCardModel[] => {
      const ctx: FilterContext = { consumer, currentUserId };

      const filtered = models.filter((m) =>
        FILTER_PREDICATES.every((pred) => pred(m, ctx)),
      );

      // ── Sort ──
      if (consumer.searchTerm) {
        const scores = new Map<string, number>();
        filtered.forEach((m) => {
          scores.set(m.id, computeAppSearchScore(m, consumer.searchTerm));
        });
        filtered.sort((a, b) => {
          const sa = scores.get(a.id) ?? 0;
          const sb = scores.get(b.id) ?? 0;
          if (sb !== sa) return sb - sa;
          return applyAppSortComparator(a, b, consumer.sortBy);
        });
      } else {
        filtered.sort((a, b) =>
          applyAppSortComparator(a, b, consumer.sortBy),
        );
      }

      return filtered;
    },
  );

// ── Card / list split ─────────────────────────────────────────────────────────

export const makeSelectAppCards = (consumerId: string, isMobile: boolean) => {
  const selectFiltered = makeSelectFilteredApps(consumerId);
  const limit = isMobile ? APP_CARDS_LIMIT_MOBILE : APP_CARDS_LIMIT_DESKTOP;
  return createSelector(selectFiltered, (filtered): AppletCardModel[] =>
    filtered.slice(0, limit),
  );
};

export const makeSelectAppListItems = (
  consumerId: string,
  isMobile: boolean,
) => {
  const selectFiltered = makeSelectFilteredApps(consumerId);
  const limit = isMobile ? APP_CARDS_LIMIT_MOBILE : APP_CARDS_LIMIT_DESKTOP;
  return createSelector(
    selectFiltered,
    makeSelectAppletConsumerState(consumerId),
    (
      filtered,
      consumer,
    ): {
      items: AppletCardModel[];
      hasMore: boolean;
      totalAfterCards: number;
    } => {
      const afterCards = filtered.slice(limit);
      const pageEnd = consumer.listPage * APP_LIST_ITEMS_PER_PAGE;
      const items = afterCards.slice(0, pageEnd);
      return {
        items,
        hasMore: afterCards.length > items.length,
        totalAfterCards: afterCards.length,
      };
    },
  );
};

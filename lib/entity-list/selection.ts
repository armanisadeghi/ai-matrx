// lib/entity-list/selection.ts
//
// BULK SELECTION — the vocabulary half. Types and pure functions only, so the
// three-way meaning of "select all" can be tested without a DOM.
//
// 🚨 WHY THIS EXISTS. Every EntityListPage surface could sort, search, facet
// and page a server-side corpus, and not one of them could act on more than
// one row at a time: a person clearing 40 internal machine runs off
// /work/conversations opened forty kebabs. `MatrxDataTable` has carried a
// `selection` contract since 0.13 (checkbox column, shift-click range, page
// select-all, bulk bar, phone-card controls) and no entity-list surface ever
// passed it, because the shell had nowhere for a surface to DECLARE what a
// bulk action is. That declaration is `EntityListConfig.bulkActions`, and this
// file is what it is made of.
//
// THE HONEST THREE-WAY SELECT-ALL (Gmail's banner, and the reason this file has
// a `mode` at all). A header checkbox over a SERVER-PAGED list can only mean
// "these N on screen". A person who ticks it while looking at 25 of 4,613 rows
// and then presses Delete means something else, and every list that quietly
// serves the first meaning is one click from a disaster it invited. So the two
// meanings are separate, named, and visible:
//
//   ids       the ids that are actually ticked. Survives sort, filter, search
//             and pagination — a selection is the user's, not the page's.
//   matching  every row the CURRENT query matches, which the shell resolves
//             into real ids by paging the surface's own service, announced
//             while it runs and cancellable. The captured filter travels with
//             it, so a surface with a server-side bulk verb can use the
//             DESCRIPTOR and never see the ids at all.
//
// `matching` decays to `ids` the moment the live query stops matching the
// captured one (see `bulkSelectionMode`): the ids stay selected — they really
// are — but nothing on screen goes on claiming they are "everything matching",
// which after a filter change would be false.

import type { ComponentType } from "react";
import type { ListScope } from "@/lib/list-scope/types";
import type { ArchivedFilter, EntityFilters, EntityListQuery } from "./types";

/**
 * THE FILTER DESCRIPTOR — what the user is looking at, without the page.
 *
 * This is the whole point of `mode: "matching"`: a bulk handler that owns a
 * server-side verb (`trx_bulk_archive(p_filters …)`) should send THIS, not
 * 4,613 ids over the wire. Deliberately carries no `page` and no sort: a bulk
 * action is not paginated and does not care what order the rows were in.
 */
export interface EntityBulkFilter {
  scope: ListScope;
  search: string;
  deep: boolean;
  archived: ArchivedFilter;
  filters: EntityFilters;
}

/** The query's narrowing axes, with paging dropped. */
export function bulkFilterFromQuery(query: EntityListQuery): EntityBulkFilter {
  return {
    scope: query.scope,
    search: query.search,
    deep: query.deep,
    archived: query.archived,
    filters: query.filters,
  };
}

/**
 * A stable identity for a descriptor. Used to notice that the thing an
 * "everything matching" claim was made against has changed — key equality, not
 * reference equality, because every one of these objects is rebuilt per render.
 */
export function bulkFilterKey(filter: EntityBulkFilter): string {
  return JSON.stringify([
    filter.scope,
    filter.search,
    filter.deep,
    filter.archived,
    // Object key order is insertion order, and the filter bag is rebuilt on
    // every change, so the entries are sorted before they become an identity.
    Object.entries(filter.filters).sort(([a], [b]) => (a < b ? -1 : 1)),
  ]);
}

export type EntityBulkMode = "ids" | "matching";

/**
 * WHICH MEANING IS TRUE RIGHT NOW.
 *
 * `matching` only survives while the live query still equals the one the claim
 * was made against. A user who selects all 4,613 and then types in the search
 * box still has 4,613 rows selected (that is what they ticked) but is no longer
 * looking at "everything that matches", so the banner stops saying so.
 */
export function bulkSelectionMode(
  matchedFilterKey: string | null,
  liveFilterKey: string,
): EntityBulkMode {
  return matchedFilterKey !== null && matchedFilterKey === liveFilterKey
    ? "matching"
    : "ids";
}

/**
 * WHAT A BULK HANDLER RECEIVES.
 *
 * Both representations are ALWAYS present, and `mode` says which one the person
 * meant. That is deliberate: an either/or union would force every surface to
 * implement a server-side bulk verb before it could offer a single bulk button,
 * and the first thing most surfaces need is "do the per-row thing 3 times".
 */
export interface EntityBulkSelection<TRow> {
  /** What the person meant. See `bulkSelectionMode`. */
  mode: EntityBulkMode;
  /** Every selected id. In `matching` mode, resolved from the server. */
  ids: string[];
  /**
   * The selected rows THE LIST HOLDS. In `ids` mode a selection outlives a page
   * change, so this can be a strict subset of `ids` — check `rows.length`
   * before assuming a row object exists for every id. In `matching` mode it is
   * every resolved row, because resolving them is how the ids were found.
   */
  rows: TRow[];
  /** `ids.length`. The number on the bar, and the number to name in a confirm. */
  count: number;
  /** The query the selection was taken against. See `EntityBulkFilter`. */
  filter: EntityBulkFilter;
}

/** What a confirm must say before an expensive or destructive bulk click. */
export interface EntityBulkActionConfirm {
  title: string;
  /**
   * 🚨 NAMES THE CONSEQUENCE — what is lost, duplicated, spent or sent, and how
   * many times. A generic "Are you sure?" fails the destructive-and-expensive
   * click law (`common-docs/policies/destructive-and-expensive-actions.md`).
   */
  description: string;
  confirmLabel?: string;
  variant?: "default" | "destructive";
}

/** What an action tells the shell to do with the list once it succeeded. */
export interface EntityBulkActionResult {
  /** Success sentence. Absent → the shell says the action's own label ran. */
  message?: string;
  /** Rows that are gone, dropped locally instead of a full refetch flash. */
  removedIds?: string[];
  /** Re-ask the server for rows, counts and facets. */
  refresh?: boolean;
  /** Keep the selection. Default is to clear it — the work is done. */
  keepSelection?: boolean;
}

/**
 * ONE BULK ACTION, declared by the surface.
 *
 * Feature-specific fields are forbidden here for the same reason they are
 * forbidden in `EntityListConfig`: the shell renders the button, owns the
 * pending state, the confirm, the toast and the selection lifecycle, and the
 * surface owns only what the verb DOES.
 */
export interface EntityBulkAction<TRow> {
  /** Stable id. Used for the button key and its pending state. */
  id: string;
  label: string;
  /** Lucide icon component (never an emoji — repo UI standard). */
  icon?: ComponentType<{ className?: string }>;
  variant?: "default" | "outline" | "destructive";
  /**
   * Stop and name the consequence first. REQUIRED in spirit for anything
   * destructive or expensive; returning a confirm is how an action opts in.
   */
  confirm?: (
    selection: EntityBulkSelection<TRow>,
  ) => EntityBulkActionConfirm | null;
  /**
   * 🚨 RESOLVING WITH NOTHING MEANS THE ACTION DID NOT RUN. An action whose
   * verb is a dialog resolves `void`/`undefined` when the person cancels — the
   * shell then KEEPS the selection and says nothing, exactly as it does when
   * the action throws. An action that DID work returns a result object, even
   * an empty one, which is what opts it into the default success toast and the
   * default "clear the selection, the work is done" behaviour.
   */
  run: (
    selection: EntityBulkSelection<TRow>,
  ) => Promise<EntityBulkActionResult | void> | EntityBulkActionResult | void;
}

/** The modifiers around `config.bulkActions`. Every field optional. */
export interface EntityBulkSelectionConfig<TRow> {
  /**
   * Singular noun for the bar's count and the banner's sentences. Defaults to
   * `entityLabel.singular`, which is usually right.
   */
  noun?: string;
  /**
   * A row no bulk action can touch renders NO checkbox at all — not a greyed
   * one (the fourth law; the table enforces it).
   */
  isRowSelectable?: (row: TRow) => boolean;
  /**
   * Offer "select all M matching this filter". Default FALSE, because it is a
   * real promise: the shell will page the surface's own service until it holds
   * every matching row. A surface whose corpus is enormous and whose bulk verbs
   * are per-row says nothing, and the banner then states plainly that only the
   * rows on screen are selected instead of implying more.
   */
  selectAllMatching?: boolean;
}

/**
 * How many rows one resolution request asks for.
 *
 * A TRANSPORT BATCH, NOT A PRODUCT LIMIT (so not a knob): resolving stops when
 * the server's own `total` is reached, whatever that total is, and the user can
 * cancel at any point. Big enough that a normal list is one or two requests.
 */
export const BULK_RESOLVE_PAGE_SIZE = 500;

/** Plural-aware "3 transcripts" / "1 transcript". */
export function bulkCountLabel(count: number, noun: string): string {
  return `${count.toLocaleString()} ${count === 1 ? noun : `${noun}s`}`;
}

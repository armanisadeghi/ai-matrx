"use client";

// lib/entity-list/components/EntityListPage.tsx
//
// The canonical feature-entry list page, proven on /agents/all. One
// `<EntityListPage config={...} />` per surface — the feature supplies a
// config (service, columns, scopes, actions hook, views) and slots (header
// actions, notice, empty action); the shell owns everything else.
//
// Two halves, deliberately separate:
//   STYLE (view, density, sort, page size, columns) → useListViewPrefs,
//     persisted per user and synced across devices.
//   QUERY (scope, search, filters, page) → useEntityList, always starts clean.

import { useEffect, useRef, type ReactNode } from "react";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import {
  SurfaceRuntimeProvider,
  type SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemContextMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import { commitUrlParams } from "@ai-matrx/kit/url-state";
import { useListSearchParams } from "../useListSearchParams";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import { defaultHiddenColumns } from "../columns";
import type { ListScope, ListScopeKind } from "@/lib/list-scope/types";
import type { EntityListConfig, EntityListController } from "../config";
import { useEntityList } from "../useEntityList";
import {
  ENTITY_LIST_URL_PARAMS,
  readSortFromParams,
  sortToParamPatch,
} from "../urlQuery";
import { entityListRowHref } from "../doors";
import { countActiveFilters } from "../types";
import { EditRowRegistry } from "../editRowRegistry";
import { EntityScopeTabs } from "./EntityScopeTabs";
import { EntityListToolbar } from "./EntityListToolbar";
import { EntityListTable } from "./EntityListTable";
import {
  EntityBulkActions,
  EntityBulkSelectAllBanner,
  EntityCardsSelectAll,
} from "./EntityBulkBar";
import { useEntityListSelection } from "../useEntityListSelection";
import type { MatrxDataTableSelectionConfig } from "@ai-matrx/design-system/data-table/types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { EntitySourceFailures } from "./EntitySourceFailures";

const EMPTY_ITEM_MENU_CONFIG: ItemMenuConfig = { sections: [] };

/**
 * Bind an agent surface to a list page.
 *
 * A list surface has exactly one honest set of values — what is on screen, in
 * which scope, out of what total — and every list page would otherwise hand-roll
 * a `SurfaceRuntimeProvider` around a copy of state the shell already holds and
 * the page does not. So the shell offers it: name the surface, map the live
 * controller to its manifest values, done. The scope is built at Run time only
 * (never on mount), so this costs a page that never launches an agent nothing.
 */
export interface EntityListSurfaceController<
  TRow,
> extends EntityListController<TRow> {
  /** The exact persisted view state the list currently renders. */
  view: Pick<
    ListViewPrefs,
    "sort" | "direction" | "favoritesFirst" | "pageSize"
  >;
  /** Apply view changes through the same preference/URL path as the toolbar. */
  patchView: (patch: Partial<ListViewPrefs>) => void;
}

export interface EntityListSurface<TRow> {
  /** Canonical `ui_surface.name`, from the feature's manifest. */
  surfaceName: string;
  /** Live manifest values, read from the same controller the list renders. */
  getScope: (list: EntityListSurfaceController<TRow>) => SurfaceScopePayload;
  /** Optional handlers for manifest-declared writes into this list's UI. */
  getWriteHandlers?: (
    list: EntityListSurfaceController<TRow>,
  ) => SurfaceWriteHandlers;
}

export interface EntityListPageProps<TRow> {
  config: EntityListConfig<TRow>;
  /**
   * Banner slot above the tabs (a dismissible migration notice, or a control
   * that narrows the list). A function receives the live controller, so a
   * surface can put a first-class query control up there — /work/conversations
   * uses it for the door to the internal machine runs its default hides —
   * without hand-rolling a second copy of the query state.
   */
  notice?: ReactNode | ((list: EntityListController<TRow>) => ReactNode);
  /**
   * Buttons on the right of the scope tabs (New, secondary destinations). A
   * function receives the live controller, so a surface whose primary action
   * depends on the ACTIVE SCOPE — "New agent" means a system agent while the
   * System tab is selected — reads it from the one query state instead of
   * keeping a second copy.
   */
  headerActions?: ReactNode | ((list: EntityListController<TRow>) => ReactNode);
  /**
   * Action rendered inside the empty state (usually the New button again).
   * Takes the same render-prop form as `headerActions` and for the same
   * reason — it is normally the SAME button.
   */
  emptyAction?: ReactNode | ((list: EntityListController<TRow>) => ReactNode);
  /** Agent surface this list emits its live values to (manifest-backed). */
  surface?: EntityListSurface<TRow>;
  /**
   * The scopes to render, overriding `config.scopes`. Only a page can decide a
   * scope that depends on WHO is looking — `system` is Matrx-admin only — and
   * a module-constant config cannot read auth state. Values still come from
   * the shared vocabulary; this is which subset, never a new one.
   */
  scopes?: ListScopeKind[];
  /**
   * Where this page STARTS when that is not "Mine" — e.g. the admin System
   * Agents route, whose whole shell is already about the platform corpus.
   * The tabs still switch away from it.
   */
  defaultScope?: ListScope;
  /**
   * Whether the static top chrome must clear the glass shell header.
   *
   * TRUE on `(core)`, where `.shell-main` is pulled up under a transparent
   * header and content scrolls behind it — the padding is what keeps the scope
   * tabs reachable. FALSE under `/administration`, where `styles/shell.css`
   * cancels that pull and the content already begins below the header; padding
   * there is pure dead space above the tabs.
   */
  clearsShellHeader?: boolean;
  /**
   * FALSE renders no scope tabs at all — for a list with ONE corpus and no
   * scope separation, such as an admin MANAGEMENT page, which shows only the
   * platform's own records (Arman, 2026-09-26). The page still queries its one
   * scope; there is simply no choice to draw.
   */
  scopeTabs?: boolean;
}

export function EntityListPage<TRow>({
  config,
  notice,
  headerActions,
  emptyAction,
  surface,
  scopes,
  defaultScope,
  clearsShellHeader = true,
  scopeTabs = true,
}: EntityListPageProps<TRow>) {
  const visibleScopes = scopes ?? config.scopes;
  // 🚨 THE URL IS THE QUERY ON EVERY LIST PAGE (default ON since 2026-09-26).
  // It used to be opt-in, and `/agents/all` and `/workflows/all` never opted
  // in: `?scope=mine&q=seo` was ignored, the late registry default flipped
  // the untouched scope to My Orgs, and Back restored nothing. A list page is
  // a page — its lane and filters belong in its address. `urlState: false`
  // is the explicit opt-out for a list that is NOT the page's own query.
  const urlState = config.urlState !== false;
  const defaultHidden = defaultHiddenColumns(config.columns);
  const { prefs, setPrefs, reset } = useListViewPrefs(config.surfaceKey, {
    version: config.prefsVersion,
    hiddenColumns: defaultHidden,
    ...config.prefsDefaults,
  });

  // Sort is STYLE (persisted per user), but it is also the one style axis a
  // SHARED LINK has to carry — "look at this list, newest first" is worthless
  // if the recipient's stored preference silently re-sorts it. So on a
  // URL-backed surface the URL wins when present, and writing a sort updates
  // both: the link stays truthful and the preference still persists.
  const urlParams = useListSearchParams();
  const prefsSort = { sort: prefs.sort, direction: prefs.direction };
  const effectiveSort = urlState
    ? readSortFromParams(urlParams, prefsSort)
    : prefsSort;

  // The explicit boolean sort is the grouping setting, including shared URLs.
  const effectiveFavoritesFirst =
    config.favorite && effectiveSort.sort === "favorite"
      ? effectiveSort.direction === "desc"
      : prefs.favoritesFirst;

  const commitSort = (next: { sort: string; direction: "asc" | "desc" }) => {
    // An explicit favorite sort must also update the grouping preference;
    // otherwise its server-side priority silently defeats ascending order.
    setPrefs({
      ...next,
      ...(config.favorite && next.sort === "favorite"
        ? { favoritesFirst: next.direction === "desc" }
        : {}),
    });
    if (urlState) {
      commitUrlParams(sortToParamPatch(next), "push");
    }
  };

  const patchView = (patch: Partial<ListViewPrefs>) => {
    const nextSort = patch.sort ?? effectiveSort.sort;
    const nextDirection =
      config.favorite &&
      nextSort === "favorite" &&
      patch.favoritesFirst !== undefined
        ? patch.favoritesFirst
          ? "desc"
          : "asc"
        : (patch.direction ?? effectiveSort.direction);
    const sortChanged =
      patch.sort !== undefined ||
      patch.direction !== undefined ||
      (config.favorite &&
        nextSort === "favorite" &&
        patch.favoritesFirst !== undefined);
    const next = { sort: nextSort, direction: nextDirection } as const;
    setPrefs({
      ...patch,
      ...(sortChanged ? next : {}),
      ...(config.favorite && nextSort === "favorite"
        ? { favoritesFirst: nextDirection === "desc" }
        : {}),
    });
    if (sortChanged && urlState) {
      commitUrlParams(sortToParamPatch(next), "push");
    }
  };

  // An empty RESULT is not an empty LIST. Saying "Nothing here yet — create
  // your first one" to someone who has 117 rows and mistyped a search is a lie,
  // and it buries the actual way out (clear the search). Resolved here, where
  // the query lives, and handed to every view so they cannot disagree.
  const list = useEntityList<TRow>({
    service: config.service,
    serviceKey: config.serviceKey,
    getRowId: config.getRowId,
    entityLabelPlural: config.entityLabel.plural,
    defaultFilters: config.defaultFilters,
    defaultScope,
    registryToken: config.registryToken,
    urlState: urlState,
    supportsArchived: config.supportsArchived !== false,
    searchSpansDefaultFilters: config.searchSpansDefaultFilters,
    view: {
      sort: effectiveSort.sort,
      direction: effectiveSort.direction,
      favoritesFirst: effectiveFavoritesFirst,
      pageSize: prefs.pageSize,
    },
  });

  // Inline drafts can outlive the current server page: realtime, a refresh,
  // or a query change may move the edited row before Save is pressed.
  const editRowsRef = useRef<EditRowRegistry<TRow> | null>(null);
  if (editRowsRef.current === null) {
    editRowsRef.current = new EditRowRegistry<TRow>();
  }
  useEffect(() => {
    editRowsRef.current?.remember(list.rows, config.getRowId);
  }, [config.getRowId, list.rows]);

  const { actions, modals } = config.useRowActions(list);

  // Owner / org / access columns only carry information outside "Mine", where
  // every row has the same owner. Offering them there is pure noise.
  const showSharedColumns = list.query.scope.kind !== "mine";

  /**
   * Commit the table's pending inline edits. Each row is one UPDATE; the local
   * row is patched so the list reflects the change without a refetch flash,
   * and a failure re-throws so the table keeps the draft and toasts.
   */
  const saveEdits = async (edits: Record<string, Partial<TRow>>) => {
    const save = config.edit?.save;
    if (!save) return;
    const entries = Object.entries(edits);
    await Promise.all(
      entries.map(async ([rowId, edit]) => {
        const row = editRowsRef.current?.get(rowId);
        if (!row) throw new Error("Edited row is no longer in the list");
        await save(row, edit);
        list.patchRow(rowId, edit);
      }),
    );
    const { singular, plural } = config.entityLabel;
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    toast.success(
      entries.length === 1
        ? `${cap(singular)} updated`
        : `${entries.length} ${plural} updated`,
    );
  };

  const isNarrowed =
    Boolean(list.query.search.trim()) ||
    countActiveFilters(list.query, list.defaultArchived) > 0;

  // 🚨 A FAILED READ IS NOT AN EMPTY RESULT (one-resolution R-O1). When the
  // read broke — or was REFUSED — there is no result at all, so the empty
  // state must not talk about the query. Production printed *"No mandates
  // match — … Clear the filters to see the full registry"* to a non-admin who
  // had been refused the system corpus and had nothing filtered: a sentence
  // that was false twice over, one line under the door's honest refusal. This
  // branch comes FIRST, and it never repeats the door's sentence (which the
  // failure slot above already prints, exactly once) and never offers an
  // action — a create button under a refused read is a second dead control.
  const failureEmptyState = list.error
    ? {
        title: `No ${config.entityLabel.plural} could be listed`,
        description: list.error.retryable
          ? `This list could not be read, so nothing came back. It is not empty and no filter is hiding anything — the reason, and the way to try again, are at the top of this page.`
          : `You were refused this list, so nothing came back. It is not empty and no filter is hiding anything: clearing your search or filters would change nothing. The reason is at the top of this page — choose a tab you have access to, or ask an administrator for this one.`,
      }
    : null;

  // 🚨 A LIST MAY NOT SAY "NONE" WHILE ITS OWN DEFAULT IS HIDING ROWS (row F10
  // repair, 2026-09-10). The archive filter's default HIDES archived rows (THE
  // ARCHIVED-ITEMS LAW §2), so "the live half is empty" and "there is nothing
  // here" are DIFFERENT FACTS — and until this branch existed the shell printed
  // the second knowing only the first, out of the config's STATIC `emptyState`.
  // Measured on /maps with all 46 of a user's maps archived: *"No maps yet — …
  // Make one"* beside a New button, two clicks from that page's own Archived
  // filter holding all 46. Every archive-aware config inherited it, because
  // `EntityListConfig` gave a surface no way to name an archived count at all;
  // that is why the fix is here and not in four listConfigs.
  //
  // The count is the controller's (`list.archivedProbe`, asked only when the
  // live half is empty), and the door is one click to the very rows it counted.
  const { singular, plural } = config.entityLabel;
  const probe = list.archivedProbe;
  const archivedCount = probe.state === "known" ? probe.total : 0;
  const archivedNoun = archivedCount === 1 ? singular : plural;

  const clearSearchAndFilters = (
    // Clears the SEARCH too — `resetFilters` alone leaves the search term
    // in place, so the "way out" button would have left the user staring at
    // the same empty result.
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        list.setSearch("");
        list.resetFilters();
      }}
    >
      Clear search and filters
    </Button>
  );

  // ONE CLICK, to exactly the rows the sentence above it just counted.
  const archivedDoor = (
    <Button
      size="sm"
      variant="outline"
      onClick={() => list.patchQuery({ archived: "archived" })}
    >
      {archivedCount === 1
        ? `Show the archived ${singular}`
        : `Show the ${archivedCount} archived ${plural}`}
    </Button>
  );

  const configuredEmptyAction =
    typeof emptyAction === "function" ? emptyAction(list) : emptyAction;

  const allArchivedEmptyState =
    archivedCount > 0
      ? {
          title: isNarrowed
            ? `No live ${plural} match`
            : archivedCount === 1
              ? `The only ${singular} here is archived`
              : `All ${archivedCount} ${plural} are archived`,
          description: isNarrowed
            ? `Nothing live matched your current search and filters — but ${archivedCount} archived ${archivedNoun} did. Widen them, or open the archived ${archivedNoun}.`
            : `Nothing is missing and nothing was deleted: every ${singular} in this view has been archived. Open them to restore one, or start a new one.`,
          action: (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {archivedDoor}
              {isNarrowed ? clearSearchAndFilters : configuredEmptyAction}
            </div>
          ),
        }
      : null;

  const resolvedEmptyState =
    failureEmptyState ??
    allArchivedEmptyState ??
    // Nothing may be asserted about "none" until the archived count answers.
    // These two branches are short-lived and rare (only an empty live half
    // reaches them at all), and each is strictly more honest than guessing.
    (probe.state === "loading"
      ? {
          title: `No live ${plural} in this view`,
          description: `Checking whether any ${plural} here are archived…`,
        }
      : probe.state === "failed"
        ? {
            title: `No live ${plural} in this view`,
            description: `Nothing live is listed here, and the check for archived ${plural} did not answer — so this page cannot tell you whether any exist. Open Filters & Sort → Archived to look for yourself.`,
            action: (
              <Button size="sm" variant="outline" onClick={list.refresh}>
                Try again
              </Button>
            ),
          }
        : isNarrowed
          ? {
              title: `No ${plural} match`,
              description:
                "Nothing matched your current search and filters. Widen them, or check a different scope.",
              action: clearSearchAndFilters,
            }
          : {
              // Reached only when the archive axis is off for this surface, or
              // it answered `total: 0` — i.e. live + archived really is zero.
              ...config.emptyState,
              action: configuredEmptyAction,
            });

  const cardsView = config.views?.cards;
  const rowsView = config.views?.rows;
  // A stored preference for a view this surface doesn't provide falls back to
  // the table rather than rendering nothing.
  const view =
    prefs.view === "cards" && cardsView
      ? "cards"
      : prefs.view === "rows" && rowsView
        ? "rows"
        : "table";

  // ── BULK SELECTION ────────────────────────────────────────────────────────
  // Entirely absent unless the surface declared `bulkActions`. See
  // ../selection.ts for the vocabulary and ../useEntityListSelection.ts for why
  // the state is local rather than a slice.
  const bulkActions = config.bulkActions ?? [];
  const bulkEnabled = bulkActions.length > 0;
  const bulkNoun = config.bulkSelection?.noun ?? singular;
  const selection = useEntityListSelection<TRow>({
    enabled: bulkEnabled,
    rows: list.rows,
    total: list.total,
    query: list.query,
    sort: {
      sort: effectiveSort.sort,
      direction: effectiveSort.direction,
      favoritesFirst: effectiveFavoritesFirst,
      pageSize: prefs.pageSize,
    },
    service: config.service,
    getRowId: config.getRowId,
    ...(config.bulkSelection?.isRowSelectable
      ? { isRowSelectable: config.bulkSelection.isRowSelectable }
      : {}),
    selectAllMatching: config.bulkSelection?.selectAllMatching ?? false,
  });

  const bulkButtons = bulkEnabled ? (
    <EntityBulkActions
      actions={bulkActions}
      selection={selection}
      noun={bulkNoun}
      onRemoveRows={(ids) => ids.forEach((id) => list.removeRow(id))}
      onRefresh={list.refresh}
    />
  ) : null;

  // The table owns the bar (count + Clear + copy-of-selection + these buttons);
  // every other view has none, so there the banner carries them instead.
  const tableSelection: MatrxDataTableSelectionConfig<TRow> | undefined =
    bulkEnabled
      ? {
          selectedIds: selection.ids,
          onSelectedIdsChange: selection.setIds,
          noun: bulkNoun,
          ...(config.bulkSelection?.isRowSelectable
            ? { isRowSelectable: config.bulkSelection.isRowSelectable }
            : {}),
          actions: () => bulkButtons,
        }
      : undefined;

  // 🚨 THE KEYBOARD, AND WHY IT IS SCOPED THE WAY IT IS. `x`, cmd/ctrl-A and
  // Escape are the three every list worth using has (Gmail, Linear, Airtable),
  // and all three are also keys the rest of the app owns — a page that grabs
  // cmd-A globally makes selecting text impossible. So each one fires only
  // while this list pane holds the focus or the pointer, never while a text
  // field has focus, and never while a dialog is open on top.
  const paneRef = useRef<HTMLDivElement | null>(null);
  const pointerInPaneRef = useRef(false);
  const hoveredRowIdRef = useRef<string | null>(null);
  // Every handler on the controller is a fresh function each render (the
  // primitive's rule — the React Compiler owns memoization), so the listener
  // reads the latest through a ref instead of re-subscribing on every render.
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  useEffect(() => {
    if (!bulkEnabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const pane = paneRef.current;
      const live = selectionRef.current;
      if (!pane) return;
      if (event.altKey) return;
      // A MODAL on top owns the keyboard — Escape belongs to it, not to the
      // list underneath. Judged on `aria-modal` and an open state, never on the
      // bare role: a non-modal window panel or a popover parked over the page
      // must not leave the list's shortcuts permanently dead, and a Radix layer
      // that is animating OUT still carries its role with `data-state="closed"`
      // (which is how Escape measured dead right after a confirm closed).
      const modalOnTop = Array.from(
        document.querySelectorAll("[role='dialog'], [role='alertdialog']"),
      ).some(
        (el) =>
          el.getAttribute("aria-modal") === "true" &&
          el.getAttribute("data-state") !== "closed",
      );
      if (modalOnTop) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.isContentEditable ||
          active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT")
      ) {
        return;
      }
      const focusInPane = active instanceof Node && pane.contains(active);
      if (!focusInPane && !pointerInPaneRef.current) return;

      if (event.key === "Escape") {
        if (live.count === 0) return;
        event.preventDefault();
        live.clear();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        live.selectLoaded();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (event.key.toLowerCase() === "x") {
        // The row under the caret, else the row under the pointer. `x` with
        // neither has no row to mean, and does nothing rather than guessing.
        const focusedRow =
          active instanceof Element
            ? active.closest("[data-row-id]")?.getAttribute("data-row-id")
            : null;
        const rowId = focusedRow ?? hoveredRowIdRef.current;
        if (!rowId) return;
        const row = list.rows.find(
          (candidate) => config.getRowId(candidate) === rowId,
        );
        if (!row) return;
        if (config.bulkSelection?.isRowSelectable?.(row) === false) return;
        event.preventDefault();
        live.toggleId(rowId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // `list.rows` and the config are read through the closure on purpose: the
    // listener is re-attached whenever the loaded page changes so `x` can never
    // toggle a row that is no longer on screen.
  }, [bulkEnabled, list.rows, config]);

  const altViewProps = {
    rows: list.rows,
    density: prefs.density,
    showShared: showSharedColumns,
    actions,
    // The same door the table puts on the name cell, handed to every alternate
    // view. Switching to cards or dense rows must not cost the user cmd-click,
    // middle-click and keyboard focus on the record's name.
    hrefFor: (row: TRow) => entityListRowHref(config, row),
  };

  const surfaceList: EntityListSurfaceController<TRow> = {
    ...list,
    view: {
      sort: effectiveSort.sort,
      direction: effectiveSort.direction,
      favoritesFirst: effectiveFavoritesFirst,
      pageSize: prefs.pageSize,
    },
    patchView,
  };

  const page = (
    <div
      ref={paneRef}
      className="flex h-full flex-col overflow-hidden"
      onMouseEnter={() => {
        pointerInPaneRef.current = true;
      }}
      onMouseLeave={() => {
        pointerInPaneRef.current = false;
        hoveredRowIdRef.current = null;
      }}
      onMouseOver={(event) => {
        const target = event.target;
        hoveredRowIdRef.current =
          target instanceof Element
            ? (target.closest("[data-row-id]")?.getAttribute("data-row-id") ??
              null)
            : null;
      }}
    >
      {/*
        The scope tabs and toolbar are STATIC interactive content at the top, so
        they must clear the glass header rather than scroll behind it — hence
        pt-[var(--shell-header-h)] (never a hardcoded pt-12). Only the list body
        below scrolls behind the glass.
      */}
      <div
        className={cn(
          "shrink-0 space-y-1.5 px-3 pb-2 sm:space-y-2",
          clearsShellHeader
            ? "pt-[calc(var(--shell-header-h)+0.5rem)]"
            : "pt-2",
        )}
      >
        {/*
          🚨 A TALL NOTICE MUST NEVER SQUEEZE THE TABLE OUT OF REACH. `notice`
          sits in this shrink-0 zone — `flex-shrink: 0`, so flexbox never
          compresses it — and until this wrapper existed, a surface whose
          notice was a real dashboard (stat tiles + two fixed-height charts,
          `LibraryMetricsHeader` on `/libraries/[id]`) could push the tabs and
          toolbar down until only ~24px of viewport remained for the table
          below: `flex-1 min-h-0` on the scroll body (below) can shrink all
          the way to that sliver, and the sliver renders a table row with
          nothing to scroll it into view. THIS wrapper caps the notice at a
          fraction of the viewport and scrolls it independently, so the tabs,
          the toolbar and a workable slice of the table are ALWAYS below it,
          no matter how tall a surface's notice content is. Every existing
          `notice` (assist strips, paste boxes, banners) is far under this
          cap, so nothing about them changes.
        */}
        {notice && (
          <div className="max-h-[42vh] overflow-y-auto">
            {typeof notice === "function" ? notice(list) : notice}
          </div>
        )}
        <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2">
          <div className="min-w-0 flex-1 sm:flex-none">
            {scopeTabs && (
            <EntityScopeTabs
              scope={list.query.scope}
              scopes={visibleScopes}
              counts={list.counts}
              // 🚨 A FAILED COUNT IS NOT ZERO. When the counts read fails the
              // controller holds EMPTY_SCOPE_COUNTS, and a settled empty count
              // renders as `0` on every tab — /mandates/list-preview read
              // "0 · 0 · 0" over a populated list after a 57014 (2026-09-26).
              // A count nobody measured shows no number; the notice below says
              // why and offers Try again.
              countsLoading={list.countsLoading || Boolean(list.countsError)}
              onChange={list.setScope}
            />
            )}
          </div>
          {headerActions && (
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              {typeof headerActions === "function"
                ? headerActions(list)
                : headerActions}
            </div>
          )}
        </div>

        {!config.tableToolbar && (
        <EntityListToolbar
          query={list.query}
          facets={list.facets}
          isFetching={list.isFetching}
          prefs={{
            ...prefs,
            ...effectiveSort,
            favoritesFirst: effectiveFavoritesFirst,
          }}
          showSharedColumns={showSharedColumns}
          columns={config.columns}
          defaultHidden={defaultHidden}
          facetSections={config.facetSections}
          // The panel narrows the SCOPE through the same setter and the same
          // counts the tabs use — one state, two entry points.
          scopeSections={config.scopeSections}
          counts={list.counts}
          countsLoading={list.countsLoading}
          countsError={list.countsError}
          onScopeChange={list.setScope}
          hasFavorites={Boolean(config.favorite)}
          hasArchived={config.supportsArchived !== false}
          searchPlaceholder={
            config.searchPlaceholder ?? `Search ${config.entityLabel.plural}…`
          }
          deepSearchLabel={config.deepSearch?.label}
          hasCards={Boolean(cardsView)}
          hasRows={Boolean(rowsView)}
          onSearch={list.setSearch}
          onPatchQuery={list.patchQuery}
          // Sort changes route through commitSort so the panel's sort and the
          // table header's sort write the same two places (prefs + URL).
          onPatchPrefs={patchView}
          onResetFilters={list.resetFilters}
          onResetView={() => {
            reset();
            if (urlState)
              commitUrlParams(
                {
                  [ENTITY_LIST_URL_PARAMS.sort]: null,
                  [ENTITY_LIST_URL_PARAMS.direction]: null,
                },
                "push",
              );
          }}
        />
        )}

        {/*
          THE ONE FAILURE SLOT. Every reason this list has no rows is printed
          here and only here — the shell fires no toast for the same event
          (useEntityList explains why), and the empty state below deliberately
          does not repeat this sentence.

          RETRY IS OFFERED ONLY WHERE IT COULD WORK. A refusal will refuse the
          identical request again, so the control is ABSENT rather than dead —
          the fourth law's rule that a screen is honest or the control is not
          there at all.
        */}
        {list.error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{list.error.message}</span>
            {list.error.retryable && (
              <Button size="sm" variant="ghost" onClick={list.refresh}>
                Retry
              </Button>
            )}
            <ErrorAlchemyMenu className="ml-auto" />
          </div>
        )}

        {/*
          THE SIDE READS' FAILURE. The rows loaded but the tab counts or the
          filter options did not: one plain sentence each, one Try again
          (a refresh re-asks all three reads). Never shown while the rows
          themselves failed — the slot above already speaks for the list.
        */}
        {!list.error && (list.countsError || list.facetsError) && (
          <EntitySourceFailures
            operation={`Load ${plural}`}
            failures={[
              ...(list.countsError
                ? [{ label: "The tab counts", error: list.countsError }]
                : []),
              ...(list.facetsError
                ? [{ label: "The filter options", error: list.facetsError }]
                : []),
            ]}
            consequence={`${
              list.countsError && list.facetsError
                ? "The tabs show no number and the filters offer no options"
                : list.countsError
                  ? "The tabs show no number"
                  : "The filters offer no options"
            } until they load; the list itself is unaffected.`}
            onRetry={list.refresh}
          />
        )}

        {/*
          THE ONE SENTENCE ABOUT WHAT "ALL" MEANS. Under the toolbar, where
          Gmail puts it, and above the rows it is describing. It renders
          nothing at all until something is selected — and nothing ever for a
          surface that declared no bulk actions.
        */}
        <EntityBulkSelectAllBanner
          selection={selection}
          noun={bulkNoun}
          plural={plural}
          selectAllMatchingDeclared={
            config.bulkSelection?.selectAllMatching ?? false
          }
          // The table has its own bar for these; the cards/rows views do not.
          {...(view === "table" ? {} : { actions: bulkButtons })}
        />

        {/*
          THE PHONE'S SELECT-ALL. Below `sm` the table's header row — and the
          select-all checkbox in it — is replaced by stacked cards, so without
          this a phone could only select a page one tap at a time and never
          reached the "all N matching" offer at all. Hidden at every width where
          the real header exists. Only the table view renders cards.
        */}
        {view === "table" ? (
          <EntityCardsSelectAll selection={selection} noun={bulkNoun} />
        ) : null}
      </div>

      {/*
        A guaranteed floor, not `min-h-0`: this area still SHRINKS (so its own
        `overflow-y-auto` still engages once content exceeds it), but never
        below a workable slice of table — the second half of the guard above.
        `min-h-0` alone trusts every notice to stay small; this trusts nothing.
      */}
      <div className="min-h-[16rem] flex-1 overflow-y-auto px-3 pb-4">
        {view === "table" ? (
          <EntityListTable
            config={config}
            actions={actions}
            rows={list.rows}
            total={list.total}
            page={list.query.page}
            pageSize={prefs.pageSize}
            sort={effectiveSort.sort}
            direction={effectiveSort.direction}
            filters={list.query.filters}
            facets={list.facets}
            isLoading={list.isLoading}
            isFetching={list.isFetching}
            density={prefs.density}
            showSharedColumns={showSharedColumns}
            hiddenColumns={prefs.hiddenColumns}
            onSaveEdits={saveEdits}
            emptyState={resolvedEmptyState}
            {...(tableSelection ? { selection: tableSelection } : {})}
            {...(config.tableToolbar
              ? {
                  tableToolbar: {
                    tableId: config.tableToolbar.tableId,
                    search: list.query.search,
                    searchPlaceholder:
                      config.searchPlaceholder ??
                      `Search ${config.entityLabel.plural}…`,
                    onRefresh: list.refresh,
                    onHiddenColumnsChange: (hiddenColumns: string[]) =>
                      setPrefs({ hiddenColumns }),
                  },
                }
              : {})}
            onQueryChange={(next) => {
              if (
                next.sort !== effectiveSort.sort ||
                next.direction !== effectiveSort.direction
              ) {
                commitSort({ sort: next.sort, direction: next.direction });
              }
              if (next.pageSize !== prefs.pageSize) {
                setPrefs({ pageSize: next.pageSize });
              }
              // Table-toolbar mode only: the search box is the table's, and a
              // saved view can change search AND filters in one apply — so both
              // land in one patch (which resets the page) rather than two
              // commits racing each other.
              if (
                next.search !== undefined &&
                next.search !== list.query.search
              ) {
                list.patchQuery({ search: next.search, filters: next.filters });
                return;
              }
              if (
                JSON.stringify(next.filters) !==
                JSON.stringify(list.query.filters)
              ) {
                list.setFilters(next.filters);
              }
              list.setPage(next.page);
            }}
          />
        ) : list.rows.length === 0 && !list.isLoading ? (
          // Cards/rows views used to render literally nothing on an empty list —
          // the empty state (and its emptyAction door) existed only in the table
          // branch, so a user whose saved view style was "cards" met a blank
          // page with no title, no explanation, and no way forward.
          <EntityListEmpty state={resolvedEmptyState} />
        ) : view === "cards" && cardsView ? (
          cardsView(altViewProps)
        ) : rowsView ? (
          rowsView(altViewProps)
        ) : null}

        {view !== "table" && (
          <LoadMoreFooter
            loaded={list.rows.length}
            total={list.total}
            page={list.query.page}
            pageSize={prefs.pageSize}
            onPage={list.setPage}
          />
        )}
      </div>

      {modals}
    </div>
  );

  // ONE context menu wraps the pane. MatrxDataTable already stamps
  // `data-row-id`; feature-owned cards/rows owe the same anchor. Resolving the
  // row at open time keeps right-click and mobile long-press on the exact same
  // action registry as the kebab, without N nested menu roots.
  const pageWithContextMenu = (
    <ItemContextMenu
      config={EMPTY_ITEM_MENU_CONFIG}
      sourceFeature={config.sourceFeature}
      surfaceName={surface?.surfaceName}
      getApplicationScope={
        surface ? () => surface.getScope(surfaceList) : undefined
      }
      resolveItemOnOpen={(target) => {
        const rowId = target
          ?.closest("[data-row-id]")
          ?.getAttribute("data-row-id");
        const row = rowId
          ? list.rows.find((candidate) => config.getRowId(candidate) === rowId)
          : undefined;
        if (!row) {
          return {
            config: EMPTY_ITEM_MENU_CONFIG,
            context: { [CONTEXT_MENU_ENTITY_KEY]: null },
          };
        }
        return {
          config: actions.menuFor(row),
          context: buildEntityListRowContext(config, row),
        };
      }}
    >
      {page}
    </ItemContextMenu>
  );

  if (!surface) return pageWithContextMenu;
  return (
    <SurfaceRuntimeProvider
      // This shell owns no surface of its own: `config.surface` is the caller's
      // `{ surfaceName, getScope, getWriteHandlers }` descriptor, and THAT
      // object is the site `pnpm check:surface-write-handlers` reads.
      // surface-write-handlers: pass-through
      surfaceName={surface.surfaceName}
      getScope={() => surface.getScope(surfaceList)}
      getWriteHandlers={
        surface.getWriteHandlers
          ? () => surface.getWriteHandlers?.(surfaceList) ?? {}
          : undefined
      }
    >
      {pageWithContextMenu}
    </SurfaceRuntimeProvider>
  );
}

/** Empty state for the non-table views — same copy + action the table renders. */
function EntityListEmpty({
  state,
}: {
  state: { title: string; description: string; action?: ReactNode };
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <p className="text-sm font-medium text-foreground">{state.title}</p>
      <p className="text-xs text-muted-foreground">{state.description}</p>
      {state.action}
    </div>
  );
}

function LoadMoreFooter({
  loaded,
  total,
  page,
  pageSize,
  onPage,
}: {
  loaded: number;
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const shownThrough = (page - 1) * pageSize + loaded;
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-4 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {shownThrough} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={shownThrough >= total}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
export function buildEntityListRowContext<TRow>(
  config: EntityListConfig<TRow>,
  row: TRow,
) {
  return {
    content: config.getRowAgentContext?.(row) ?? config.getRowName(row),
    [CONTEXT_MENU_ENTITY_KEY]: config.getRowEntity?.(row) ?? null,
  };
}

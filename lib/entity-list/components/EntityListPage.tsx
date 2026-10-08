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

import { useEffect, useRef, useState, type ReactNode } from "react";
import { clearNoRoomMarks, columnsWithoutRoom, NO_ROOM_CSS, noRoomScript } from "../columnPriority";
import { usePhoneWidth } from "../usePhoneWidth";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import {
  SurfaceRuntimeProvider,
  type SurfaceWriteHandlers,
} from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceScopePayload } from "@ai-matrx/chat/surfaces/types";
import { AlertCircle } from "lucide-react";
import { Button } from "@ai-matrx/design-system";
import { CONTROLS_CONTAINER_NAME, ControlScope } from "@ai-matrx/design-system/controls";
import { ItemContextMenu } from "@ai-matrx/design-system/item";
import {
  effectiveHiddenColumns,
  hiddenColumnsPatch,
  uniformColumnIds,
} from "../columnWidths";
import { entityListDoorColumnId } from "../doors";
import type { ItemMenuConfig } from "@ai-matrx/chat/ui/item-types";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import { commitUrlParams } from "@ai-matrx/kit/url-state";
import { useListSearchParams } from "../useListSearchParams";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import { defaultHiddenColumns, type EntityColumnSpec } from "../columns";
import { useTableCustomFieldColumns } from "@/features/unified-data/standard-field-columns/useTableCustomFieldColumns";
import {
  makeScope,
  PERSONAL_SEAT_SCOPES,
  withStandardLanes,
  type ListScope,
  type ListScopeKind,
} from "@/lib/list-scope/types";
import Link from "next/link";
import { useMyTeams } from "@/features/organizations/hooks/useTeams";
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
import { EntityScopeTabs, scopeKindLabel } from "./EntityScopeTabs";
import { EntityOrgFilter } from "./EntityOrgFilter";
import { EntityDimensionFilter } from "./EntityDimensionFilter";
import { dimensionValueOf, withDimensionValue } from "../dimensionFilter";
import { DEFAULT_LIST_KNOB_KEY, ORG_FILTER_FEATURE } from "@/lib/list-scope";
import { useSessionKnob } from "@/lib/scoped-config/sessionKnob";
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
import { EntityFilterChips } from "./EntityFilterChips";
import { UntrustedCount, type CountRead } from "@ai-matrx/design-system";
import { formatCount } from "@ai-matrx/kit/format";

const EMPTY_ITEM_MENU_CONFIG: ItemMenuConfig = { sections: [] };

/** The address word of the group-by choice (config.grouping). */
export const GROUP_PARAM = "group";
/**
 * One page that holds the whole result while grouped. Not a limit on anything: the surfaces that
 * group hold their corpus in hand, and a group count over a partial page would be a lie.
 */
const GROUPED_PAGE_SIZE = 100_000;

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
  /**
   * The rows the person ticked (bulk selection), in tick order. Always an
   * array — empty when nothing is ticked or the surface has no bulk actions —
   * so an agent can act on "these" (page-pass 2026-09-27).
   */
  selectedIds: string[];
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

/**
 * ROW KEYS' ONE MOVE: focus the row `step` away from `from` (the first row when `from` is null)
 * among the rows the person can see — table rows, phone cards and feature cards all carry
 * `data-row-id`. A row is made focusable on the spot (tabIndex -1, never a tab stop) and scrolled
 * into view, so a virtualized list renders its neighbours. Returns the row's id, or null when there is
 * no row to move to.
 */
export function focusListRow(pane: HTMLElement, from: HTMLElement | null, step: 1 | -1): string | null {
  const rows = listRows(pane);
  if (rows.length === 0) return null;
  const at = from ? rows.findIndex((el) => el === from || el.contains(from)) : -1;
  const next = at < 0 ? (step === 1 ? rows[0] : undefined) : rows[at + step];
  if (!next) return null;
  if (!next.hasAttribute("tabindex")) next.tabIndex = -1;
  next.focus({ preventScroll: true });
  next.scrollIntoView?.({ block: "nearest" });
  return next.getAttribute("data-row-id");
}

/** The rows a person can see, once each, in screen order (the row keys' one notion of "a row"). */
function listRows(pane: HTMLElement): HTMLElement[] {
  // The outermost element of each row: a row's own parts may carry its id too.
  const all = Array.from(pane.querySelectorAll<HTMLElement>("[data-row-id]")).filter(
    (el) => !el.parentElement?.closest("[data-row-id]"),
  );
  // A layout hidden at this width (the phone cards on a desktop) has no box; with no layout
  // engine at all (jsdom) nothing has one, and every row counts.
  const shown = all.filter((el) => el.getClientRects().length > 0);
  const seen = new Set<string>();
  const rows = (shown.length > 0 ? shown : all).filter((el) => {
    const id = el.getAttribute("data-row-id") ?? "";
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return rows;
}

const WARNED_ROWS_WITHOUT_CUSTOM_FIELDS = new Set<string>();
function warnRowsWithoutCustomFields(token: string) {
  if (WARNED_ROWS_WITHOUT_CUSTOM_FIELDS.has(token)) return;
  WARNED_ROWS_WITHOUT_CUSTOM_FIELDS.add(token);
  console.warn(
    `[entity-list] the "${token}" list's rows carry no custom_fields / organization_id, so it offers no custom-field columns until its source returns them (lib/record-pages listSources queue).`,
  );
}

/** No organizations yet: one stable empty answer, so the column source does not re-ask. */
const NO_ORGANIZATIONS: readonly string[] = [];

/** The pane width (48rem, Tailwind's `@3xl/list`) below which the header's controls fold. */
const NARROW_PANE_PX = 768;

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
  // "All" and "My team" join every list that offers them here, once — never per page.
  const visibleScopes = withStandardLanes(scopes ?? config.scopes, {
    lanes: config.lanes,
  });
  // THE ORGANIZATION FILTER shows on personal-seat lists only: an admin page
  // never acts as the viewer, so it never offers the viewer's organizations.
  // Whether it is offered at all is the Feature Knob `lists.org_filter/<token>`
  // (platform default on; an organization or a person may turn it off).
  const orgFilterKnob = useSessionKnob({
    feature: ORG_FILTER_FEATURE,
    key: config.registryToken ?? DEFAULT_LIST_KNOB_KEY,
  });
  const orgFilterOffered =
    orgFilterKnob !== false &&
    visibleScopes.some((kind) => PERSONAL_SEAT_SCOPES.includes(kind));
  // 🚨 THE URL IS THE QUERY ON EVERY LIST PAGE (default ON since 2026-09-26).
  // It used to be opt-in, and `/agents/all` and `/workflows/all` never opted
  // in: `?scope=mine&q=seo` was ignored, the late registry default flipped
  // the untouched scope to My Orgs, and Back restored nothing. A list page is
  // a page — its lane and filters belong in its address. `urlState: false`
  // is the explicit opt-out for a list that is NOT the page's own query.
  const urlState = config.urlState !== false;
  // The page toolbar row's two slots the table draws into — its saved-view tabs at the row's
  // left edge, its own controls at the right (see EntityListTable `pageToolbarSlot`).
  const [tableControlsSlot, setTableControlsSlot] =
    useState<HTMLDivElement | null>(null);
  const [tableTabsSlot, setTableTabsSlot] = useState<HTMLDivElement | null>(null);
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

  // GROUP BY (config.grouping): the address only (`?group=`), never a preference or a default,
  // so every visit starts flat. A column the surface does not offer reads as no grouping.
  const [localGroup, setLocalGroup] = useState<string | null>(null);
  const requestedGroup = urlState ? urlParams.get(GROUP_PARAM) : localGroup;
  const groupColumnId =
    config.grouping && requestedGroup && config.grouping.groupableColumnIds.includes(requestedGroup)
      ? requestedGroup
      : null;
  const setGroupColumnId = (next: string | null) => {
    if (urlState) commitUrlParams({ [GROUP_PARAM]: next, page: null }, "push");
    else setLocalGroup(next);
  };
  // While grouped the whole result is one page: the table counts what it holds.
  const pageSize = groupColumnId ? GROUPED_PAGE_SIZE : prefs.pageSize;

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
    supportedScopes: visibleScopes,
    urlState: urlState,
    supportsArchived: config.supportsArchived !== false,
    searchSpansDefaultFilters: config.searchSpansDefaultFilters,
    ...(config.searchDebounceMs !== undefined ? { searchDebounceMs: config.searchDebounceMs } : {}),
    view: {
      sort: effectiveSort.sort,
      direction: effectiveSort.direction,
      favoritesFirst: effectiveFavoritesFirst,
      pageSize,
    },
  });
  // THE DIMENSION FILTER shows where the surface's server honours it, on personal-seat lists only (its
  // Values are the viewer's own organizations' Dimensions; an admin page never acts as the viewer). A
  // Value the address carries always shows, so the narrowing is never invisible.
  const dimensionOffered =
    (Boolean(config.dimensionFilter) &&
      visibleScopes.some((kind) => PERSONAL_SEAT_SCOPES.includes(kind))) ||
    Boolean(dimensionValueOf(list.query.filters));

  // TYPED TOKENS BECOME FILTERS once finished (config.searchTokens): `kind:form ` moves out of the
  // text and into the filter bag in one step, so it shows as a chip and in the column header.
  const onSearch = (value: string) => {
    const parsed = config.searchTokens && /\s$/.test(value) ? config.searchTokens(value) : null;
    if (parsed && Object.keys(parsed.filters).length > 0) {
      list.patchQuery({ search: parsed.search, filters: { ...list.query.filters, ...parsed.filters } });
      return;
    }
    list.setSearch(value);
  };

  // UNIFORM COLUMNS hide by default where the surface opts in (they stay in
  // the picker; a column the person shows stays shown) — ../columnWidths.ts.
  // 🚨 ONE COLUMN SET IN EVERY LANE (list-shell fix D, 2026-09-28). Owner /
  // organization columns used to be REMOVED in Mine, so the set — and, since
  // the table remembers the order it first saw, the ORDER — depended on the
  // lane a person opened first. They are now the uniform rule's case: in Mine
  // every row has the same owner, so those columns are identical by
  // construction and auto-hide like any other uniform column (the picker still
  // offers them, and a column the person shows stays shown).
  const laneUniform =
    list.query.scope.kind === "mine"
      ? config.columns.filter((c) => c.scopedToShared).map((c) => c.id)
      : [];
  // 🚨 LANE 7 W5 — CUSTOM FIELDS ON EVERY LIST. The organization's own fields of this list's
  // token (its `door.token`) join the column registry, for the organizations its rows belong to:
  // the ONE picker offers them, they start hidden (auto-hidden, so a column the person shows stays
  // shown), and the table draws them. Same column source as the table host's port.
  const customFieldToken =
    config.registryToken ?? (typeof config.door?.token === "string" ? config.door.token : null);
  const customFieldOrgKey = [
    ...new Set(
      list.rows
        .map((row) => (row as { organization_id?: unknown }).organization_id)
        .filter((org): org is string => typeof org === "string" && org.length > 0),
    ),
  ]
    .sort()
    .join(",");
  // A list whose rows do not carry `custom_fields` (and `organization_id`) would show a column of
  // blanks for values that exist: it offers no custom columns until its source returns them (G1's
  // census names each such source as a queue item). Said once in the console, per token.
  const rowsCarryCustomFields =
    list.rows.length > 0 &&
    list.rows.every((row) => typeof row === "object" && row !== null && "custom_fields" in row && "organization_id" in row);
  if (customFieldToken && list.rows.length > 0 && !rowsCarryCustomFields) warnRowsWithoutCustomFields(customFieldToken);
  const customFieldSource = useTableCustomFieldColumns<TRow>(
    rowsCarryCustomFields ? customFieldToken : null,
    customFieldOrgKey ? customFieldOrgKey.split(",") : NO_ORGANIZATIONS,
  );
  const customFieldSpecs: EntityColumnSpec<TRow>[] = (customFieldSource?.columns ?? [])
    .filter((column) => column.id && !config.columns.some((c) => c.id === column.id))
    .map((column) => ({
      id: column.id as string,
      label: column.label ?? (typeof column.header === "string" ? column.header : (column.id as string)),
      column,
    }));
  const pageConfig: EntityListConfig<TRow> = customFieldSpecs.length
    ? { ...config, columns: [...config.columns, ...customFieldSpecs] }
    : config;
  const autoHidden = [
    ...customFieldSpecs.map((c) => c.id),
    ...(config.autoHideUniformColumns
      ? uniformColumnIds(config.columns, list.rows, [entityListDoorColumnId(config)], {
          complete: list.query.page <= 1 && list.total <= list.rows.length,
        })
      : []),
    ...laneUniform,
  ];
  const hiddenColumns = effectiveHiddenColumns(
    prefs.hiddenColumns,
    autoHidden,
    prefs.shownColumns,
  );
  const setHiddenColumns = (next: string[]) =>
    setPrefs(hiddenColumnsPatch(next, hiddenColumns, prefs.shownColumns));

  // THE LEAST IMPORTANT COLUMN LEAVES FIRST (../columnPriority.ts): the list's measured width
  // decides which ranked columns have no room. Layout only — never written to the preferences;
  // the table's echo of its hidden set is stripped of them before it can be stored.
  const phoneWidth = usePhoneWidth();
  const [listWidth, setListWidth] = useState<number | null>(null);
  const noRoom = columnsWithoutRoom(pageConfig.columns, hiddenColumns, phoneWidth ? null : listWidth);
  const tableHiddenColumns = noRoom.length > 0 ? [...hiddenColumns, ...noRoom] : hiddenColumns;
  const setHiddenFromTable = (next: string[]) =>
    setHiddenColumns(next.filter((id) => !noRoom.includes(id)));

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
    // The organization filter is a narrowing like any other (its own control, same door out).
    Boolean(list.query.orgId) ||
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
          : // Only offer "choose a tab" where tabs are on screen (page-pass
            // 2026-09-27, /connected-sources has none and said it anyway).
            scopeTabs && visibleScopes.length > 1
            ? `You were refused this list, so nothing came back. It is not empty and no filter is hiding anything: clearing your search or filters would change nothing. The reason is at the top of this page — choose a tab you have access to, or ask an administrator for this one.`
            : `You were refused this list, so nothing came back. It is not empty and no filter is hiding anything: clearing your search or filters would change nothing. The reason is at the top of this page.`,
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

  // "MY TEAM" SAYS WHOSE ITEMS IT SHOWS (T-29). An empty My team tab is either
  // "you are on no team here, so there is nothing to show" (the reach is empty
  // for a person on no team since 2026-09-28 — never a copy of Mine) or "nobody on
  // your teams has made one yet" — two different facts, and the first has a
  // door: teams are set up in the organization's settings. Asked only while
  // the My team tab is the one on screen.
  const teamScope = list.query.scope.kind === "team" ? list.query.scope : null;
  const teamOrgId = teamScope ? list.query.orgId : null;
  const myTeams = useMyTeams(teamOrgId, teamScope !== null);
  const teamsError = teamScope ? myTeams.error : null;
  // The team narrow rows list only organizations where the viewer HAS teammates,
  // so the name is looked up in both lists; an unnamed organization is still
  // one organization, never "any of your organizations".
  const teamOrgName = teamOrgId
    ? ([...(list.counts.narrow.team ?? []), ...(list.counts.narrow.orgs ?? [])].find(
        (o) => o.id === teamOrgId,
      )?.label ?? "this organization")
    : null;
  const teamNames = Array.from(new Set(myTeams.data.map((t) => t.teamName)));
  const teamNamesSentence =
    teamNames.length <= 3
      ? teamNames.join(", ").replace(/, ([^,]*)$/, " or $1")
      : `${teamNames.slice(0, 3).join(", ")} or ${teamNames.length - 3} more`;
  const teamEmptyState =
    teamScope && myTeams.settled
      ? myTeams.data.length === 0
        ? {
            title: `No ${plural} from your team`,
            description: teamOrgName
              ? `You are not on a team in ${teamOrgName}, so My team has no ${plural} to show. Owners and admins of ${teamOrgName} set up teams in its settings.`
              : `You are not on a team in any of your organizations, so My team has no ${plural} to show. An organization's owners and admins set up teams in its settings.`,
            action: (
              <Button size="sm" variant="outline" asChild>
                <Link
                  href={
                    teamOrgId
                      ? `/organizations/${teamOrgId}/settings#teams`
                      : "/organizations"
                  }
                >
                  {teamOrgId ? "Open Teams" : "Open organizations"}
                </Link>
              </Button>
            ),
          }
        : {
            title: `No ${plural} from your team yet`,
            description: `Nobody on ${teamNamesSentence} has made ${singular.match(/^[aeiou]/i) ? "an" : "a"} ${singular} here yet, and neither have you.`,
            action: configuredEmptyAction,
          }
      : null;

  const searchMissAction =
    list.query.search.trim() && configuredEmptyAction ? (
      <div className="flex flex-wrap items-center justify-center gap-2">
        {configuredEmptyAction}
        {clearSearchAndFilters}
      </div>
    ) : (
      clearSearchAndFilters
    );

  // 🚨 A MISS IN THIS LANE IS NOT A MISS EVERYWHERE (2026-09-29, measured on
  // /education/flashcards as admin@admin.com). The deck list opens on My Orgs
  // (the registry's view for fc_set), and My Orgs is by definition OTHER
  // people's records — so two decks the person had just made, searched by
  // their exact name, answered "No decks match … check a different scope"
  // while the Mine tab counted both. The lane counts are the list under the
  // same search and filters (the count IS the list — check:list-counts), so the
  // shell knows exactly which lanes hold matches: it names them and each gets a
  // one-click door that keeps the search. Every list on this shell inherits it.
  const currentKind = list.query.scope.kind;
  const otherLaneHits =
    list.countsLoading || list.countsError
      ? []
      : visibleScopes
          .filter((kind) => kind !== currentKind)
          .map((kind) => ({ kind, count: list.counts.byKind[kind] ?? 0 }))
          .filter((hit) => hit.count > 0);
  const hitsSentence = otherLaneHits
    .map((hit) => `${hit.count} in ${scopeKindLabel(hit.kind)}`)
    .join(", ")
    .replace(/, ([^,]*)$/, " and $1");
  const otherLaneEmptyState =
    otherLaneHits.length > 0 && !teamScope
      ? {
          title: isNarrowed
            ? `No ${plural} match in ${scopeKindLabel(currentKind)}`
            : `No ${plural} in ${scopeKindLabel(currentKind)}`,
          description: isNarrowed
            ? `Nothing in ${scopeKindLabel(currentKind)} matched your search and filters — but ${hitsSentence} did.`
            : `${scopeKindLabel(currentKind)} is empty, but there ${otherLaneHits.length === 1 && otherLaneHits[0].count === 1 ? "is" : "are"} ${hitsSentence}.`,
          action: (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {otherLaneHits.slice(0, 3).map((hit) => (
                <Button
                  key={hit.kind}
                  size="sm"
                  variant="outline"
                  onClick={() => list.setScope(makeScope(hit.kind))}
                >
                  {hit.count === 1
                    ? `Show the ${singular} in ${scopeKindLabel(hit.kind)}`
                    : `Show the ${hit.count} ${plural} in ${scopeKindLabel(hit.kind)}`}
                </Button>
              ))}
              {isNarrowed ? clearSearchAndFilters : configuredEmptyAction}
            </div>
          ),
        }
      : null;

  const allArchivedEmptyState =
    archivedCount > 0
      ? {
          title: isNarrowed
            ? `No live ${plural} match`
            : probe.state === "known" && probe.more
              ? `Every ${singular} here is archived`
              : archivedCount === 1
                ? `The only ${singular} here is archived`
                : `All ${archivedCount} ${plural} are archived`,
          description: isNarrowed
            ? `Nothing live matched your current search and filters — but ${probe.state === "known" && probe.more ? "archived" : archivedCount} ${probe.state === "known" && probe.more ? plural : `archived ${archivedNoun}`} did. Widen them, or open the archived ${archivedNoun}.`
            : `Nothing is missing and nothing was deleted: every ${singular} in this view has been archived. Open them to restore one, or start a new one.`,
          action: (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {archivedDoor}
              {isNarrowed ? searchMissAction : configuredEmptyAction}
            </div>
          ),
        }
      : null;

  const resolvedEmptyState =
    failureEmptyState ??
    allArchivedEmptyState ??
    otherLaneEmptyState ??
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
                "Widen the search or filters, or try another lane.",
              // A SEARCH that found nothing keeps the page's own offer beside
              // the widen door — `New topic "<search>"` is the whole point of
              // an emptyAction render-prop that reads the search (page-pass
              // 2026-09-27, /research/topics: the offer never showed).
              action: searchMissAction,
            }
          : (teamEmptyState ?? {
              // Reached only when the archive axis is off for this surface, or
              // it answered `total: 0` — i.e. live + archived really is zero.
              ...config.emptyState,
              action: configuredEmptyAction,
            }));

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
  // A page where no row can be ticked (another person's decks in the My Orgs
  // lane) draws no select-all box either (page-pass 2026-09-27: a header
  // checkbox over rows with none read as broken).
  const isRowSelectable = config.bulkSelection?.isRowSelectable;
  const anyRowSelectable =
    !isRowSelectable || list.rows.some((row) => isRowSelectable(row));
  const tableSelection: MatrxDataTableSelectionConfig<TRow> | undefined =
    bulkEnabled && anyRowSelectable
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
  // The list's pager is a bottom bar: publish its height so floating
  // controls (the assists pill) rest above it instead of on its arrows.
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane || typeof ResizeObserver === "undefined") return undefined;
    const root = document.documentElement;
    const publish = () => {
      const footer = pane.querySelector<HTMLElement>("[data-matrx-table-footer]");
      if (!footer) return;
      const fromBottom = window.innerHeight - footer.getBoundingClientRect().top;
      if (fromBottom > 0 && fromBottom < 200)
        root.style.setProperty("--page-bottom-dock-h", `${Math.round(fromBottom)}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(pane);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--page-bottom-dock-h");
    };
  }, []);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // The room the table has (the body's content box), for the column priorities. Rounded to 8 px
  // so a scrollbar appearing or a sub-pixel change never re-renders the list.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const cs = getComputedStyle(body);
      const inner =
        body.clientWidth - (Number.parseFloat(cs.paddingLeft) || 0) - (Number.parseFloat(cs.paddingRight) || 0);
      const next = Math.floor(inner / 8) * 8;
      setListWidth((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    return () => ro.disconnect();
  }, []);
  // Once React has applied the real hidden set, the server-time marks have done their job.
  useEffect(() => {
    if (listWidth !== null && bodyRef.current) clearNoRoomMarks(bodyRef.current);
  }, [listWidth, noRoom.join("|")]);
  const pointerInPaneRef = useRef(false);
  const hoveredRowIdRef = useRef<string | null>(null);
  // Every handler on the controller is a fresh function each render (the
  // primitive's rule — the React Compiler owns memoization), so the listener
  // reads the latest through a ref instead of re-subscribing on every render.
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const listRef = useRef(list);
  listRef.current = list;

  // Row keys (config.rowKeys) read the latest row actions and query the same way.
  const rowKeys = config.rowKeys === true;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const queryRef = useRef(list.query);
  queryRef.current = list.query;
  // THE ROW CURSOR survives a re-render: a star moves the row (favorites first) and a live refresh
  // redraws the rows, and either drops the focus to the page. When that happens the cursor's row,
  // if it is still listed, takes the focus back — never from a field or control that has it.
  const cursorRowIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!rowKeys) return;
    const pane = paneRef.current;
    const id = cursorRowIdRef.current;
    if (!pane || !id) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const row = listRows(pane).find((el) => el.getAttribute("data-row-id") === id);
    if (!row) return;
    if (!row.hasAttribute("tabindex")) row.tabIndex = -1;
    row.focus({ preventScroll: true });
  });

  useEffect(() => {
    if (!bulkEnabled && !rowKeys) return;
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
      const plain = !event.metaKey && !event.ctrlKey && !event.shiftKey;
      // ROW KEYS FROM THE LIST'S OWN SEARCH BOX: ↓ leaves it for the first row, Esc clears the
      // text, then the filters, then leaves the box. Every other key is typing, never a row key.
      if (
        rowKeys &&
        active instanceof HTMLElement &&
        active.hasAttribute("data-entity-list-search") &&
        pane.contains(active)
      ) {
        if (event.key === "ArrowDown" && plain) {
          const moved = focusListRow(pane, null, 1);
          if (moved) {
            cursorRowIdRef.current = moved;
            event.preventDefault();
          }
          return;
        }
        if (event.key === "Escape" && plain) {
          event.preventDefault();
          const q = queryRef.current;
          if (q.search) listRef.current.setSearch("");
          else if (Object.keys(q.filters).length > 0) listRef.current.resetFilters();
          else active.blur();
        }
        return;
      }
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
      // A list that IS the page answers its row keys with nothing focused (the body) too.
      const nothingFocused = !active || active === document.body;
      if (!focusInPane && !pointerInPaneRef.current && !(rowKeys && nothingFocused)) return;

      if (rowKeys && plain) {
        const focusedRowEl =
          active instanceof Element ? active.closest<HTMLElement>("[data-row-id]") : null;
        if (event.key === "/") {
          const box = pane.querySelector<HTMLInputElement>("[data-entity-list-search]");
          if (box) {
            cursorRowIdRef.current = null;
            event.preventDefault();
            box.focus();
            box.select();
          }
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const step = event.key === "ArrowDown" ? 1 : -1;
          const moved = focusListRow(pane, focusedRowEl, step);
          if (moved) {
            cursorRowIdRef.current = moved;
            event.preventDefault();
          } else if (step === -1 && focusedRowEl) {
            // ↑ from the first row goes back to the box.
            cursorRowIdRef.current = null;
            pane.querySelector<HTMLInputElement>("[data-entity-list-search]")?.focus();
            event.preventDefault();
          }
          return;
        }
        // Enter on the ROW itself (a link or button inside it keeps its own Enter).
        if (event.key === "Enter" && focusedRowEl && active === focusedRowEl) {
          const row = rowById(focusedRowEl.getAttribute("data-row-id"));
          if (row) {
            event.preventDefault();
            actionsRef.current.onOpenRow(row);
          }
          return;
        }
        if (event.key.toLowerCase() === "s" && config.favorite) {
          const rowId = focusedRowEl?.getAttribute("data-row-id") ?? hoveredRowIdRef.current;
          const row = rowById(rowId);
          const toggle = actionsRef.current.onToggleFavorite;
          if (row && toggle && config.favorite.canToggle(row)) {
            event.preventDefault();
            if (focusedRowEl) cursorRowIdRef.current = rowId ?? null;
            toggle(row);
          }
          return;
        }
      }
      if (!bulkEnabled) return;

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
    const rowById = (rowId: string | null | undefined) =>
      rowId ? list.rows.find((candidate) => config.getRowId(candidate) === rowId) : undefined;
    // A pointer press anywhere ends the keyboard cursor (the mouse leads from there).
    const onPointerDown = () => {
      cursorRowIdRef.current = null;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
    // `list.rows` and the config are read through the closure on purpose: the
    // listener is re-attached whenever the loaded page changes so `x` can never
    // toggle a row that is no longer on screen.
  }, [bulkEnabled, rowKeys, list.rows, config]);

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
    selectedIds: selection.ids,
  };

  // The toolbar, drawn in its own row from `sm` up and INSIDE the lane row on a phone (one row).
  const [phoneSearchOpen, setPhoneSearchOpen] = useState(false);
  const renderToolbar = (phoneRow?: { searchOpen: boolean; onSearchOpenChange: (open: boolean) => void }) =>
    config.tableToolbar ? null : (
          <EntityListToolbar
            phoneRow={phoneRow}
            // Below 48rem of the pane the Columns picker moves into View, as on a phone.
            columnsInViewMenu={Boolean(phoneRow) || (listWidth !== null && listWidth < NARROW_PANE_PX)}
            query={list.query}
            facets={list.facets}
            isFetching={list.isFetching}
            prefs={{
              ...prefs,
              ...effectiveSort,
              favoritesFirst: effectiveFavoritesFirst,
              hiddenColumns,
            }}
            // The picker offers the one column set of every lane (fix D).
            showSharedColumns
            noRoomColumns={noRoom}
            columns={pageConfig.columns}
            defaultHidden={defaultHidden}
            facetSections={config.facetSections}
            // The panel narrows the SCOPE through the same setter and the same
            // counts the tabs use — one state, two entry points.
            scopeSections={config.scopeSections}
            counts={list.counts}
            countsLoading={list.countsLoading}
            countsError={list.countsError}
            onScopeChange={list.setScope}
            onOrgChange={list.setOrgId}
            hasFavorites={Boolean(config.favorite)}
            hasArchived={config.supportsArchived !== false}
            searchPlaceholder={
              config.searchPlaceholder ?? `Search ${config.entityLabel.plural}…`
            }
            shortSearchPlaceholder={`Search ${config.entityLabel.plural}…`}
            deepSearchLabel={config.deepSearch?.label}
            hasCards={Boolean(cardsView)}
            hasRows={Boolean(rowsView)}
            onSearch={onSearch}
            searchToggles={config.searchToggles}
            panelSwitches={config.panelSwitches}
            tableControlsRef={setTableControlsSlot}
            tableTabsRef={setTableTabsSlot}
            surfaceKey={config.surfaceKey}
            onPatchQuery={list.patchQuery}
            // Sort changes route through commitSort so the panel's sort and the
            // table header's sort write the same two places (prefs + URL).
            onPatchPrefs={({ hiddenColumns: nextHidden, ...patch }) => {
              if (nextHidden) setHiddenColumns(nextHidden);
              if (Object.keys(patch).length > 0) patchView(patch);
            }}
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
    );

  const page = (
    <div
      ref={paneRef}
      // The platform's ONE touch floor for the whole list (page-pass
      // 2026-09-27, /education/quizzes: the row kebab, Take, rows-per-page and
      // the pager measured 32×32 on a phone). Desktop density is untouched.
      // The row the row keys focused shows a ring (config.rowKeys).
      // (The focused row's ring is the row's own: the package table's rows and the phone cards.)
      className="matrx-touch-targets flex h-full flex-col overflow-hidden"
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
        data-entity-list-header=""
        // THE PANE DECIDES, NEVER THE VIEWPORT (owner, /agents/all beside the chat panel
        // 2026-10-04: a 540px list at a 1024px viewport kept every control full-size and its header
        // took four lines). The header is the size container every header control asks: Tailwind's
        // `@…/list:` variants here, and the controls Button's `collapse="container"` (package).
        style={{ containerType: "inline-size", containerName: `list ${CONTROLS_CONTAINER_NAME}` }}
        className={cn(
          // gap, not space-y: a child hidden with display:none (the phone
          // select-all bar on a desktop) still made its sibling "not last"
          // under space-y and pushed the table down 8px the moment rows
          // arrived (page-pass /connected-sources, 2026-09-27).
          // PAGE RHYTHM (lib/layout/page-rhythm.ts): the gutter and the page top come from the
          // one scale; the controls inside keep their own dense set gap.
          "flex shrink-0 flex-col gap-1.5 px-[var(--matrx-page-gutter)] pb-2 sm:gap-2",
          clearsShellHeader
            ? "pt-[calc(var(--shell-header-h)+var(--matrx-page-top))]"
            : "pt-[var(--matrx-page-top)]",
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
          // The page top (feature cards, a KPI row, a banner) is a BIG block: the block gap
          // separates it from the list's controls — the header's own 6/8px set gap included.
          <div className="mb-[calc(var(--matrx-page-block-gap)-0.375rem)] max-h-[42dvh] overflow-y-auto sm:mb-[calc(var(--matrx-page-block-gap)-0.5rem)]">
            {typeof notice === "function" ? notice(list) : notice}
          </div>
        )}
        <div
          data-entity-list-control-row=""
          // THE TAP MODEL (matrx-tap-ring, app/globals.css): every control in
          // this row and the toolbar stays 28px and gets an invisible 44px hit
          // area on a touch screen, instead of the list's touch floor growing
          // each one to 44px (owner, /board/all on an iPad, 2026-10-02).
          // TWO ROWS, EACH ONE LINE (owner, 2026-10-04): this row never wraps. Below 48rem of the
          // pane the filters and the page actions are icons and the lanes are one select.
          className="matrx-tap-ring flex min-w-0 flex-nowrap items-center justify-between gap-1.5 @3xl/list:gap-2"
        >
          <div
            data-entity-list-lanes=""
            className={cn(
              // A LANE IS NEVER CLIPPED: the lanes take the free room and become one select when
              // their tabs do not fit it (EntityScopeTabs), at any width.
              "min-w-0 flex-1",
            )}
          >
            {scopeTabs && (
            <EntityScopeTabs
              scope={list.query.scope}
              scopes={visibleScopes}
              lanes={config.lanes}
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
          {/* THE DIMENSION FILTER (./EntityDimensionFilter): only where the surface's server honours it. */}
          {dimensionOffered && (
            <div data-entity-list-dimension="" className="ml-auto flex shrink-0 items-center">
              <EntityDimensionFilter
                valueId={dimensionValueOf(list.query.filters)}
                onChange={(valueId) => list.setFilters(withDimensionValue(list.query.filters, valueId))}
              />
            </div>
          )}
          {/* A narrowing the address carries is always visible and clearable, knob or not. */}
          {(orgFilterOffered || Boolean(list.query.orgId)) && (
            <div
              data-entity-list-org=""
              className={cn("flex shrink-0 items-center", !dimensionOffered && "ml-auto")}
            >
              <EntityOrgFilter
                orgId={list.query.orgId}
                onChange={list.setOrgId}
                counts={list.counts}
                countsLoading={list.countsLoading || Boolean(list.countsError)}
              />
            </div>
          )}
          {headerActions && (
            // A page's actions are the 28px controls (`@ai-matrx/design-system/controls`
            // Button); the scope makes a tap button among them match. The shell never forces a
            // height onto what the page passes (THE CANONICAL-OVERRIDE LAW).
            <ControlScope
              data-entity-list-actions=""
              className="flex shrink-0 items-center gap-1.5 @3xl/list:gap-2"
            >
              {typeof headerActions === "function"
                ? headerActions(list)
                : headerActions}
            </ControlScope>
          )}
        </div>

        {/* TWO ROWS, ALWAYS (owner, /agents/all 2026-10-04: "These two rows should never attempt
            to become one, regardless of space"): lanes · filters · actions above, the toolbar below
            — on a phone too, where it is the compact toolbar (search icon, Filters, View). */}
        {phoneWidth
          ? renderToolbar({ searchOpen: phoneSearchOpen, onSearchOpenChange: setPhoneSearchOpen })
          : renderToolbar()}

        {config.filterChips && (
          <EntityFilterChips
            columns={pageConfig.columns}
            filters={list.query.filters}
            toggles={config.searchToggles}
            onFiltersChange={list.setFilters}
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
            className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 type-secondary text-destructive-ink"
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
        {!list.error && customFieldSource?.error ? (
          <EntitySourceFailures
            operation={`Load ${plural}`}
            failures={[{ label: "The custom fields", error: customFieldSource.error }]}
            consequence="They are not offered as columns until they load; the list itself is unaffected."
          />
        ) : null}
        {!list.error && (list.countsError || list.facetsError || teamsError) && (
          <EntitySourceFailures
            operation={`Load ${plural}`}
            failures={[
              ...(list.countsError
                ? [{ label: "The tab counts", error: list.countsError }]
                : []),
              ...(list.facetsError
                ? [{ label: "The filter options", error: list.facetsError }]
                : []),
              // My team's own read (whose teams it shows). It used to fail with
              // nobody told: the tab fell back to a generic empty state.
              ...(teamsError ? [{ label: "Your teams", error: teamsError }] : []),
            ]}
            consequence={`${[
              list.countsError ? "The tabs show no number" : null,
              list.facetsError ? "the filters offer no options" : null,
              teamsError ? "My team cannot say whose items it shows" : null,
            ]
              .filter(Boolean)
              .join(", ")
              .replace(/, ([^,]*)$/, " and $1")
              .replace(/^./, (c) => c.toUpperCase())} until ${
              [list.countsError, list.facetsError, teamsError].filter(Boolean).length === 1
                ? "it loads"
                : "they load"
            }; the list itself is unaffected.`}
            onRetry={() => {
              list.refresh();
              if (teamsError) myTeams.refresh();
            }}
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
          anyRowSelectable ? (
            <EntityCardsSelectAll selection={selection} noun={bulkNoun} />
          ) : null
        ) : null}
      </div>

      {/*
        A guaranteed floor, not `min-h-0`: this area still SHRINKS (so its own
        `overflow-y-auto` still engages once content exceeds it), but never
        below a workable slice of table — the second half of the guard above.
        `min-h-0` alone trusts every notice to stay small; this trusts nothing.
      */}
      {/*
        data-matrx-page-end: the list is the page's end. Its foot is the page end once — plus
        whatever floats over the bottom that does not already rest above the pager — so the pager
        is never under the floating chat and never padded twice (styles/shell.css, page rhythm).
      */}
      <div ref={bodyRef} data-matrx-page-end="" className="min-h-[16rem] flex-1 overflow-y-auto px-[var(--matrx-page-gutter)]">
        {view === "table" ? (
          // read-gate-exempt: a failed read swaps resolvedEmptyState for failureEmptyState, and the alert above names the failure once
          <EntityListTable
            config={pageConfig}
            actions={actions}
            rows={list.rows}
            // read-gate-exempt: totalUnknown below tells the table the read failed, and it prints no row count then
            total={list.total}
            totalUnknown={Boolean(list.error)}
            {...(list.hasMore !== undefined ? { hasMore: list.hasMore } : {})}
            page={list.query.page}
            pageSize={pageSize}
            sort={effectiveSort.sort}
            direction={effectiveSort.direction}
            filters={list.query.filters}
            facets={list.facets}
            isLoading={list.isLoading}
            isFetching={list.isFetching}
            density={prefs.density}
            showSharedColumns
            hiddenColumns={tableHiddenColumns}
            onHiddenColumnsChange={setHiddenFromTable}
            columnOrder={prefs.columnOrder}
            onColumnOrderChange={(columnOrder) => setPrefs({ columnOrder })}
            onSaveEdits={saveEdits}
            {...(config.grouping
              ? {
                  grouping: {
                    columnId: groupColumnId,
                    onColumnIdChange: setGroupColumnId,
                    groupableColumnIds: config.grouping.groupableColumnIds,
                    ...(config.grouping.rowNoun ? { rowNoun: config.grouping.rowNoun } : {}),
                    ...(config.grouping.readCell ? { readCell: config.grouping.readCell } : {}),
                    ...(config.grouping.labelOf ? { labelOf: config.grouping.labelOf } : {}),
                  },
                }
              : {})}
            {...(config.virtualize ? { virtualize: config.virtualize } : {})}
            emptyState={resolvedEmptyState}
            {...(config.tableToolbar
              ? {}
              : { pageToolbarSlot: tableControlsSlot, pageTabsSlot: tableTabsSlot })}
            viewTabsStore={{
              views: prefs.savedViews ?? [],
              onChange: (savedViews) => setPrefs({ savedViews }),
            }}
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
                    onHiddenColumnsChange: setHiddenColumns,
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
              if (next.pageSize !== pageSize && !groupColumnId) {
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
          // read-gate-exempt: resolvedEmptyState becomes failureEmptyState when list.error is set, and the alert slot above shows the failure with its menu
          <EntityListEmpty state={resolvedEmptyState} />
        ) : (view === "cards" && cardsView) || rowsView ? (
          // The surface's own cards / rows (never the package table, whose rows ring themselves):
          // the row the row keys focused shows where it is (config.rowKeys).
          <div
            data-entity-list-alt-view=""
            className="contents [&_[data-row-id]:focus-visible]:bg-accent [&_[data-row-id]:focus-visible]:outline-2 [&_[data-row-id]:focus-visible]:-outline-offset-2 [&_[data-row-id]:focus-visible]:outline-primary"
          >
            {view === "cards" && cardsView ? cardsView(altViewProps) : rowsView?.(altViewProps)}
          </div>
        ) : null}

        {view === "table" ? (
          // First paint = settled paint: hide the columns with no room while the HTML parses
          // (columnPriority.ts). Both carry suppressHydrationWarning: the script text is the
          // same on both sides, and the marks it writes are attributes on the table's own cells.
          <>
            <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: NO_ROOM_CSS }} />
            <script
              suppressHydrationWarning
              dangerouslySetInnerHTML={{ __html: noRoomScript(pageConfig.columns) }}
            />
          </>
        ) : null}

        {view !== "table" && (
          <LoadMoreFooter
            loaded={list.rows.length}
            total={list.total}
            hasMore={list.hasMore}
            read={{ status: list.error ? "error" : list.isLoading ? "loading" : "ready", error: list.error }}
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
      <p className="type-title text-foreground">{state.title}</p>
      <p className="type-secondary text-muted-foreground">{state.description}</p>
      {state.action}
    </div>
  );
}

function LoadMoreFooter({
  loaded,
  total,
  read,
  page,
  pageSize,
  onPage,
  hasMore,
}: {
  loaded: number;
  total: number;
  /** An open-ended list: no "of N", and Next follows this. */
  hasMore?: boolean | undefined;
  /** The list read behind `total` — a failed read shows "—", never a count. */
  read: CountRead;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const shownThrough = (page - 1) * pageSize + loaded;
  const openEnded = hasMore !== undefined;
  if (total === 0 && !openEnded) return null;
  if (openEnded && loaded === 0 && page <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-4 type-secondary text-muted-foreground">
      <span className="tabular-nums">
        {openEnded ? (
          `${formatCount((page - 1) * pageSize + 1)}-${formatCount(shownThrough)}`
        ) : (
          <>
            {shownThrough} of <UntrustedCount value={total} read={read} label="Total" />
          </>
        )}
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
          disabled={openEnded ? !hasMore : shownThrough >= total}
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

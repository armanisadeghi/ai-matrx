"use client";

// lib/entity-list/useEntityList.ts
//
// The query half of a canonical entity-list surface. Owns the server round
// trip; owns nothing about presentation (that's useListViewPrefs). Lifted from
// features/agents/browse/useAgentBrowse with behaviour unchanged.
//
// Every fetch is generation-guarded: a slow response for an abandoned query can
// never overwrite a newer one. That class of bug is invisible until a user
// types fast on a slow connection and the list settles on the wrong results.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectArchivedDefault } from "@/lib/redux/preferences/userPreferenceSelectors";
import { commitUrlParams, useUrlSearchParams } from "@ai-matrx/kit/url-state";
import type { EntityListController, EntityListService } from "./config";
import { toEntityListFailure, type EntityListFailure } from "./failure";
import {
  DEFAULT_ENTITY_LIST_QUERY,
  EMPTY_FACETS,
  EMPTY_SCOPE_COUNTS,
  type ArchivedProbe,
  type EntityFacets,
  type EntityFilters,
  type EntityListQuery,
  type EntityScopeCounts,
} from "./types";
import {
  historyModeFor,
  queryToParamPatch,
  readQueryFromParams,
} from "./urlQuery";
import type { ListScope } from "@/lib/list-scope/types";
import { defaultListScopeFor } from "@/lib/list-scope";

const SEARCH_DEBOUNCE_MS = 250;

export interface UseEntityListArgs<TRow> {
  service: EntityListService<TRow>;
  /**
   * WHAT THIS SERVICE IS ASKING ON BEHALF OF — a string that changes whenever
   * the service's own INPUTS change.
   *
   * 🚨 THE DEFECT THIS CLOSES (one-resolution FIX-R6/F1, 2026-09-08, measured
   * on production `/mandates`). Every fetch here is keyed by the QUERY alone.
   * A host whose service closes over data that arrives ASYNCHRONOUSLY — the
   * caller's organizations, an active workspace, a report the page is still
   * loading — therefore fetches ONCE, with the empty first-render value, and
   * never again: the query never changed, so nothing re-asked. On `/mandates`
   * that produced a scope-counts call that knew about zero organizations, an
   * empty `counts.narrow.orgs`, and a Filters panel with no Organization
   * section at all for an admin who belongs to nine of them.
   *
   * The service object itself cannot be the dependency — hosts build it inline,
   * so it is a new object every render and would refetch forever. This key is
   * the honest middle: the host states what its service depends on, and the
   * shell re-asks exactly when that changes.
   *
   * Omit it ONLY when the service is built from module constants or from props
   * that are settled before mount.
   */
  serviceKey?: string;
  getRowId: (row: TRow) => string;
  /** Plural, lowercase — used in the shell's own failure copy ("No agents could be listed"). */
  entityLabelPlural: string;
  view: Pick<
    ListViewPrefs,
    "sort" | "direction" | "pageSize" | "favoritesFirst"
  >;
  /**
   * The surface's own starting query — where "no filters applied" lands and
   * where `resetFilters` returns to. A surface whose honest default is a SUBSET
   * of its corpus (conversations hide ~4.6k internal machine runs) declares it
   * here so the default is one visible, clearable filter instead of a predicate
   * buried in SQL that the user can never see or undo.
   */
  defaultFilters?: EntityFilters;
  /**
   * Where this surface STARTS, when that is not "Mine". A page mounted inside
   * a shell that is already about one scope (the admin System Agents route is
   * only ever about the platform corpus) opens there instead of showing the
   * user an empty Mine tab and asking them to find the right one.
   *
   * This is the starting point, never a cage: the scope tabs still switch
   * away from it, and `resetFilters` returns here.
   */
  defaultScope?: ListScope;
  /**
   * THE REGISTRY TOKEN whose `default_list_scope` decides where this list OPENS
   * (DD-137c / VISIBILITY-BY-CLASS §3.3, the second axis).
   *
   * 🚨 THIS IS WHY THE COMPLAINT HAPPENED. Four people in one organization each
   * researched SEO keywords and each of them saw only their own — every one of
   * those rows readable by every one of those people. Nobody decided that; the
   * literal `{ kind: "mine" }` in `DEFAULT_LIST_SCOPE` did, for every list on
   * the platform at once. A surface that names its token here opens where the
   * registry says it should, and `platform.entity_types.default_list_scope` is
   * one row to change when an organization decides otherwise.
   *
   * `defaultScope` still wins: a shell that is ALREADY about one scope (the
   * admin System Agents route) is making a statement the registry cannot know.
   * And the tabs still switch away from whatever this lands on — §3.3's "one
   * click away and never blocked" is unchanged.
   */
  registryToken?: string;
  /**
   * Put the query in the URL (scope / search / filters / archived / deep /
   * page). Off by default so existing surfaces are untouched; on, the URL is
   * the source of truth and Back/Forward/refresh/deep-link all work.
   */
  urlState?: boolean;
  /**
   * Whether this surface's entity has an archive axis at all
   * (`EntityListConfig.supportsArchived`, default TRUE). It gates THE
   * ALL-ARCHIVED FACT: a surface with no archive axis can never have rows
   * hidden by one, so it is never asked (`./types.ts` § ArchivedProbe).
   */
  supportsArchived?: boolean;
}

/**
 * The query, held either in React state or in the URL. Same interface either
 * way, so nothing downstream of here knows which surface opted in.
 */
function useQueryState(
  urlState: boolean,
  defaults: EntityListQuery,
): [
  EntityListQuery,
  (updater: (prev: EntityListQuery) => EntityListQuery) => void,
] {
  const [localQuery, setLocalQuery] = useState<EntityListQuery>(defaults);
  const searchParams = useUrlSearchParams();

  // useSyncExternalStore already re-renders on popstate, so a URL-backed query
  // needs no effect and no mirror state: Back/Forward simply re-parses.
  const urlQuery = readQueryFromParams(searchParams, defaults);
  const query = urlState ? urlQuery : localQuery;

  const setQuery = (updater: (prev: EntityListQuery) => EntityListQuery) => {
    if (!urlState) {
      setLocalQuery(updater);
      return;
    }
    // Re-read at commit time rather than trusting the render-time snapshot —
    // two updates in one tick would otherwise clobber each other.
    const current = readQueryFromParams(
      new URLSearchParams(window.location.search),
      defaults,
    );
    const next = updater(current);
    commitUrlParams(
      queryToParamPatch(next, defaults),
      historyModeFor(current, next),
    );
  };

  return [query, setQuery];
}

export function useEntityList<TRow>({
  service,
  serviceKey = "",
  getRowId,
  entityLabelPlural,
  view,
  defaultFilters,
  defaultScope,
  registryToken,
  urlState = false,
  supportsArchived = true,
}: UseEntityListArgs<TRow>): EntityListController<TRow> {
  // Where the registry says this list lands. It arrives ASYNCHRONOUSLY (one
  // read of platform.entity_types, cached for the whole session), so it is
  // seeded null and applied by the same late-value rule the archive knob uses
  // below — see THE LATE-KNOB PROBLEM. On any failure `resolveListScope` has
  // already announced itself and answered `mine`, the narrower screen.
  const [registryScope, setRegistryScope] = useState<ListScope | null>(null);
  useEffect(() => {
    if (!registryToken) return;
    let live = true;
    void defaultListScopeFor(registryToken).then((s) => {
      if (live) setRegistryScope(s);
    });
    return () => {
      live = false;
    };
  }, [registryToken]);
  // THE ARCHIVED-ITEMS LAW's knob (../common-docs/policies/archived-items.md
  // §6): the platform default hides archived rows, and a user may flip their
  // own starting point in Settings → Lists. It seeds the DEFAULT only — the
  // Archived control and a URL-carried value both win over it. Note the honest
  // consequence: because the URL omits a value equal to the default, a link
  // that carries no `archived` param reproduces the RECIPIENT's default, not
  // the sender's — the same way `defaultFilters` already behaves. Any list a
  // user deliberately switched carries the param and travels exactly.
  const archivedDefault = useAppSelector(selectArchivedDefault);
  const defaultQuery: EntityListQuery = {
    ...DEFAULT_ENTITY_LIST_QUERY,
    archived: archivedDefault,
    ...(defaultFilters ? { filters: defaultFilters } : {}),
    // Precedence, narrowest statement first: the HOST's explicit scope (a shell
    // that is already about one scope), then the REGISTRY, then the platform
    // literal. A host that says nothing and a token that says nothing both land
    // on `mine`, which is never wrong — only sometimes emptier than it should be.
    ...(registryScope ? { scope: registryScope } : {}),
    ...(defaultScope ? { scope: defaultScope } : {}),
  };
  const [rawQuery, setQuery] = useQueryState(urlState, defaultQuery);

  // 🚨 THE LATE-KNOB PROBLEM. A surface without `urlState` holds its query in
  // `useState(defaults)`, which is seeded ONCE — on the very first render, and
  // the preferences slice is a warm cache that rehydrates AFTER that. Wired
  // naively, the archive knob was written, persisted, and then ignored by
  // every non-URL list, which is worse than not having it: the setting says
  // one thing and the screen does another. So an UNTOUCHED archive axis
  // follows the knob whenever it lands; the moment the user picks a value on
  // the surface, their choice owns the axis for the rest of the session.
  // URL-backed surfaces need none of this — they re-parse against live
  // defaults on every render.
  const archivedTouched = useRef(false);
  // The registry's answer lands after the first render for exactly the same
  // reason the archive knob does, so it follows exactly the same rule: an
  // UNTOUCHED scope axis takes the default whenever it arrives; the moment the
  // user clicks a scope tab, their choice owns the axis for the session.
  const scopeTouched = useRef(false);
  const query: EntityListQuery = urlState
    ? rawQuery
    : {
        ...rawQuery,
        ...(archivedTouched.current ? {} : { archived: defaultQuery.archived }),
        ...(scopeTouched.current ? {} : { scope: defaultQuery.scope }),
      };
  // Seeded from the query, not from "" — a URL-backed surface opened at
  // `?q=seo` must not fire one throwaway unfiltered fetch before the debounce
  // catches up.
  const [debouncedSearch, setDebouncedSearch] = useState(() => query.search);
  const [rows, setRows] = useState<TRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<EntityScopeCounts>(EMPTY_SCOPE_COUNTS);
  // Counts have their OWN pending and failure state, because a scope section
  // that has no options yet must be able to tell "still reading" from "read,
  // and there are none" from "the read was refused" (FIX-R6/F1). One boolean
  // shared with the row query would answer none of the three.
  const [countsAnsweredFor, setCountsAnsweredFor] = useState<string | null>(
    null,
  );
  const [countsError, setCountsError] = useState<string | null>(null);
  const [facets, setFacets] = useState<EntityFacets>(EMPTY_FACETS);
  // Facets are an independent read. EMPTY_FACETS is only a safe payload
  // shape; it cannot mean that a facet read completed with zero values.
  const [facetsAnsweredFor, setFacetsAnsweredFor] = useState<string | null>(
    null,
  );
  const [facetsError, setFacetsError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<EntityListFailure | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  // ── THE MUTATION INVALIDATES THE COUNTS ──────────────────────────────────
  //
  // 🚨 A LIST MAY NOT KEEP COUNTING ROWS IT HAS ALREADY REMOVED.
  // Measured on production `/agents/all`: soft-deleting an agent spliced the
  // row out and decremented `total`, and the System scope tab went on saying
  // 418 for the rest of the session. `removeRow`/`patchRow` wrote only local
  // row state, and the counts/facets/archived reads are keyed by the QUERY —
  // which a mutation does not change — so nothing ever re-asked.
  //
  // ONE invalidation path, in the shell, not per feature: any row mutation
  // that goes through this hook bumps this token, and every DERIVED read
  // (scope counts, facets, the all-archived probe) is keyed by it. The row
  // PAGE is deliberately NOT keyed by it — the caller has already applied the
  // optimistic change, and refetching the page here would fight it with a
  // flash and could resurrect a row the server has not caught up on yet.
  const [mutationToken, setMutationToken] = useState(0);
  const invalidateDerivedReads = useCallback(
    () => setMutationToken((n) => n + 1),
    [],
  );

  const generation = useRef(0);
  const hasLoadedOnce = useRef(false);

  // Debounce only the text; every other query field applies immediately.
  useEffect(() => {
    const id = setTimeout(
      () => setDebouncedSearch(query.search),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(id);
  }, [query.search]);

  const effectiveQuery: EntityListQuery = { ...query, search: debouncedSearch };
  const queryKey = JSON.stringify({
    q: effectiveQuery,
    sort: view.sort,
    dir: view.direction,
    favFirst: view.favoritesFirst,
    size: view.pageSize,
    refreshToken,
    service: serviceKey,
  });

  useEffect(() => {
    const gen = ++generation.current;
    if (hasLoadedOnce.current) setIsFetching(true);
    else setIsLoading(true);

    void (async () => {
      try {
        const page = await service.fetchPage(effectiveQuery, {
          sort: view.sort,
          direction: view.direction,
          favoritesFirst: view.favoritesFirst,
          pageSize: view.pageSize,
        });
        if (gen !== generation.current) return; // a newer query won
        setRows(page.rows);
        setTotal(page.total);
        setError(null);
      } catch (err) {
        if (gen !== generation.current) return;
        // 🚨 ONE CHANNEL, ONE COPY (one-resolution R-O1). This used to ALSO
        // fire a toast, on the reasoning that a list going empty must not look
        // like "you have nothing here". It must not — and the failure slot in
        // EntityListPage, which renders off this very state, already says so
        // permanently, where a toast fades. Announcing the same event twice is
        // not louder, it is duplicated: on production `/mandates?scope=system`
        // a non-admin met the door's refusal THREE times at once (the banner,
        // plus one toast per refetch, because a service whose inputs land late
        // re-asks and every failure toasted again).
        //
        // The failure is CLASSIFIED here, not stringified: the shell decides
        // whether Retry may be offered and whether an empty state is allowed
        // to blame filters, and it can only decide that if it still knows the
        // door refused.
        setError(
          toEntityListFailure(err, `Failed to load ${entityLabelPlural}`),
        );
      } finally {
        if (gen === generation.current) {
          hasLoadedOnce.current = true;
          setIsLoading(false);
          setIsFetching(false);
        }
      }
    })();
  }, [queryKey]);

  // Counts depend on every filter EXCEPT the scope and the page, so they don't
  // re-fetch when the user just switches tabs or pages. The query handed to
  // the service carries ONLY those fields (scope pinned to the default, page
  // 1): counts are scope-independent by contract, and passing the live scope
  // here would hand the service a stale value from the last key change.
  const countsQuery: EntityListQuery = {
    ...DEFAULT_ENTITY_LIST_QUERY,
    search: debouncedSearch,
    deep: query.deep,
    archived: query.archived,
    filters: query.filters,
  };
  const countsKey = JSON.stringify({
    q: countsQuery,
    refreshToken,
    mutationToken,
    service: serviceKey,
  });

  // DERIVED, never written from an effect body: pending is simply "the counts
  // we are holding do not answer the question currently being asked".
  const countsLoading = countsAnsweredFor !== countsKey;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await service.fetchCounts(countsQuery);
        if (!cancelled) {
          setCounts(next);
          setCountsError(null);
        }
      } catch (err) {
        // Counts are an adornment; a failure must not blank the list. Still
        // reported, never swallowed — and a scope section that was waiting on
        // these options now says so instead of waiting forever (FIX-R6/F1).
        console.error(`[entity-list] scope counts failed`, err);
        if (!cancelled) {
          setCounts(EMPTY_SCOPE_COUNTS);
          setCountsError(
            err instanceof Error
              ? err.message
              : "the counts query failed with no message",
          );
        }
      } finally {
        if (!cancelled) setCountsAnsweredFor(countsKey);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [countsKey]);

  // Facets depend on scope + search + archived only. They deliberately ignore
  // the category/tag selection (a facet list that drops the option you just
  // deselected traps the user inside their own filter) — so the query handed
  // to the service carries an EMPTY filter bag, never a stale one.
  const facetsQuery: EntityListQuery = {
    ...DEFAULT_ENTITY_LIST_QUERY,
    scope: query.scope,
    search: debouncedSearch,
    deep: query.deep,
    archived: query.archived,
  };
  const facetsKey = JSON.stringify({
    q: facetsQuery,
    refreshToken,
    mutationToken,
    service: serviceKey,
  });

  // Like countsLoading, this is derived from the request identity rather than
  // written by an effect. A previously answered payload is stale as soon as
  // the query changes, so consumers can never present its values as counts for
  // the new query while the next request is still in flight.
  const facetsLoading = facetsAnsweredFor !== facetsKey;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await service.fetchFacets(facetsQuery);
        if (!cancelled) {
          setFacets(next);
          setFacetsError(null);
        }
      } catch (err) {
        console.error(`[entity-list] facets failed`, err);
        if (!cancelled) {
          setFacets(EMPTY_FACETS);
          setFacetsError(
            err instanceof Error
              ? err.message
              : "the facets query failed with no message",
          );
        }
      } finally {
        if (!cancelled) setFacetsAnsweredFor(facetsKey);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facetsKey]);

  // ── THE ALL-ARCHIVED FACT ────────────────────────────────────────────────
  //
  // 🚨 A LIST MAY NOT SAY "NONE" WHILE ITS OWN DEFAULT IS HIDING ROWS.
  // See `./types.ts` § ArchivedProbe for the measured defect (/maps printing
  // "No maps yet … Make one" with all 46 of the user's maps archived, two
  // clicks from its own Archived filter).
  //
  // Asked ONLY when the live half came back EMPTY, so a page that has rows —
  // which is nearly every page, nearly always — pays nothing at all. It is
  // deliberately `fetchPage` with `pageSize: 1` rather than `fetchCounts`:
  // `total` from the surface's OWN page reader is exactly the number of rows
  // the door this empty state offers will reveal, under the same scope, search
  // and filters, with no second query authority to drift from it. Every
  // service already implements it, so no config anywhere had to change.
  const archiveAxisIsHiding = supportsArchived && query.archived === "active";
  const liveHalfIsEmpty =
    !isLoading && !error && rows.length === 0 && total === 0;
  const archivedProbeKey =
    archiveAxisIsHiding && liveHalfIsEmpty
      ? JSON.stringify({
          q: { ...effectiveQuery, archived: "archived", page: 1 },
          refreshToken,
          mutationToken,
          service: serviceKey,
        })
      : null;
  const [archivedAnswer, setArchivedAnswer] = useState<{
    key: string;
    total: number | null;
  } | null>(null);

  useEffect(() => {
    if (!archivedProbeKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const page = await service.fetchPage(
          { ...effectiveQuery, archived: "archived", page: 1 },
          {
            sort: view.sort,
            direction: view.direction,
            favoritesFirst: view.favoritesFirst,
            pageSize: 1,
          },
        );
        if (!cancelled)
          setArchivedAnswer({ key: archivedProbeKey, total: page.total });
      } catch (err) {
        // NOTHING FAILS SILENTLY, and a failed count is NOT zero: falling back
        // to the static "none yet" copy here would restore the very lie this
        // read exists to prevent. `total: null` makes the shell say it cannot
        // tell and point at the control.
        console.error(`[entity-list] archived count failed`, err);
        if (!cancelled)
          setArchivedAnswer({ key: archivedProbeKey, total: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [archivedProbeKey]);

  const archivedProbe: ArchivedProbe = !archivedProbeKey
    ? { state: "off" }
    : archivedAnswer?.key !== archivedProbeKey
      ? { state: "loading" }
      : archivedAnswer.total === null
        ? { state: "failed" }
        : { state: "known", total: archivedAnswer.total };

  // Plain functions, NOT useCallback: `setQuery` is re-created per render for a
  // URL-backed surface, so an empty dep array here would freeze the very first
  // commit function and every later change would write against a stale URL.
  // The React Compiler owns memoization (CLAUDE.md core invariant).
  const patchQuery = (patch: Partial<EntityListQuery>) => {
    // The surface's archive control patches this axis (EntityFilterPanel's
    // Archived radio). Once the user has chosen, the knob stops seeding it.
    if (patch.archived !== undefined) archivedTouched.current = true;
    if (patch.scope !== undefined) scopeTouched.current = true;
    setQuery((prev) => ({
      ...prev,
      ...patch,
      // Any change to what is being asked for resets pagination — otherwise
      // you land on page 7 of a 2-page result and see nothing.
      page: patch.page ?? 1,
    }));
  };

  const setScope = (scope: ListScope) => patchQuery({ scope });
  const setFilters = (filters: EntityFilters) => patchQuery({ filters });
  const setSearch = (search: string) => patchQuery({ search });
  const setDeep = (deep: boolean) => patchQuery({ deep });
  const setPage = (page: number) => setQuery((prev) => ({ ...prev, page }));
  // Back to the SURFACE's default, not to the empty query. On a surface with
  // `defaultFilters`, "Clear filters" meaning "now show me the 4,613 internal
  // machine runs too" would be a trap; the explicit door to those is its own
  // control.
  // "Clear filters" hands the archive axis back to the user's knob, not to a
  // hardcoded "active" — the knob IS their default.
  const resetFilters = () => {
    archivedTouched.current = false;
    // "Clear filters" hands the scope axis back to the registry too — returning
    // it to a literal would put the complaint back one click at a time.
    scopeTouched.current = false;
    setQuery((prev) => ({
      ...prev,
      archived: defaultQuery.archived,
      filters: defaultQuery.filters,
      page: 1,
    }));
  };
  const refresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  const removeRow = useCallback(
    (id: string) => {
      setRows((prev) => prev.filter((r) => getRowId(r) !== id));
      setTotal((prev) => Math.max(prev - 1, 0));
      // The scope tabs, the facet options and the all-archived probe were all
      // counted BEFORE this row went away. See the token's banner above.
      invalidateDerivedReads();
    },
    [invalidateDerivedReads],
  );

  const patchRow = useCallback(
    (id: string, patch: Partial<TRow>) => {
      setRows((prev) =>
        prev.map((r) => (getRowId(r) === id ? { ...r, ...patch } : r)),
      );
      // A patch moves a row BETWEEN buckets (archived, favorite, state), so the
      // per-bucket counts are just as stale as they are after a removal.
      invalidateDerivedReads();
    },
    [invalidateDerivedReads],
  );

  return {
    query,
    rows,
    total,
    counts,
    countsLoading,
    countsError,
    facets,
    facetsLoading,
    facetsError,
    archivedProbe,
    defaultArchived: defaultQuery.archived,
    isLoading,
    isFetching,
    error,
    setScope,
    setFilters,
    setSearch,
    setDeep,
    patchQuery,
    setPage,
    resetFilters,
    refresh,
    removeRow,
    patchRow,
  };
}

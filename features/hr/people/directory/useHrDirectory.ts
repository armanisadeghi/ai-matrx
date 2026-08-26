"use client";

// features/hr/people/directory/useHrDirectory.ts
//
// ROUTE 10's ONE QUERY. `hr_directory_list` counts and pages from the same CTE,
// so `total` is the size of the FULL result set — never "showing the first 100"
// (SPEC-EMPLOYEES §5.1 rule 1 / SPEC-UI-IA LAW 3). Nothing here fetches "all"
// and slices locally, and nothing derives a facet list from loaded rows.
//
// 🚨 THE URL IS THE ONE OWNER OF THE QUERY. Every filter this surface applies is
// a page-level search param — `q`, `status`, `department`, `location`, `title`,
// `worker_class`, `manager`, `my_team`, `hired_from`, `hired_to` — because
// `features/hr/routes.ts` builds DOORS out of exactly those names: a count of
// direct reports opens `/hr/people?manager=<id>`, and a filtered list somebody
// pastes into chat has to resolve to the same list. Storing the same state in
// `table.hr-people.*` as well would give one query two owners that silently
// disagree, so this hook adapts the door params to
// `MatrxDataTableQueryState` instead of running the generic table URL hook.
//
// STYLE (table vs cards, density, page size) is a per-user preference and lives
// in `useListViewPrefs` — a different axis, deliberately not in the URL.
//
// 🚨 A REFUSAL IS DATA. `hr_directory_list` raises `42501` for a caller with no
// standing, which `service.ts` flattens to `{kind:"denied"}`. That is rendered
// as a refusal, never as an empty list — an empty directory and a refused
// directory are different facts and look different.

import { useCallback, useEffect, useState } from "react";

import type {
  ColumnFiltersState,
  MatrxDataTableQueryState,
  SortState,
} from "@/components/official/matrx-data-table/types";
import {
  commitUrlParams,
  useUrlSearchParams,
} from "@/lib/url-state/useUrlState";

import {
  HR_DIRECTORY_SORTS,
  HR_DIRECTORY_STATUSES,
  HR_WORKER_CLASSES,
  type HrDirectorySort,
  type HrDirectoryStatus,
  type HrWorkerClass,
} from "../../constants";
import { fetchHrDirectory } from "../../service";
import type {
  HrDenied,
  HrDirectoryFilter,
  HrDirectoryPage,
  HrFailed,
} from "../../types";

// ── Column ids ⇄ door params ────────────────────────────────────────────────
//
// The column id a header filters on and the query param a door writes are the
// SAME NAME on both sides of this table, so a filter set from a column header
// and a filter arrived at through a door are indistinguishable.

export const HR_DIRECTORY_TABLE_ID = "hr-people";

const FILTER_PARAM: Record<string, string> = {
  directory_status: "status",
  department: "department",
  location: "location",
  job_title: "title",
  worker_class: "worker_class",
  manager_name: "manager",
};

const DEFAULT_PAGE_SIZE = 25;

const DEFAULT_SORT: SortState = { id: "display_name", direction: "asc" };

function toDirectorySort(id: string | undefined): HrDirectorySort {
  // The server clamps anything it does not know; clamping here too keeps the
  // request honest rather than sending a column name the RPC will ignore.
  return (HR_DIRECTORY_SORTS as readonly string[]).includes(id ?? "")
    ? (id as HrDirectorySort)
    : "display_name";
}

function parseCsv(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function asStatuses(values: string[]): HrDirectoryStatus[] {
  return values.filter((v): v is HrDirectoryStatus =>
    (HR_DIRECTORY_STATUSES as readonly string[]).includes(v),
  );
}

function asWorkerClass(value: string | null): HrWorkerClass | null {
  return value && (HR_WORKER_CLASSES as readonly string[]).includes(value)
    ? (value as HrWorkerClass)
    : null;
}

// ── The URL-backed query state ──────────────────────────────────────────────

export type HrDirectoryUrlState = {
  /** Hand straight to the table's controlled `query.state`. */
  state: MatrxDataTableQueryState;
  /** Search-debounced. Feed THIS to the fetch, so keystrokes are not queries. */
  queryState: MatrxDataTableQueryState;
  onStateChange: (next: MatrxDataTableQueryState) => void;
  /** The manager scope tab (`?manager=`), which is a SCOPE, not a column filter. */
  myTeam: boolean;
  setMyTeam: (on: boolean) => void;
  hiredFrom: string | null;
  hiredTo: string | null;
  setHireRange: (from: string | null, to: string | null) => void;
  /** Every applied narrowing, in words, for the filtered-empty state. */
  describeFilters: (labels: HrFilterLabelLookup) => string[];
  clearAll: () => void;
  activeFilterCount: number;
};

/**
 * Resolve an id to a human label for the filtered-empty sentence. A
 * filtered-empty state that says `department=8f3c…` has not stated the filters
 * in words, which is what SPEC-EMPLOYEES §2.2 route 10 asks for.
 */
export type HrFilterLabelLookup = (
  columnId: string,
  value: string,
) => string | null;

export function useHrDirectoryUrlState(): HrDirectoryUrlState {
  const params = useUrlSearchParams();

  const columnFilters: ColumnFiltersState = {};
  for (const [columnId, param] of Object.entries(FILTER_PARAM)) {
    const values = parseCsv(params.get(param));
    if (values.length === 0) continue;
    columnFilters[columnId] = { kind: "select", value: values[0], values };
  }

  const sortRaw = params.get("sort");
  const sort: SortState = (() => {
    if (!sortRaw) return DEFAULT_SORT;
    const at = sortRaw.lastIndexOf(".");
    if (at <= 0) return DEFAULT_SORT;
    const direction = sortRaw.slice(at + 1);
    if (direction !== "asc" && direction !== "desc") return DEFAULT_SORT;
    return { id: sortRaw.slice(0, at), direction };
  })();

  const pageRaw = Number.parseInt(params.get("page") ?? "", 10);
  const pageSizeRaw = Number.parseInt(params.get("ps") ?? "", 10);

  const state: MatrxDataTableQueryState = {
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    pageSize:
      Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
        ? pageSizeRaw
        : DEFAULT_PAGE_SIZE,
    search: params.get("q") ?? "",
    searchMatchMode: "contains",
    anyOf: "",
    layeredFilters: [],
    columnFilters,
    sort,
  };

  const [debouncedSearch, setDebouncedSearch] = useState(state.search);
  useEffect(() => {
    if (state.search === debouncedSearch) return;
    const timer = window.setTimeout(() => setDebouncedSearch(state.search), 300);
    return () => window.clearTimeout(timer);
  }, [state.search, debouncedSearch]);

  const write = useCallback(
    (patch: Record<string, string | null>, history: "push" | "replace") => {
      commitUrlParams(patch, history);
    },
    [],
  );

  const onStateChange = useCallback(
    (next: MatrxDataTableQueryState) => {
      const patch: Record<string, string | null> = {
        q: next.search || null,
        page: next.page > 1 ? String(next.page) : null,
        ps: next.pageSize !== DEFAULT_PAGE_SIZE ? String(next.pageSize) : null,
      };

      const sortToken = next.sort
        ? `${next.sort.id}.${next.sort.direction}`
        : null;
      patch.sort =
        sortToken && sortToken !== `${DEFAULT_SORT.id}.${DEFAULT_SORT.direction}`
          ? sortToken
          : null;

      for (const [columnId, param] of Object.entries(FILTER_PARAM)) {
        const value = next.columnFilters[columnId];
        if (!value || value.kind !== "select") {
          patch[param] = null;
          continue;
        }
        const values =
          value.values && value.values.length > 0
            ? value.values
            : value.value
              ? [value.value]
              : [];
        patch[param] = values.length > 0 ? values.join(",") : null;
      }

      // A text edit replaces rather than pushing, so a search does not fill the
      // back stack with one entry per keystroke.
      const textOnly = next.search !== state.search && next.page === state.page;
      write(patch, textOnly ? "replace" : "push");
    },
    [state.page, state.search, write],
  );

  const myTeam = params.get("my_team") === "1";
  const setMyTeam = useCallback(
    (on: boolean) => write({ my_team: on ? "1" : null, page: null }, "push"),
    [write],
  );

  const hiredFrom = params.get("hired_from");
  const hiredTo = params.get("hired_to");
  const setHireRange = useCallback(
    (from: string | null, to: string | null) =>
      write({ hired_from: from, hired_to: to, page: null }, "push"),
    [write],
  );

  const activeFilterCount =
    Object.keys(columnFilters).length +
    (state.search ? 1 : 0) +
    (myTeam ? 1 : 0) +
    (hiredFrom || hiredTo ? 1 : 0);

  const describeFilters = useCallback(
    (labels: HrFilterLabelLookup): string[] => {
      const out: string[] = [];
      if (state.search) out.push(`name or email containing “${state.search}”`);
      if (myTeam) out.push("only people who report to you");
      for (const [columnId, value] of Object.entries(columnFilters)) {
        if (!value || value.kind !== "select") continue;
        const values =
          value.values && value.values.length > 0 ? value.values : [value.value];
        const named = values.map((v) => labels(columnId, v) ?? v);
        out.push(`${COLUMN_WORDS[columnId] ?? columnId}: ${named.join(" or ")}`);
      }
      if (hiredFrom && hiredTo) out.push(`hired between ${hiredFrom} and ${hiredTo}`);
      else if (hiredFrom) out.push(`hired on or after ${hiredFrom}`);
      else if (hiredTo) out.push(`hired on or before ${hiredTo}`);
      return out;
    },
    [columnFilters, hiredFrom, hiredTo, myTeam, state.search],
  );

  const clearAll = useCallback(() => {
    const patch: Record<string, string | null> = {
      q: null,
      page: null,
      my_team: null,
      hired_from: null,
      hired_to: null,
    };
    for (const param of Object.values(FILTER_PARAM)) patch[param] = null;
    write(patch, "push");
  }, [write]);

  return {
    state,
    queryState: { ...state, search: debouncedSearch },
    onStateChange,
    myTeam,
    setMyTeam,
    hiredFrom,
    hiredTo,
    setHireRange,
    describeFilters,
    clearAll,
    activeFilterCount,
  };
}

const COLUMN_WORDS: Record<string, string> = {
  directory_status: "status",
  department: "department",
  location: "location",
  job_title: "job title",
  worker_class: "worker class",
  manager_name: "manager",
};

// ── The fetch ───────────────────────────────────────────────────────────────

export type HrDirectoryState = {
  page: HrDirectoryPage | null;
  isLoading: boolean;
  isFetching: boolean;
  error: HrDenied | HrFailed | null;
  refresh: () => void;
};

function toFilter(
  state: MatrxDataTableQueryState,
  extras: {
    myTeam: boolean;
    hiredFrom: string | null;
    hiredTo: string | null;
    myEmploymentId: string | null;
  },
): HrDirectoryFilter {
  const select = (columnId: string): string[] => {
    const value = state.columnFilters[columnId];
    if (!value || value.kind !== "select") return [];
    return value.values && value.values.length > 0
      ? value.values
      : value.value
        ? [value.value]
        : [];
  };

  const filter: HrDirectoryFilter = {};
  if (state.search) filter.search = state.search;

  const statuses = asStatuses(select("directory_status"));
  if (statuses.length > 0) filter.status = statuses;

  const [department] = select("department");
  if (department) filter.department_id = department;
  const [location] = select("location");
  if (location) filter.location_id = location;
  const [jobTitle] = select("job_title");
  if (jobTitle) filter.job_title_id = jobTitle;

  const workerClass = asWorkerClass(select("worker_class")[0] ?? null);
  if (workerClass) filter.worker_class = workerClass;

  const [manager] = select("manager_name");
  if (manager) filter.manager_employee_id = manager;

  // `my_team` is a SCOPE, not a column: the server resolves "reports to one of
  // my employments" from the caller's own identity. Sending an employment id we
  // guessed client-side would be a second, weaker answer to the same question.
  if (extras.myTeam) filter.my_team = extras.myEmploymentId ?? "1";

  return filter;
}

/**
 * The hire-date range is applied client-side against the returned page ONLY
 * when the server has no filter key for it — which it does not today
 * (`hr_directory_list`'s `p_filter` carries no date range, read live
 * 2026-08-26). Filtering a page locally would silently break pagination and
 * the total, so instead the range is carried in the URL, stated in the toolbar,
 * and NOT applied: the control announces that the server filter is not live
 * rather than lying with a wrong count. Tracked in the lane report.
 */
export const HR_HIRE_RANGE_SERVER_FILTER_LIVE = false;

/** Exactly what one page request is. Serialized as the effect's dependency. */
type HrDirectoryRequest = {
  organizationId: string | null;
  filter: HrDirectoryFilter;
  limit: number;
  offset: number;
  sort: HrDirectorySort;
  direction: "asc" | "desc";
  reloadToken: number;
};

export function useHrDirectory(args: {
  organizationId: string | null;
  queryState: MatrxDataTableQueryState;
  myTeam: boolean;
  hiredFrom: string | null;
  hiredTo: string | null;
  myEmploymentId: string | null;
}): HrDirectoryState {
  const {
    organizationId,
    queryState,
    myTeam,
    hiredFrom,
    hiredTo,
    myEmploymentId,
  } = args;

  const [page, setPage] = useState<HrDirectoryPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<HrDenied | HrFailed | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  // 🚨 THE REQUEST IS SERIALIZED ON PURPOSE, and the effect parses it back.
  //
  // `queryState.columnFilters` is rebuilt from the URL on every render, so a
  // fresh object identity arrives every time this hook runs. An effect that
  // depended on it would re-fetch, set state, re-render, and re-fetch forever.
  // Serializing gives the effect a STRING dependency that changes only when the
  // query genuinely changed — with a complete, honest dependency array and no
  // suppressed lint rule and no ref written during render.
  const request = JSON.stringify({
    organizationId,
    filter: toFilter(queryState, { myTeam, hiredFrom, hiredTo, myEmploymentId }),
    limit: queryState.pageSize,
    offset: (queryState.page - 1) * queryState.pageSize,
    sort: toDirectorySort(queryState.sort?.id),
    direction: queryState.sort?.direction ?? "asc",
    reloadToken,
  } satisfies HrDirectoryRequest);

  useEffect(() => {
    const parsed: HrDirectoryRequest = JSON.parse(request);
    if (!parsed.organizationId) return;
    const organization = parsed.organizationId;

    let cancelled = false;
    setIsFetching(true);

    (async () => {
      const result = await fetchHrDirectory({
        organizationId: organization,
        filter: parsed.filter,
        limit: parsed.limit,
        offset: parsed.offset,
        sort: parsed.sort,
        direction: parsed.direction,
      });
      if (cancelled) return;

      if (result.ok) {
        setPage(result.data);
        setError(null);
      } else {
        // A refusal REPLACES the rows. Keeping a previous page on screen behind
        // a refusal would show data the server just declined to serve.
        setPage(null);
        setError(result);
      }
      setIsLoading(false);
      setIsFetching(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [request]);

  return { page, isLoading, isFetching, error, refresh };
}

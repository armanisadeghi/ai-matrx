"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  ColumnFilterValue,
  ColumnFiltersState,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import type { MarketingTableStateOptions } from "@/features/marketing/types";
import {
  decodeLayeredFilterRules,
  encodeLayeredFilterRules,
} from "@/components/official/matrx-data-table/layered-filters";

const PAGE_SIZE_OPTIONS = new Set([10, 25, 50, 100, 250]);

/**
 * Separator for a multi-choice select filter in the URL (`select:a|b`).
 * Without this the `values` OR-set was silently dropped on every URL write —
 * so a multi-select filter never survived a reload, and no link could point
 * at one (the "Awaiting" / "Needs retry" backlink counts need exactly that).
 */
const MULTI_SELECT_SEPARATOR = "|";

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function decodeFilter(raw: string): ColumnFilterValue | undefined {
  const separator = raw.indexOf(":");
  if (separator < 0) return undefined;
  const kind = raw.slice(0, separator);
  const value = raw.slice(separator + 1);

  if (kind === "text") return { kind: "text", value };
  if (kind === "select") {
    // Multi-choice OR sets travel as `select:a|b`; a lone value stays
    // `select:a` (what every existing link and stored URL already carries).
    const values = value.split(MULTI_SELECT_SEPARATOR).filter(Boolean);
    return values.length > 1
      ? { kind: "select", value: values[0], values }
      : { kind: "select", value };
  }
  if (kind === "boolean") return { kind: "boolean", value: value === "true" };
  if (kind === "number") {
    const [minRaw, maxRaw] = value.split(",", 2);
    const min = minRaw === "" ? undefined : Number(minRaw);
    const max = maxRaw === "" ? undefined : Number(maxRaw);
    return {
      kind: "number",
      min: Number.isFinite(min) ? min : undefined,
      max: Number.isFinite(max) ? max : undefined,
    };
  }
  return undefined;
}

function encodeFilter(filter: ColumnFilterValue): string {
  if (filter.kind === "text") return `text:${filter.value}`;
  if (filter.kind === "select") {
    return filter.values && filter.values.length > 1
      ? `select:${filter.values.join(MULTI_SELECT_SEPARATOR)}`
      : `select:${filter.values?.[0] ?? filter.value}`;
  }
  if (filter.kind === "boolean") return `boolean:${filter.value}`;
  return `number:${filter.min ?? ""},${filter.max ?? ""}`;
}

function readFilters(params: URLSearchParams): ColumnFiltersState {
  const filters: ColumnFiltersState = {};
  for (const [key, raw] of params.entries()) {
    if (!key.startsWith("f_")) continue;
    const decoded = decodeFilter(raw);
    if (decoded) filters[key.slice(2)] = decoded;
  }
  return filters;
}

/**
 * Remove every URL param this hook owns (page/pageSize/q/anyOf/sort/direction
 * + `f_*` filters). Views that swap the table under a shared URL (workspace
 * tabs, insight lenses) call this so one slice's paging/sort/filters never
 * leak into the next slice's server query.
 */
export function clearTableUrlParams(params: URLSearchParams): void {
  for (const key of [
    "page",
    "pageSize",
    "q",
    "anyOf",
    "layers",
    "sort",
    "direction",
  ]) {
    params.delete(key);
  }
  for (const key of Array.from(params.keys())) {
    if (key.startsWith("f_")) params.delete(key);
  }
}

function writeState(
  params: URLSearchParams,
  state: MatrxDataTableQueryState,
  defaults: MarketingTableStateOptions,
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of Array.from(next.keys())) {
    if (key.startsWith("f_")) next.delete(key);
  }

  const defaultPageSize = defaults.defaultPageSize ?? 25;
  state.page === 1 ? next.delete("page") : next.set("page", String(state.page));
  state.pageSize === defaultPageSize
    ? next.delete("pageSize")
    : next.set("pageSize", String(state.pageSize));
  state.search ? next.set("q", state.search) : next.delete("q");
  state.anyOf ? next.set("anyOf", state.anyOf) : next.delete("anyOf");
  const encodedLayers = encodeLayeredFilterRules(state.layeredFilters);
  encodedLayers ? next.set("layers", encodedLayers) : next.delete("layers");

  if (
    state.sort &&
    (state.sort.id !== defaults.defaultSort.id ||
      state.sort.direction !== defaults.defaultSort.direction)
  ) {
    next.set("sort", state.sort.id);
    next.set("direction", state.sort.direction);
  } else {
    next.delete("sort");
    next.delete("direction");
  }

  for (const [column, filter] of Object.entries(state.columnFilters)) {
    if (filter) next.set(`f_${column}`, encodeFilter(filter));
  }
  return next;
}

function readState(
  params: URLSearchParams,
  defaults: MarketingTableStateOptions,
): MatrxDataTableQueryState {
  const defaultPageSize = defaults.defaultPageSize ?? 25;
  const requestedPageSize = positiveInt(
    params.get("pageSize"),
    defaultPageSize,
  );
  const pageSize = PAGE_SIZE_OPTIONS.has(requestedPageSize)
    ? requestedPageSize
    : defaultPageSize;
  const sortId = params.get("sort");
  const direction = params.get("direction");
  return {
    page: positiveInt(params.get("page"), 1),
    pageSize,
    search: params.get("q") ?? "",
    anyOf: params.get("anyOf") ?? "",
    layeredFilters: decodeLayeredFilterRules(params.get("layers")),
    columnFilters: readFilters(params),
    sort: sortId
      ? { id: sortId, direction: direction === "asc" ? "asc" : "desc" }
      : defaults.defaultSort,
  };
}

/** URL-owned table state with immediate input feedback and debounced DB reads. */
export function useMarketingTableState(options: MarketingTableStateOptions) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlState = searchParams.toString();
  const defaultsRef = useRef(options);
  const [state, setState] = useState<MatrxDataTableQueryState>(() =>
    readState(new URLSearchParams(urlState), options),
  );
  const [queryState, setQueryState] = useState(state);
  const queryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWrittenUrl = useRef<string | null>(null);

  useEffect(() => {
    if (lastWrittenUrl.current === urlState) {
      lastWrittenUrl.current = null;
      return;
    }
    const next = readState(new URLSearchParams(urlState), defaultsRef.current);
    setState(next);
    setQueryState(next);
  }, [urlState]);

  useEffect(
    () => () => {
      if (queryTimer.current) clearTimeout(queryTimer.current);
      if (urlTimer.current) clearTimeout(urlTimer.current);
    },
    [],
  );

  const onStateChange = (nextState: MatrxDataTableQueryState) => {
    setState(nextState);
    if (queryTimer.current) clearTimeout(queryTimer.current);
    queryTimer.current = setTimeout(() => setQueryState(nextState), 250);

    const nextParams = writeState(
      new URLSearchParams(searchParams.toString()),
      nextState,
      options,
    );
    const query = nextParams.toString();
    if (urlTimer.current) clearTimeout(urlTimer.current);
    urlTimer.current = setTimeout(() => {
      lastWrittenUrl.current = query;
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    }, 250);
  };

  return { state, queryState, onStateChange };
}

"use client";

// features/scopes/hooks/useKindItems.ts
//
// One kind's items for a person or an organization — most recent first, searched by name ON THE
// SERVER, loaded a page at a time. Page size is the feature knob resources.inventory/page_size
// (default 50; an organization or a person may override it). The same database filter as
// `useKindCounts`, so paging to the end yields exactly the count. Logic only, no UI.
//
//   const files = useKindItems("file", { kind: "mine" }, query);
//   files.items; files.hasMore && files.loadMore();

import React from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import {
  fetchKindItemsPage,
  INVENTORY_PAGE_SIZE_KNOB,
  kindScopeFromKey,
  kindScopeKey,
  type KindItem,
  type KindScope,
} from "@/features/scopes/service/kindInventory";

/** Typing pause before the server search runs. */
const SEARCH_SETTLE_MS = 250;

export interface UseKindItemsResult {
  items: KindItem[];
  /** First page (or a new search) is loading. */
  loading: boolean;
  /** A further page is loading. */
  loadingMore: boolean;
  /** The last page came back full, so there may be more. */
  hasMore: boolean;
  loadMore: () => void;
  /** The read failed — show it, never "nothing here". */
  error: Error | null;
  reload: () => void;
  /** Resolved page size (the knob), or null while it resolves. */
  pageSize: number | null;
}

interface ListState {
  key: string;
  items: KindItem[];
  hasMore: boolean;
  error: Error | null;
  loadingMore: boolean;
}

const EMPTY: ListState = { key: "", items: [], hasMore: false, error: null, loadingMore: false };

export function useKindItems(
  kind: string | null | undefined,
  scope: KindScope | null | undefined,
  query: string = "",
  options?: {
    /** The organization the screen stands in, for resolving the page-size knob on a "mine" list. */
    organizationId?: string | null;
  },
): UseKindItemsResult {
  const userId = useAppSelector(selectUserId);
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const scopeKey = kindScopeKey(scope);
  // The knob resolves against the organization being listed, else the one the screen stands in,
  // else the one the person is working in.
  const knobOrganizationId =
    scope?.kind === "organization"
      ? scope.organizationId
      : (options?.organizationId ?? activeOrganizationId);
  const rawPageSize = useEffectiveKnob(knobOrganizationId, userId, INVENTORY_PAGE_SIZE_KNOB);
  const pageSize = typeof rawPageSize === "number" && rawPageSize > 0 ? rawPageSize : null;

  const [settledQuery, setSettledQuery] = React.useState(query.trim());
  React.useEffect(() => {
    const next = query.trim();
    const timer = setTimeout(() => setSettledQuery(next), SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const [attempt, setAttempt] = React.useState(0);
  const listKey = kind && scopeKey && pageSize
    ? `${kind}|${scopeKey}|${pageSize}|${settledQuery}|${attempt}`
    : "";
  const [state, setState] = React.useState<ListState>(EMPTY);
  // Guards a slow page from landing on a list whose key has moved on.
  const liveKey = React.useRef("");

  React.useEffect(() => {
    liveKey.current = listKey;
    const stableScope = kindScopeFromKey(scopeKey);
    if (!listKey || !kind || !stableScope || !pageSize) return undefined;
    let cancelled = false;
    fetchKindItemsPage({ token: kind, scope: stableScope, query: settledQuery, offset: 0, limit: pageSize })
      .then(
        (page) => {
          if (cancelled) return;
          setState({ key: listKey, items: page, hasMore: page.length === pageSize, error: null, loadingMore: false });
        },
        (error: unknown) => {
          console.error(`[useKindItems] ${kind} list read failed:`, error);
          if (cancelled) return;
          setState({
            key: listKey,
            items: [],
            hasMore: false,
            error: error instanceof Error ? error : new Error(String(error)),
            loadingMore: false,
          });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [listKey, kind, scopeKey, pageSize, settledQuery]);

  const current = state.key !== "" && state.key === listKey;

  function loadMore() {
    const stableScope = kindScopeFromKey(scopeKey);
    if (!current || !state.hasMore || state.loadingMore || !kind || !stableScope || !pageSize) return;
    const key = listKey;
    const offset = state.items.length;
    setState((s) => ({ ...s, loadingMore: true }));
    fetchKindItemsPage({ token: kind, scope: stableScope, query: settledQuery, offset, limit: pageSize })
      .then(
        (page) => {
          if (liveKey.current !== key) return;
          setState((s) => {
            // Rows that moved between pages (something changed meanwhile) are listed once.
            const seen = new Set(s.items.map((it) => it.id));
            return {
              ...s,
              items: [...s.items, ...page.filter((it) => !seen.has(it.id))],
              hasMore: page.length === pageSize,
              loadingMore: false,
            };
          });
        },
        (error: unknown) => {
          console.error(`[useKindItems] ${kind} next page failed:`, error);
          if (liveKey.current !== key) return;
          setState((s) => ({
            ...s,
            loadingMore: false,
            error: error instanceof Error ? error : new Error(String(error)),
          }));
        },
      );
  }

  // Nothing fails silently: with no organization to resolve the page-size knob against, the list
  // says so instead of spinning forever.
  const noKnobOrganization = Boolean(kind && scopeKey) && !knobOrganizationId;
  if (noKnobOrganization) {
    return {
      items: [],
      loading: false,
      loadingMore: false,
      hasMore: false,
      loadMore,
      error: new Error(
        "No organization is active yet, so this list cannot tell how many items to load at a time. Pick an organization, then try again.",
      ),
      reload: () => setAttempt((n) => n + 1),
      pageSize: null,
    };
  }

  return {
    items: current ? state.items : [],
    loading: listKey === "" ? Boolean(kind && scopeKey) : !current,
    loadingMore: current && state.loadingMore,
    hasMore: current && state.hasMore,
    loadMore,
    error: current ? state.error : null,
    reload: () => setAttempt((n) => n + 1),
    pageSize,
  };
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useDebounce } from "@/hooks/usehooks/useDebounce";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import type { ConversationHistoryScopeState } from "@/features/agents/redux/conversation-history/types";
import {
  initialConversationSearchRange,
  nextConversationSearchRange,
  searchConversations,
  type ConversationSearchRange,
} from "@/features/agents/redux/conversation-history/conversation-search";

type SearchStatus =
  "idle" | "loading" | "loading-more" | "succeeded" | "failed";

interface SearchState {
  query: string;
  range: ConversationSearchRange;
  deep: boolean;
  items: ConversationListItem[];
  total: number;
  status: SearchStatus;
  error: string | null;
}

interface UseConversationServerSearchArgs {
  enabled: boolean;
  searchTerm: string;
  pageSize: number;
  conversationCount: number | null;
  scope: ConversationHistoryScopeState;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Conversation search failed. Please try again.";
}

export function useConversationServerSearch({
  enabled,
  searchTerm,
  pageSize,
  conversationCount,
  scope,
}: UseConversationServerSearchArgs) {
  const query = useDebounce(searchTerm.trim(), 250);
  const initialRange = initialConversationSearchRange(
    conversationCount,
    pageSize,
  );
  const [options, setOptions] = useState<{
    query: string;
    range: ConversationSearchRange;
    deep: boolean;
  }>({ query: "", range: initialRange, deep: false });
  const effectiveRange = options.query === query ? options.range : initialRange;
  const effectiveDeep = options.query === query ? options.deep : false;
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<SearchState>({
    query: "",
    range: initialRange,
    deep: false,
    items: [],
    total: 0,
    status: "idle",
    error: null,
  });
  const activeController = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const scopeKey = JSON.stringify([
    scope.agentIds,
    scope.excludeSourceFeatures,
    scope.includeSourceFeatures,
    scope.includeSourceApps,
    scope.includeEmptySource,
    scope.includeOriginClasses,
    scope.includeLanes,
  ]);

  useEffect(() => {
    activeController.current?.abort();
    if (!enabled || !query || scope.includeLanes?.length === 0) {
      setState((current) => ({ ...current, status: "idle", error: null }));
      return;
    }

    const controller = new AbortController();
    activeController.current = controller;
    const sequence = ++requestSequence.current;
    setState({
      query,
      range: effectiveRange,
      deep: effectiveDeep,
      items: [],
      total: 0,
      status: "loading",
      error: null,
    });

    void searchConversations({
      query,
      range: effectiveRange,
      deep: effectiveDeep,
      limit: pageSize,
      offset: 0,
      scope: scopeRef.current,
      signal: controller.signal,
    })
      .then((page) => {
        if (sequence !== requestSequence.current) return;
        setState({
          query,
          range: effectiveRange,
          deep: effectiveDeep,
          items: page.items,
          total: page.total,
          status: "succeeded",
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (isAbort(error) || sequence !== requestSequence.current) return;
        setState({
          query,
          range: effectiveRange,
          deep: effectiveDeep,
          items: [],
          total: 0,
          status: "failed",
          error: errorMessage(error),
        });
      });

    return () => controller.abort();
  }, [
    enabled,
    query,
    effectiveRange,
    effectiveDeep,
    pageSize,
    retryKey,
    scopeKey,
  ]);

  const settledForVisibleQuery =
    state.query === searchTerm.trim() &&
    state.range === effectiveRange &&
    state.deep === effectiveDeep;

  const expandRange = () => {
    const next = nextConversationSearchRange(effectiveRange);
    if (!next) return;
    setOptions({ query, range: next, deep: effectiveDeep });
  };

  const enableDeepSearch = () => {
    setOptions({ query, range: effectiveRange, deep: true });
  };

  const retry = () => setRetryKey((key) => key + 1);

  const loadMore = async () => {
    if (
      state.status === "loading" ||
      state.status === "loading-more" ||
      state.items.length >= state.total
    ) {
      return;
    }
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    const sequence = ++requestSequence.current;
    setState((current) => ({
      ...current,
      status: "loading-more",
      error: null,
    }));
    try {
      const page = await searchConversations({
        query,
        range: effectiveRange,
        deep: effectiveDeep,
        limit: pageSize,
        offset: state.items.length,
        scope: scopeRef.current,
        signal: controller.signal,
      });
      if (sequence !== requestSequence.current) return;
      setState((current) => {
        const ids = new Set(current.items.map((item) => item.conversationId));
        const additions = page.items.filter(
          (item) => !ids.has(item.conversationId),
        );
        return {
          ...current,
          items: [...current.items, ...additions],
          total: page.total,
          status: "succeeded",
        };
      });
    } catch (error) {
      if (isAbort(error) || sequence !== requestSequence.current) return;
      setState((current) => ({
        ...current,
        status: "failed",
        error: errorMessage(error),
      }));
    }
  };

  return {
    ...state,
    isActive: enabled && searchTerm.trim().length > 0,
    isSettled: settledForVisibleQuery,
    visibleItems: settledForVisibleQuery ? state.items : [],
    nextRange: nextConversationSearchRange(effectiveRange),
    effectiveRange,
    effectiveDeep,
    expandRange,
    enableDeepSearch,
    retry,
    loadMore,
  };
}

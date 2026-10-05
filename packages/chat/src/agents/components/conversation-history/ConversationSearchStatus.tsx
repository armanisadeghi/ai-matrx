"use client";

import { Loader2 } from "lucide-react";
import { conversationSearchRangeLabel } from "../../redux/conversation-history/conversation-search";
import type { useConversationServerSearch } from "./useConversationServerSearch";
import { Button } from "@ai-matrx/design-system/controls";

type ServerSearchState = ReturnType<typeof useConversationServerSearch>;

/** The server-search status + range/deep/more doors, shared by every conversation search box. */
export function ConversationSearchStatus({
  state,
  cachedCount,
  pageSize,
}: {
  state: ServerSearchState;
  cachedCount: number;
  pageSize: number;
}) {
  const rangeLabel = conversationSearchRangeLabel(state.effectiveRange);
  const nextLabel = state.nextRange
    ? conversationSearchRangeLabel(state.nextRange)
    : null;
  const remaining = Math.max(0, state.total - state.items.length);
  const nextCount = Math.min(pageSize, remaining);
  const firstSearchPending =
    !state.isSettled || state.status === "loading" || state.status === "idle";

  return (
    <div
      className="mx-2 mb-1 rounded-lg border border-border bg-muted/35 px-2.5 py-2 text-xs"
      aria-live="polite"
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {firstSearchPending && <Loader2 className="h-3 w-3 animate-spin" />}
        <span>
          {firstSearchPending
            ? `Searching ${rangeLabel}${
                cachedCount > 0 ? ` · ${cachedCount} cached first` : ""
              }`
            : state.status === "failed"
              ? state.error
              : state.total === 0
                ? `No matches in ${rangeLabel}`
                : `${state.total} result${state.total === 1 ? "" : "s"} · Searched ${rangeLabel}`}
        </span>
      </div>

      {state.isSettled && state.status !== "loading" && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {state.status === "failed" && (
            <Button variant="quiet" onClick={state.retry}>Retry</Button>
          )}
          {remaining > 0 && (
            <Button variant="quiet" onClick={() => void state.loadMore()} disabled={state.status === "loading-more"}>{state.status === "loading-more"
                ? "Loading…"
                : `Show ${nextCount} more`}</Button>
          )}
          {nextLabel && (
            <Button variant="quiet" onClick={state.expandRange}>Search {nextLabel}</Button>
          )}
          {!state.effectiveDeep && (
            <Button variant="quiet" onClick={state.enableDeepSearch}>Search message text</Button>
          )}
        </div>
      )}
    </div>
  );
}

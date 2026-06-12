import { createSelector } from "@reduxjs/toolkit";
import { idMatchesQuery } from "@/utils/search-scoring";
import type { RootState } from "@/lib/redux/store";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { defaultScopeState, type ConversationHistoryScopeState } from "./types";

const selectConversationHistory = (state: RootState) =>
  state.conversationHistory;

/**
 * Per-scope state selector factory. Memoized so distinct `scopeId`s get
 * their own selector instance; passing the same `scopeId` returns the same
 * selector and the same stable `defaultScopeState` reference when the scope
 * hasn't been created yet — no useSelector warnings.
 */
export const makeSelectConversationHistoryScope = (scopeId: string) =>
  createSelector(selectConversationHistory, (history) => {
    return (
      history.scopes[scopeId] ??
      (defaultScopeState as ConversationHistoryScopeState)
    );
  });

/**
 * Returns the search-filtered items for `scopeId`. Case-insensitive match
 * on `title` and `description`. Falls back to all items when `searchTerm`
 * is empty.
 */
export const makeSelectConversationHistoryItems = (scopeId: string) => {
  const selectScope = makeSelectConversationHistoryScope(scopeId);
  return createSelector(selectScope, (scope) => {
    const term = scope.searchTerm.trim().toLowerCase();
    if (!term) return scope.items;
    return scope.items.filter((item) => {
      const title = (item.title ?? "").toLowerCase();
      const desc = (item.description ?? "").toLowerCase();
      return title.includes(term) || desc.includes(term) || idMatchesQuery(item, term);
    });
  });
};

// ── Grouping helpers ─────────────────────────────────────────────────────────

export interface DateBucket {
  key: "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "older";
  label: string;
  items: ConversationListItem[];
}

const DATE_LABELS: Record<DateBucket["key"], string> = {
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This week",
  lastWeek: "Last week",
  thisMonth: "This month",
  older: "Earlier",
};

const ORDERED_KEYS: DateBucket["key"][] = [
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "older",
];

/** Milliseconds in a day. */
const DAY_MS = 86_400_000;

/** Returns midnight-local (start of day) for a Date without mutating it. */
function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Bucket a conversation by its `updatedAt` relative to "now". */
function bucketForDate(
  updatedAt: string | undefined,
  now: Date,
): DateBucket["key"] {
  if (!updatedAt) return "older";
  const t = +new Date(updatedAt);
  if (Number.isNaN(t)) return "older";
  const today = startOfDay(now);
  const ageMs = today.getTime() - t;
  if (ageMs < 0 || t >= today.getTime()) return "today";
  if (ageMs < DAY_MS) return "yesterday";
  // "this week" = within the current ISO-ish week (last 7 days incl. today)
  if (ageMs < 7 * DAY_MS) return "thisWeek";
  if (ageMs < 14 * DAY_MS) return "lastWeek";
  if (ageMs < 31 * DAY_MS) return "thisMonth";
  return "older";
}

/**
 * Groups filtered items by date bucket. Buckets with zero items are
 * omitted. Items inside each bucket stay in the input order (already
 * `updatedAt` desc).
 */
export const makeSelectGroupedByDate = (scopeId: string) => {
  const selectItems = makeSelectConversationHistoryItems(scopeId);
  return createSelector(selectItems, (items): DateBucket[] => {
    const now = new Date();
    const buckets = new Map<DateBucket["key"], ConversationListItem[]>();
    for (const item of items) {
      const key = bucketForDate(item.updatedAt, now);
      const arr = buckets.get(key);
      if (arr) arr.push(item);
      else buckets.set(key, [item]);
    }
    return ORDERED_KEYS.filter((k) => (buckets.get(k)?.length ?? 0) > 0).map(
      (k) => ({
        key: k,
        label: DATE_LABELS[k],
        items: buckets.get(k)!,
      }),
    );
  });
};

export interface AgentBucket {
  agentId: string | null;
  label: string;
  items: ConversationListItem[];
}

/**
 * Groups filtered items by `agentId`. Uses the agent cache for a
 * human-readable label; falls back to the id or "Unknown agent".
 */
export const makeSelectGroupedByAgent = (scopeId: string) => {
  const selectItems = makeSelectConversationHistoryItems(scopeId);
  return createSelector(
    [selectItems, (state: RootState) => state],
    (items, state): AgentBucket[] => {
      const buckets = new Map<string | null, ConversationListItem[]>();
      for (const item of items) {
        const id = (item.agentId ?? null) as string | null;
        const arr = buckets.get(id);
        if (arr) arr.push(item);
        else buckets.set(id, [item]);
      }
      const result: AgentBucket[] = [];
      for (const [agentId, agentItems] of buckets.entries()) {
        let label = "Unknown agent";
        if (agentId) {
          const agent = selectAgentById(state, agentId);
          label = agent?.name ?? agentId.slice(0, 8);
        }
        result.push({ agentId, label, items: agentItems });
      }
      // Order buckets by their most recent conversation's updatedAt.
      result.sort(
        (a, b) =>
          +new Date(b.items[0]?.updatedAt ?? 0) -
          +new Date(a.items[0]?.updatedAt ?? 0),
      );
      return result;
    },
  );
};

/** Convenience: selector that returns `{ status, hasMore, error }` for UI. */
export const makeSelectConversationHistoryStatus = (scopeId: string) => {
  const selectScope = makeSelectConversationHistoryScope(scopeId);
  return createSelector(selectScope, (scope) => ({
    status: scope.status,
    hasMore: scope.hasMore,
    error: scope.error,
    count: scope.items.length,
  }));
};

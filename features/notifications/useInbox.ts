"use client";

/**
 * features/notifications/useInbox.ts — the ONE reader behind the shell Inbox.
 *
 * Direct messages are NOT counted here (owner, 2026-09-30): Messages is its own
 * header control.
 *
 * THE BADGE (owner ruling 1, 2026-10-01). The number is what is NEW and needs
 * you or is addressed to you — unseen Needs-you + For-you notices, plus anything
 * new from a counting source (approvals, record-store work) since the bell was
 * last opened. Opening the bell clears it. Updates you only watch add a dot.
 * A source with no "seen" of its own is compared with the count the person last
 * saw (per viewer, in this browser) — a convenience, so the worst a lost note
 * can do is show those items as new once more.
 *
 * TRIAGE (ruling 2). Done is the main gesture; every action is optimistic,
 * confirmed by the door, and undoable (`Z`, or the toast's Undo).
 *
 * FRESHNESS. `communication.notification` is not in the realtime publication
 * and its select policy has no recipient arm (`pnpm check:realtime-publication`).
 * Reads refresh on focus, every `INBOX_POLL_INTERVAL_MS`, and after every write.
 * The broadcast on insert is the named follow-up in ./FEATURE.md.
 */

import { useRef, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useIdleReady } from "@ai-matrx/kit/idle-scheduler";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { usePendingApprovalCount } from "@/features/approvals/usePendingApprovalCount";
import { bellBadge, markPlaces, sameMarks, type PlaceReading } from "./badge";
import { useInboxMemory } from "./useInboxMemory";
import {
  clearInbox,
  fetchInbox,
  fetchInboxKinds,
  fetchInboxOrganizations,
  fetchInboxSummary,
  fetchMyWorkWaiting,
  markAllMyNotificationsRead,
  markInboxSeen,
  setNoticesState,
  type InboxPage,
} from "./service";
import type {
  InboxNotification,
  InboxState,
  InboxSummary,
  TriageAction,
} from "./types";

/** How often the badge re-reads while the tab is open (ms). */
export const INBOX_POLL_INTERVAL_MS = 60_000;
/** Notices per page read. */
export const INBOX_PAGE_SIZE = 50;

export const INBOX_QUERY_KEY = ["inbox"] as const;
const summaryKey = (userId: string | null) => [...INBOX_QUERY_KEY, "summary", userId] as const;
const feedPrefix = (userId: string | null) => [...INBOX_QUERY_KEY, "feed", userId] as const;
const workKey = (userId: string | null) => [...INBOX_QUERY_KEY, "work-waiting", userId] as const;

// `custom.inbox_counts` and `my_inbox_summary` are real but not free; the header mounts this on
// EVERY page, so the badge reads wait for the shared idle flush (`@ai-matrx/kit/idle-scheduler`)
// rather than competing with first paint.

/** What waits on this person in the record store, every organization (`custom.inbox_counts`). */
export function useWorkWaiting(enabled: boolean) {
  const userId = useAppSelector(selectUserId);
  return useQuery({
    queryKey: workKey(userId),
    queryFn: fetchMyWorkWaiting,
    enabled: userId !== null && enabled,
    refetchInterval: INBOX_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    retry: 1,
  });
}

export interface InboxCounts {
  summary: InboxSummary | null;
  /** False while the triage doors are not on this database. */
  triage: boolean;
  /** Proposals waiting on this person. `null` = unreadable. */
  approvals: number | null;
  /** Record-store work waiting, summed over every organization. `null` = unreadable. */
  work: number | null;
  /** Record-store items the person snoozed. */
  workSnoozed: number;
  /** The bell's number. */
  badge: number;
  /** Unseen updates — a dot, never a number. */
  updatesDot: boolean;
  /** A part could not be read: the badge says so instead of a confident wrong sum. */
  partial: boolean;
  /** Call when the bell or the inbox opens. */
  markSeen: () => void;
}

/** The badge only — cheap enough for the header to mount everywhere. */
export function useInboxCounts(): InboxCounts {
  const userId = useAppSelector(selectUserId);
  const queryClient = useQueryClient();
  const approvals = usePendingApprovalCount();
  const idleReady = useIdleReady();
  const memory = useInboxMemory();

  const workWaiting = useWorkWaiting(idleReady);
  const summary = useQuery({
    queryKey: summaryKey(userId),
    queryFn: fetchInboxSummary,
    enabled: userId !== null && idleReady,
    refetchInterval: INBOX_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  // The record store's waiting changes are in BOTH numbers — `/approvals` lists them and
  // `custom.inbox_counts` counts them — so the approvals share leaves them out here and each
  // waiting change adds one to the bell, not two.
  const approvalCount = approvals.unknown ? null : approvals.count - approvals.storeCount;
  const work =
    workWaiting.isError || workWaiting.data === undefined
      ? null
      : workWaiting.data.reduce((sum, o) => sum + o.waiting, 0);
  const workSnoozed = (workWaiting.data ?? []).reduce((sum, o) => sum + o.snoozed, 0);
  const s = summary.data?.summary ?? null;
  // Until the person's saved marks load, no place counts (empty marks would read all as new).
  // Marks move only when the person opens the bell — never on a refetch (badge.ts).
  const places: Record<string, PlaceReading> = memory.ready
    ? { approvals: { count: approvalCount }, work: { count: work } }
    : {};

  const badge = bellBadge({
    unseenNeedsYou: s?.unseenNeedsYou ?? 0,
    unseenDirect: s?.unseenDirect ?? 0,
    places,
    seen: memory.seen,
    hidden: memory.hiddenSources,
  });

  const markSeen = () => {
    if (memory.ready) {
      const next = markPlaces(memory.seen, places);
      if (!sameMarks(next, memory.seen)) memory.saveSeen(next);
    }
    if (!s || !summary.data?.triage || s.unseenNeedsYou + s.unseenDirect + s.unseenUpdates === 0) return;
    // Optimistic: the badge clears the moment the bell opens.
    queryClient.setQueryData(summaryKey(userId), (prev: typeof summary.data) =>
      prev
        ? {
            ...prev,
            summary: { ...prev.summary, unseenNeedsYou: 0, unseenDirect: 0, unseenUpdates: 0 },
          }
        : prev,
    );
    void markInboxSeen()
      .catch((error: unknown) => {
        console.error("[Inbox] Could not clear the badge:", error);
      })
      .finally(() => {
        void queryClient.invalidateQueries({ queryKey: summaryKey(userId) });
      });
  };

  return {
    summary: s,
    triage: summary.data?.triage ?? true,
    approvals: approvalCount,
    work,
    workSnoozed,
    badge,
    updatesDot: (s?.unseenUpdates ?? 0) > 0,
    // Only a failed read is "unavailable" — still loading is not (RESEARCH.md T5).
    partial: summary.isError || workWaiting.isError,
    markSeen,
  };
}

/** Every kind in the Inbox with its count — the bell's "Clear a kind" list. */
export function useInboxKinds(enabled: boolean) {
  const userId = useAppSelector(selectUserId);
  return useQuery({
    queryKey: [...INBOX_QUERY_KEY, "kinds", userId] as const,
    queryFn: fetchInboxKinds,
    enabled: enabled && userId !== null,
    staleTime: 15_000,
  });
}

// ── THE FEED ──────────────────────────────────────────────────────────────

export interface InboxCursor {
  at: string;
  id: string;
}

export interface InboxFeedArgs {
  state: InboxState;
  orgId?: string | null;
  unreadOnly?: boolean;
  enabled?: boolean;
}

/** Whether a row (as patched optimistically) still belongs in a view. */
export function belongsIn(state: InboxState, row: InboxNotification, now = Date.now()): boolean {
  const snoozed = row.snoozed_until !== null && Date.parse(row.snoozed_until) > now;
  if (state === "done") return row.done_at !== null;
  if (state === "snoozed") return row.done_at === null && snoozed;
  return row.done_at === null && !snoozed;
}

export interface InboxFeed {
  rows: InboxNotification[];
  triage: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  hasMore: boolean;
  loadMore: () => void;
  loadingMore: boolean;
}

export function useInboxFeed({
  state,
  orgId = null,
  unreadOnly = false,
  enabled = true,
}: InboxFeedArgs): InboxFeed {
  const userId = useAppSelector(selectUserId);
  const feed = useInfiniteQuery({
    queryKey: [...feedPrefix(userId), state, orgId, unreadOnly] as const,
    queryFn: ({ pageParam }) =>
      fetchInbox({
        state,
        orgId,
        unreadOnly,
        limit: INBOX_PAGE_SIZE,
        before: pageParam?.at ?? null,
        beforeId: pageParam?.id ?? null,
      }),
    initialPageParam: null as InboxCursor | null,
    // (sort time, id): rows sharing a time are never skipped at a page boundary.
    getNextPageParam: (last: InboxPage): InboxCursor | undefined => {
      if (last.rows.length < INBOX_PAGE_SIZE) return undefined;
      const tail = last.rows[last.rows.length - 1];
      return { at: tail.sort_at, id: tail.id };
    },
    enabled: enabled && userId !== null,
    refetchInterval: INBOX_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const pages = feed.data?.pages ?? [];
  const seen = new Set<string>();
  const rows: InboxNotification[] = [];
  for (const page of pages) {
    for (const row of page.rows) {
      if (seen.has(row.id) || !belongsIn(state, row)) continue;
      seen.add(row.id);
      if (unreadOnly && row.read_at !== null) continue;
      rows.push(row);
    }
  }
  return {
    rows,
    triage: pages[0]?.triage ?? true,
    // A disabled query (no user id yet) is "not loaded", never "empty".
    isLoading: feed.isLoading || (enabled && userId === null),
    error: feed.error,
    refetch: () => {
      void feed.refetch();
    },
    hasMore: feed.hasNextPage,
    loadMore: () => {
      void feed.fetchNextPage();
    },
    loadingMore: feed.isFetchingNextPage,
  };
}

/** The organization filter's choices; `null` while the triage doors are absent. */
export function useInboxOrganizations(enabled: boolean) {
  const userId = useAppSelector(selectUserId);
  return useQuery({
    queryKey: [...INBOX_QUERY_KEY, "organizations", userId] as const,
    queryFn: fetchInboxOrganizations,
    enabled: enabled && userId !== null,
    staleTime: 60_000,
  });
}

// ── TRIAGE ────────────────────────────────────────────────────────────────

const INVERSE: Record<TriageAction, TriageAction> = {
  done: "undone",
  undone: "done",
  read: "unread",
  unread: "read",
  snooze: "unsnooze",
  unsnooze: "snooze",
};

const PAST: Record<TriageAction, string> = {
  done: "Marked done",
  undone: "Moved back to Inbox",
  read: "Marked read",
  unread: "Marked unread",
  snooze: "Snoozed",
  unsnooze: "Back in Inbox",
};

function patch(row: InboxNotification, action: TriageAction, until?: Date): InboxNotification {
  const now = new Date().toISOString();
  switch (action) {
    case "done":
      return { ...row, done_at: row.done_at ?? now, snoozed_until: null };
    case "undone":
      return { ...row, done_at: null };
    case "read":
      return { ...row, read_at: row.read_at ?? now };
    case "unread":
      return { ...row, read_at: null };
    case "snooze":
      return {
        ...row,
        snoozed_until: until ? until.toISOString() : row.snoozed_until,
        read_at: null,
        seen_at: null,
      };
    case "unsnooze":
      return { ...row, snoozed_until: null };
  }
}

interface LastAction {
  ids: string[];
  action: TriageAction;
  until?: Date;
  /** For undoing a snooze or unsnooze: each row's previous snooze time. */
  previousUntil: Map<string, string | null>;
}

export interface InboxActions {
  act: (
    rows: readonly InboxNotification[],
    action: TriageAction,
    options?: { until?: Date; quiet?: boolean },
  ) => Promise<void>;
  /** Undo the last action (`Z`). */
  undo: () => Promise<void>;
  canUndo: boolean;
  markAllRead: () => Promise<void>;
  /**
   * Done for EVERY Inbox notice of these kinds (null = all of them), every page, one call.
   * Undoable: the toast's Undo puts exactly those notices back. Resolves to how many cleared.
   */
  clear: (eventKeys: readonly string[] | null, what?: string, onUndo?: () => void) => Promise<number>;
}

/** `triage`: whether the triage doors are on this database (unread, Done, snooze). */
export function useInboxActions(triage = true): InboxActions {
  const userId = useAppSelector(selectUserId);
  const queryClient = useQueryClient();
  const last = useRef<LastAction | null>(null);
  const [canUndo, setCanUndo] = useState(false);

  const applyOptimistic = (ids: Set<string>, action: TriageAction, until?: Date, perRow?: Map<string, string | null>) => {
    queryClient.setQueriesData<InfiniteData<InboxPage, InboxCursor | null>>(
      { queryKey: feedPrefix(userId) },
      (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                rows: page.rows.map((row) => {
                  if (!ids.has(row.id)) return row;
                  const rowUntil = perRow?.get(row.id);
                  return patch(row, action, rowUntil ? new Date(rowUntil) : until);
                }),
              })),
            }
          : data,
    );
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY });

  const run = async (
    ids: string[],
    action: TriageAction,
    until: Date | undefined,
    perRow?: Map<string, string | null>,
  ) => {
    applyOptimistic(new Set(ids), action, until, perRow);
    try {
      if (perRow && action === "snooze") {
        // Undo of an unsnooze puts each row back to ITS OWN time.
        const byTime = new Map<string, string[]>();
        for (const id of ids) {
          const t = perRow.get(id);
          if (!t || Date.parse(t) <= Date.now()) continue;
          byTime.set(t, [...(byTime.get(t) ?? []), id]);
        }
        for (const [t, group] of byTime) await setNoticesState(group, "snooze", new Date(t));
      } else {
        await setNoticesState(ids, action, until);
      }
    } finally {
      await refresh();
    }
  };

  const undoRecord = async (prev: LastAction) => {
    if (last.current === prev) {
      last.current = null;
      setCanUndo(false);
    }
    const inverse = INVERSE[prev.action];
    try {
      if (inverse === "snooze") {
        await run(prev.ids, "snooze", undefined, prev.previousUntil);
      } else {
        await run(prev.ids, inverse, undefined);
      }
      toast(`Undone: ${PAST[prev.action].toLowerCase()}`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Undo didn't save.");
    }
  };

  const act: InboxActions["act"] = async (rows, action, options = {}) => {
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return;
    const previousUntil = new Map(rows.map((row) => [row.id, row.snoozed_until] as const));
    try {
      await run(ids, action, options.until);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "That didn't save.");
      return;
    }
    // A quiet action (opening a row marks it read) is never what Z or a toast undoes.
    if (options.quiet) return;
    // Read cannot be undone where the unread door is absent — no Undo is offered then.
    const undoable = triage || action !== "read";
    const record: LastAction = { ids, action, until: options.until, previousUntil };
    if (undoable) {
      last.current = record;
      setCanUndo(true);
    }
    const noun = ids.length === 1 ? "" : ` · ${ids.length}`;
    toast(
      `${PAST[action]}${noun}`,
      undoable ? { action: { label: "Undo", onClick: () => void undoRecord(record) } } : undefined,
    );
  };

  const undo = async () => {
    const prev = last.current;
    if (prev) await undoRecord(prev);
  };

  const markAllRead = async () => {
    try {
      const changed = await markAllMyNotificationsRead();
      if (changed > 0) toast(`Marked read · ${changed}`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "That didn't save.");
    } finally {
      await refresh();
    }
  };

  const undoClear = async (ids: readonly string[]) => {
    try {
      for (let i = 0; i < ids.length; i += 500) {
        await setNoticesState(ids.slice(i, i + 500), "undone");
      }
      toast(`Back in Inbox · ${ids.length}`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Undo didn't save.");
    } finally {
      await refresh();
    }
  };

  const clear: InboxActions["clear"] = async (eventKeys, what = "Cleared", onUndo) => {
    const keys = eventKeys ? new Set(eventKeys) : null;
    // Optimistic: every loaded row of those kinds leaves the Inbox now.
    queryClient.setQueriesData<InfiniteData<InboxPage, InboxCursor | null>>(
      { queryKey: feedPrefix(userId) },
      (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                rows: page.rows.map((row) =>
                  !keys || keys.has(row.event_key) ? patch(row, "done") : row,
                ),
              })),
            }
          : data,
    );
    try {
      const ids = await clearInbox("done", eventKeys);
      if (ids.length > 0 || onUndo) {
        toast(ids.length > 0 ? `${what} · ${ids.length}` : what, {
          action: {
            label: "Undo",
            onClick: () => {
              onUndo?.();
              if (ids.length > 0) void undoClear(ids);
            },
          },
        });
      }
      return ids.length;
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "That didn't save.");
      return 0;
    } finally {
      await refresh();
    }
  };

  return { act, undo, canUndo, markAllRead, clear };
}

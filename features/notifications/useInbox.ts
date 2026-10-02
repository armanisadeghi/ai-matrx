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

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { usePendingApprovalCount } from "@/features/approvals/usePendingApprovalCount";
import {
  fetchInbox,
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

/**
 * `custom.inbox_counts` is real but not free; the header mounts this on EVERY
 * page, so the read waits for idle rather than competing with first paint.
 */
function useIdleReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const ric = typeof window !== "undefined" ? window.requestIdleCallback : undefined;
    if (ric) {
      const handle = ric(() => setReady(true), { timeout: 2000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(() => setReady(true), 500);
    return () => window.clearTimeout(handle);
  }, []);
  return ready;
}

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

// ── "seen" for sources that have none of their own ────────────────────────
// One store for every mounted bell, sheet and inbox, so marking seen anywhere
// clears the badge everywhere. Per viewer, in this browser (a convenience).
const SEEN_SOURCES_KEY = "matrx:inbox:seen-source-counts";
const EMPTY_SEEN: Readonly<Record<string, number>> = Object.freeze({});
const seenListeners = new Set<() => void>();
let seenSnapshot: { key: string; raw: string | null; value: Record<string, number> } | null = null;

function seenKey(userId: string | null): string | null {
  return userId ? `${SEEN_SOURCES_KEY}:${userId}` : null;
}

function readSeenSourceCounts(userId: string | null): Record<string, number> {
  const key = seenKey(userId);
  if (!key || typeof window === "undefined") return EMPTY_SEEN;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return EMPTY_SEEN;
  }
  if (seenSnapshot && seenSnapshot.key === key && seenSnapshot.raw === raw) return seenSnapshot.value;
  let value: Record<string, number> = EMPTY_SEEN;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed === "object" && parsed !== null) value = parsed as Record<string, number>;
  } catch {
    value = EMPTY_SEEN;
  }
  seenSnapshot = { key, raw, value };
  return value;
}

function writeSeenSourceCounts(userId: string | null, counts: Record<string, number>): void {
  const key = seenKey(userId);
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(counts));
  } catch {
    // Storage blocked: the counts simply read as new again next time.
  }
  for (const listener of seenListeners) listener();
}

function subscribeSeen(listener: () => void): () => void {
  seenListeners.add(listener);
  return () => seenListeners.delete(listener);
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
  const seenSources = useSyncExternalStore(
    subscribeSeen,
    () => readSeenSourceCounts(userId),
    () => EMPTY_SEEN,
  );

  const workWaiting = useWorkWaiting(idleReady);
  const summary = useQuery({
    queryKey: summaryKey(userId),
    queryFn: fetchInboxSummary,
    enabled: userId !== null,
    refetchInterval: INBOX_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const approvalCount = approvals.unknown ? null : approvals.count;
  const work =
    workWaiting.isError || workWaiting.data === undefined
      ? null
      : workWaiting.data.reduce((sum, o) => sum + o.waiting, 0);
  const workSnoozed = (workWaiting.data ?? []).reduce((sum, o) => sum + o.snoozed, 0);
  const s = summary.data?.summary ?? null;
  // Items handled since they were seen lower the mark, so the next new one counts.
  useEffect(() => {
    const lowered: Record<string, number> = {};
    if (approvalCount !== null && (seenSources.approvals ?? 0) > approvalCount) lowered.approvals = approvalCount;
    if (work !== null && (seenSources.work ?? 0) > work) lowered.work = work;
    if (Object.keys(lowered).length) writeSeenSourceCounts(userId, { ...seenSources, ...lowered });
  }, [approvalCount, work, seenSources, userId]);

  const newSince = (key: string, count: number | null) =>
    count === null ? 0 : Math.max(0, count - (seenSources[key] ?? 0));

  const badge =
    (s ? s.unseenNeedsYou + s.unseenDirect : 0) +
    newSince("approvals", approvalCount) +
    newSince("work", work);

  const markSeen = () => {
    const next = {
      ...seenSources,
      ...(approvalCount !== null ? { approvals: approvalCount } : {}),
      ...(work !== null ? { work } : {}),
    };
    if (next.approvals !== seenSources.approvals || next.work !== seenSources.work) {
      writeSeenSourceCounts(userId, next);
    }
    if (!s || s.unseenNeedsYou + s.unseenDirect + s.unseenUpdates === 0) return;
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
    partial: summary.isError || approvalCount === null || work === null,
    markSeen,
  };
}

// ── THE FEED ──────────────────────────────────────────────────────────────

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
        before: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: InboxPage) =>
      last.rows.length >= INBOX_PAGE_SIZE ? last.rows[last.rows.length - 1].sort_at : undefined,
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
}

export function useInboxActions(): InboxActions {
  const userId = useAppSelector(selectUserId);
  const queryClient = useQueryClient();
  const last = useRef<LastAction | null>(null);
  const [canUndo, setCanUndo] = useState(false);

  const applyOptimistic = (ids: Set<string>, action: TriageAction, until?: Date, perRow?: Map<string, string | null>) => {
    queryClient.setQueriesData<InfiniteData<InboxPage, string | null>>(
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
    last.current = { ids, action, until: options.until, previousUntil };
    setCanUndo(true);
    if (options.quiet) return;
    const noun = ids.length === 1 ? "" : ` · ${ids.length}`;
    toast(`${PAST[action]}${noun}`, {
      action: { label: "Undo", onClick: () => void undo() },
    });
  };

  const undo = async () => {
    const prev = last.current;
    if (!prev) return;
    last.current = null;
    setCanUndo(false);
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

  return { act, undo, canUndo, markAllRead };
}

"use client";

/**
 * features/notifications/useInbox.ts — the ONE reader behind the shell Inbox.
 *
 * Two queries over the notification spine (unread count for the badge, the
 * recent list for the panel) plus the two counts the Inbox pins at the top
 * (conversations with unread messages, proposals waiting on this person), so
 * the bell's number and the panel's rows can never disagree about what is new.
 *
 * FRESHNESS. `communication.notification` is not in the realtime publication
 * and its select policy has no recipient arm, so a Postgres-Changes
 * subscription would join and deliver nothing (the class
 * `pnpm check:realtime-publication` exists to catch). The badge therefore
 * re-reads on window focus, every `INBOX_POLL_INTERVAL_MS`, and after every
 * mark-read. The follow-on named in `./FEATURE.md` is a broadcast on insert;
 * until then a notice can be up to one interval late, and nothing is lost.
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConversations } from "@ai-matrx/messaging/react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { usePendingApprovalCount } from "@/features/approvals/usePendingApprovalCount";
import {
  fetchMyNotifications,
  fetchMyUnreadNotificationCount,
  markAllMyNotificationsRead,
  markNotificationRead,
} from "./service";
import type { InboxNotification } from "./types";

/** How often the badge re-reads while the tab is open (ms). */
export const INBOX_POLL_INTERVAL_MS = 60_000;
/** How many notices the panel shows before "See all". */
export const INBOX_PANEL_LIMIT = 30;

export const INBOX_QUERY_KEY = ["inbox"] as const;
const unreadKey = (userId: string | null) =>
  [...INBOX_QUERY_KEY, "unread-count", userId] as const;
const listKey = (userId: string | null) =>
  [...INBOX_QUERY_KEY, "list", userId] as const;

export interface InboxCounts {
  /** Delivered in-app notices with no read_at. `null` = the read failed. */
  notifications: number | null;
  /** Conversations carrying unread messages (from the ONE messaging store). */
  conversations: number;
  /** Proposals waiting on this person. `null` = the count could not be read. */
  approvals: number | null;
  /** The bell's number — the sum of what is known. */
  total: number;
  /** True when any part of the total is unknown, so the badge can say so. */
  partial: boolean;
}

/** The badge only — cheap enough for the header to mount everywhere. */
export function useInboxCounts(): InboxCounts {
  const userId = useAppSelector(selectUserId);
  const { totalUnreadConversations } = useConversations();
  const approvals = usePendingApprovalCount();
  const unread = useQuery({
    queryKey: unreadKey(userId),
    queryFn: fetchMyUnreadNotificationCount,
    enabled: userId !== null,
    refetchInterval: INBOX_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const notifications = unread.isError ? null : (unread.data ?? 0);
  const approvalCount = approvals.unknown ? null : approvals.count;
  return {
    notifications,
    conversations: totalUnreadConversations,
    approvals: approvalCount,
    total:
      (notifications ?? 0) + totalUnreadConversations + (approvalCount ?? 0),
    partial: notifications === null || approvalCount === null,
  };
}

export interface InboxList {
  rows: InboxNotification[];
  /** False until the person is known (query disabled) or while fetching. */
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<number>;
}

/** The panel's rows plus the two writes, each of which refreshes both queries. */
export function useInboxList(enabled: boolean): InboxList {
  const userId = useAppSelector(selectUserId);
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: listKey(userId),
    queryFn: () => fetchMyNotifications({ limit: INBOX_PANEL_LIMIT }),
    enabled: enabled && userId !== null,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY }),
    [queryClient],
  );

  const markRead = useCallback(
    async (id: string) => {
      // Optimistic: the row reads as read at once; the door confirms behind it.
      queryClient.setQueryData<InboxNotification[]>(listKey(userId), (rows) =>
        rows?.map((row) =>
          row.id === id && row.read_at === null
            ? { ...row, read_at: new Date().toISOString() }
            : row,
        ),
      );
      try {
        await markNotificationRead(id);
      } finally {
        await invalidate();
      }
    },
    [invalidate, queryClient, userId],
  );

  const markAllRead = useCallback(async () => {
    try {
      return await markAllMyNotificationsRead();
    } finally {
      await invalidate();
    }
  }, [invalidate]);

  return {
    rows: list.data ?? [],
    // A disabled query (no user id yet) is "not loaded", never "empty".
    isLoading: list.isLoading || (enabled && userId === null),
    error: list.error,
    refetch: () => {
      void list.refetch();
    },
    markRead,
    markAllRead,
  };
}

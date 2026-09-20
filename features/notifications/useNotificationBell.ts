"use client";

// features/notifications/useNotificationBell.ts
//
// THE BELL'S ONE READER. The badge is `communication.my_notification_unread_count`
// and the list is `communication.my_notifications` — the same doors, never a
// second count derived from a page of rows (a page of 20 cannot know there are
// 40 unread, and a badge that disagrees with the list is a screen arguing with
// itself).
//
// 🚨 A COUNT THAT COULD NOT BE READ IS `null`, NEVER 0. `0` is a claim, and the
// bell is not allowed to make one it did not verify: on a refusal the caller
// shows a "cannot read" mark and the door's own sentence, never a silent zero
// (the ten laws § 4).
//
// Freshness is deliberately simple — no realtime subscription, no new
// dependency: the count polls on a slow interval and both doors are re-read
// when the person opens the bell.

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getMyUnreadCount,
  listMyNotifications,
  markAllMyNotificationsRead,
  markNotificationRead,
} from "./service";
import type { PlatformNotification } from "./types";

export const NOTIFICATION_UNREAD_COUNT_KEY = ["notifications", "unread-count"];
export const NOTIFICATION_LIST_KEY = ["notifications", "list"];

/** Slow on purpose: the bell is ambient, not a live feed. */
const UNREAD_POLL_MS = 60_000;

export interface NotificationBell {
  /** `null` means the count could not be read — show a mark, never a zero. */
  unreadCount: number | null;
  unreadError: string | null;
  notifications: PlatformNotification[];
  listLoading: boolean;
  listError: string | null;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  /** The sentence of the last write that failed, or `null`. */
  writeError: string | null;
  refresh: () => void;
}

export function useNotificationBell(): NotificationBell {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const countQuery = useQuery({
    queryKey: NOTIFICATION_UNREAD_COUNT_KEY,
    queryFn: getMyUnreadCount,
    refetchInterval: UNREAD_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    retry: 1,
  });

  const listQuery = useQuery({
    queryKey: NOTIFICATION_LIST_KEY,
    queryFn: () => listMyNotifications(),
    // The list is only worth reading while the bell is open.
    enabled: isOpen,
    staleTime: 15_000,
    retry: 1,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: NOTIFICATION_UNREAD_COUNT_KEY });
    void queryClient.invalidateQueries({ queryKey: NOTIFICATION_LIST_KEY });
  }, [queryClient]);

  const setOpen = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (open) {
        setWriteError(null);
        // Opening is the refetch trigger — what the person sees is read now.
        refresh();
      }
    },
    [refresh],
  );

  const markRead = useCallback(
    async (id: string) => {
      const result = await markNotificationRead(id);
      if (!result.ok) {
        setWriteError(result.message);
        return;
      }
      setWriteError(null);
      refresh();
    },
    [refresh],
  );

  const markAllRead = useCallback(async () => {
    const result = await markAllMyNotificationsRead();
    if (!result.ok) {
      setWriteError(result.message);
      return;
    }
    setWriteError(null);
    refresh();
  }, [refresh]);

  const countResult = countQuery.data;
  const unreadCount =
    countResult && countResult.ok ? countResult.value : null;
  const unreadError = (() => {
    if (countResult && !countResult.ok) return countResult.message;
    if (countQuery.isError) {
      return "Your unread notification count could not be read.";
    }
    return null;
  })();

  const listResult = listQuery.data;
  const listError = (() => {
    if (listResult && !listResult.ok) return listResult.message;
    if (listQuery.isError) return "Your notifications could not be loaded.";
    return null;
  })();

  return {
    unreadCount,
    unreadError,
    notifications: listResult && listResult.ok ? listResult.value : [],
    listLoading: isOpen && (listQuery.isPending || listQuery.isFetching),
    listError,
    isOpen,
    setOpen,
    markRead,
    markAllRead,
    writeError,
    refresh,
  };
}

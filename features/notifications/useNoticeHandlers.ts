"use client";

/**
 * features/notifications/useNoticeHandlers.ts — what every row action does, once,
 * for the bell, the phone sheet and the inbox page.
 *
 * Opening a notice marks its whole group read and opens it WITHOUT moving the
 * page (`useOpenNotice`). Never Done-on-open: Asana removed auto-archive-on-open
 * after people lost items (RESEARCH.md §2 consensus 3).
 */

import { toast } from "@/lib/toast";
import { setNotificationPreference } from "@/features/settings/notification-preferences";
import type { NoticeGroup } from "./grouping";
import { noticeTitle } from "./presentation";
import { openInNewTab, useOpenNotice } from "./openNotice";
import type { InboxActions } from "./useInbox";
import type { NoticeRowHandlers } from "./components/NoticeRow";
import type { InboxNotification } from "./types";

export function useNoticeHandlers(
  actions: InboxActions,
  options: { onOpened?: (how: "none" | "window" | "tab") => void } = {},
): NoticeRowHandlers & { openRow: (row: InboxNotification) => void } {
  const openNotice = useOpenNotice();

  const markGroupRead = (rows: readonly InboxNotification[]) => {
    const unread = rows.filter((row) => row.read_at === null);
    if (unread.length) void actions.act(unread, "read", { quiet: true });
  };

  const openRow = (row: InboxNotification) => {
    markGroupRead([row]);
    const how = openNotice(row);
    options.onOpened?.(how);
  };

  return {
    openRow,
    onOpen: (group: NoticeGroup) => {
      markGroupRead(group.rows);
      const how = openNotice(group.lead);
      options.onOpened?.(how);
    },
    onOpenMember: openRow,
    onDone: (group) => void actions.act(group.rows, "done"),
    onUndone: (group) => void actions.act(group.rows, "undone"),
    onSnooze: (group, until) => void actions.act(group.rows, "snooze", { until }),
    onUnsnooze: (group) => void actions.act(group.rows, "unsnooze"),
    onToggleRead: (group) => {
      const anyUnread = group.rows.some((row) => row.read_at === null);
      void actions.act(group.rows, anyUnread ? "read" : "unread");
    },
    onOpenInNewTab: (group) => {
      if (!group.lead.deep_link) return;
      markGroupRead(group.rows);
      openInNewTab(group.lead.deep_link);
    },
    onMuteType: (group) => {
      const row = group.lead;
      // Ignore all of this kind: no more of them, and the ones already here leave the Inbox
      // (Done, recoverable, undoable from the toast).
      void setNotificationPreference(row.event_key, "in_app", false, row.organization_id)
        .then(() => actions.clear([row.event_key], `Turned off: ${noticeTitle({ ...row, subject: null })}`))
        .catch((error: unknown) =>
          toast.error(error instanceof Error ? error.message : "That type couldn't be turned off."),
        );
    },
  };
}

"use client";

/**
 * features/notifications/components/InboxPanel.tsx — THE inbox body.
 *
 * One list, one look, whatever the sender: every row is a delivered in-app
 * notice from `communication.notification`. Two pinned rows sit above the
 * list for the two "things for you" that do not yet arrive as spine events —
 * conversations with unread messages and proposals waiting on this person —
 * each opening its own canonical surface. When those producers emit spine
 * events (the follow-on in ../FEATURE.md) the pinned rows go away and their
 * items become ordinary rows here.
 *
 * Mounted by the header bell (popover / drawer) AND the `/notifications`
 * route — a panel wraps the canonical component, never a second renderer.
 *
 * Honesty rules (Law 4): a read failure is a red row with a retry, never an
 * empty "all caught up"; a notice with no deep link is still a row (it can be
 * marked read), and a notice's link opens in place.
 */

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  Bell,
  CheckCheck,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  Inbox as InboxIcon,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import AppLink from "@/components/navigation/AppLink";
import { useOpenMessagesWindow } from "@/features/overlays/openers/messagesWindow";
import { useOpenApprovalsWindow } from "@/features/overlays/openers/approvalsWindow";
import { useInboxCounts, useInboxList } from "../useInbox";
import type { InboxNotification } from "../types";
import { NotificationBody } from "./NotificationBody";

export const NOTIFICATIONS_ROUTE = "/notifications";

interface InboxPanelProps {
  /** `compact` = the header popover; `page` = the /notifications route. */
  variant?: "compact" | "page";
  /** Called after a row navigates, so a popover host can close. */
  onNavigate?: () => void;
  className?: string;
}

function isInternalLink(link: string): boolean {
  return link.startsWith("/") && !link.startsWith("//");
}

function relative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistanceToNow(date, { addSuffix: true });
}

function PinnedRow({
  icon,
  label,
  count,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-[var(--matrx-glass-bg-hover)]"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:h-3.5 [&_svg]:w-3.5">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
        {count > 99 ? "99+" : count}
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function NotificationRow({
  row,
  onOpen,
}: {
  row: InboxNotification;
  onOpen: (row: InboxNotification) => void;
}) {
  const unread = row.read_at === null;
  const title = row.subject?.trim() || row.event_key.replaceAll(".", " › ");
  const external = row.deep_link !== null && !isInternalLink(row.deep_link);
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      aria-label={`${unread ? "Unread: " : ""}${title}`}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--matrx-glass-bg-hover)]",
        unread ? "bg-primary/5" : undefined,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-2 h-2 w-2 shrink-0 rounded-full",
          unread ? "bg-primary" : "bg-transparent",
        )}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm text-foreground",
            unread ? "font-semibold" : "font-medium",
          )}
        >
          {title}
        </span>
        {row.body ? (
          <NotificationBody body={row.body} className="block line-clamp-2 text-xs text-muted-foreground" />
        ) : null}
        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          {relative(row.created_at)}
          {external ? (
            <ExternalLink className="h-3 w-3" aria-label="Opens outside the app" />
          ) : null}
        </span>
      </span>
    </button>
  );
}

export function InboxPanel({
  variant = "compact",
  onNavigate,
  className,
}: InboxPanelProps) {
  const router = useRouter();
  const counts = useInboxCounts();
  const list = useInboxList(true);
  const openMessages = useOpenMessagesWindow();
  const openApprovals = useOpenApprovalsWindow();
  const [clearing, setClearing] = useState(false);

  const openRow = (row: InboxNotification) => {
    if (row.read_at === null) {
      void list.markRead(row.id).catch((error: unknown) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "We couldn't mark the notification read.",
        );
      });
    }
    if (row.deep_link === null) return;
    if (isInternalLink(row.deep_link)) {
      const href = row.deep_link;
      startTransition(() => router.push(href));
    } else {
      window.open(row.deep_link, "_blank", "noopener,noreferrer");
    }
    onNavigate?.();
  };

  const clearAll = async () => {
    setClearing(true);
    try {
      const changed = await list.markAllRead();
      toast.success(
        changed === 0
          ? "Nothing was unread."
          : `${changed} notification${changed === 1 ? "" : "s"} marked read.`,
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't mark your notifications read.",
      );
    } finally {
      setClearing(false);
    }
  };

  const unreadKnown = counts.notifications !== null;
  const hasUnread = (counts.notifications ?? 0) > 0;
  const pinned =
    counts.conversations > 0 ||
    (counts.approvals ?? 0) > 0 ||
    counts.workByOrganization.length > 0;

  return (
    <div
      className={cn(
        "flex flex-col",
        variant === "compact" ? "max-h-[70dvh]" : "h-full",
        className,
      )}
      data-inbox-panel={variant}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-sm font-semibold text-foreground">Inbox</span>
        {unreadKnown && hasUnread ? (
          <span className="text-xs text-muted-foreground">
            {counts.notifications} unread
          </span>
        ) : null}
        <span className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => void clearAll()}
          disabled={clearing || !hasUnread}
          title={
            hasUnread
              ? "Mark every notification read"
              : "Nothing is unread"
          }
        >
          {clearing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCheck className="h-3.5 w-3.5" />
          )}
          Mark all read
        </Button>
      </div>

      {pinned ? (
        <div className="border-b border-border px-1 pb-1">
          {counts.conversations > 0 ? (
            <PinnedRow
              icon={<MessageSquare />}
              label={`${counts.conversations === 1 ? "Conversation" : "Conversations"} with unread messages`}
              count={counts.conversations}
              onClick={() => {
                openMessages();
                onNavigate?.();
              }}
            />
          ) : null}
          {(counts.approvals ?? 0) > 0 ? (
            <PinnedRow
              icon={<ClipboardCheck />}
              label="Waiting on you"
              count={counts.approvals ?? 0}
              onClick={() => {
                openApprovals();
                onNavigate?.();
              }}
            />
          ) : null}
          {/* WHAT WAITS ON YOU IN YOUR TABLES, one row per organization, each named — it opens
              that organization's inbox (`/data-v2?org=`), whichever organization is selected. */}
          {counts.workByOrganization.map((o) => (
            <PinnedRow
              key={o.organization_id}
              icon={<InboxIcon />}
              label={`In your tables · ${o.organization_name ?? "an organization"}`}
              count={o.waiting}
              onClick={() => {
                const href = `/data-v2?org=${o.organization_id}`;
                startTransition(() => router.push(href));
                onNavigate?.();
              }}
            />
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {list.error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">Your notifications didn't load.</div>
              <div className="text-xs text-muted-foreground">
                {list.error.message}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={list.refetch}
            >
              Retry
            </Button>
          </div>
        ) : list.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your inbox…
          </div>
        ) : list.rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Bell className="h-5 w-5" />
            </span>
            <div className="text-sm font-medium text-foreground">
              Nothing here yet
            </div>
            <div className="text-xs text-muted-foreground">
              Anything the platform tells you lands here, and you choose which
              events reach you in Settings › Notifications.
            </div>
          </div>
        ) : (
          list.rows.map((row) => (
            <NotificationRow key={row.id} row={row} onOpen={openRow} />
          ))
        )}
      </div>

      {variant === "compact" ? (
        <div className="border-t border-border px-1 py-1">
          <AppLink
            href={NOTIFICATIONS_ROUTE}
            onClick={onNavigate}
            className="flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-[var(--matrx-glass-bg-hover)]"
          >
            See all notifications
            <ChevronRight className="h-3.5 w-3.5" />
          </AppLink>
        </div>
      ) : null}
    </div>
  );
}

export default InboxPanel;

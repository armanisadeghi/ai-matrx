"use client";

/**
 * features/notifications/components/BellPanel.tsx — the bell's body: the
 * Notifications canvas tab (`variant="pane"`, desktop and phone — touch-sized
 * on a phone) and the compact self-titled embed (RESEARCH.md §3.2, §3.7).
 *
 *   Notifications        [For you] [Updates •]          ⋯
 *   NEEDS YOU · 3        real rows, Review in place, + N more
 *   TODAY / YESTERDAY / THIS WEEK / EARLIER   grouped rows
 *   All places           every notice source (ruling 3)
 *   Open inbox           the full inbox as a WINDOW (ruling 4)
 *
 * Opening it clears the badge (ruling 1). Done is the main gesture (ruling 2).
 * NOTHING HERE MOVES THE PAGE: rows, sources and the footer open windows or new
 * tabs only — `__tests__/bell-never-navigates.test.tsx` clicks every control.
 * No bulk actions and no filters here; those live in the inbox.
 */

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Archive,
  Bell,
  CheckCheck,
  ListX,
  Inbox as InboxIcon,
  MoreHorizontal,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@ai-matrx/design-system";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { groupNotices, type NoticeGroup } from "../grouping";
import { noticeTitle, timeBucketOf, type TimeBucket } from "../presentation";
import { useInboxActions, useInboxCounts, useInboxFeed, useInboxKinds } from "../useInbox";
import { useNoticeHandlers } from "../useNoticeHandlers";
import { openInNewTab } from "../openNotice";
import { NoticeRow } from "./NoticeRow";
import { PlacesStrip } from "./PlacesStrip";

export const NOTIFICATIONS_ROUTE = "/notifications";
const NEEDS_YOU_SHOWN = 3;
const BUCKET_ORDER: TimeBucket[] = ["Today", "Yesterday", "This week", "Earlier"];

type BellTab = "for_you" | "updates";

interface BellPanelProps {
  /** `pane` = the Notifications canvas tab (its pane header names it); `compact` = a self-titled embed. */
  variant?: "compact" | "pane";
  /** Called after something opened, so a host popover can close. */
  onNavigate?: () => void;
  className?: string;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-[1] flex h-7 items-center bg-[var(--matrx-glass-bg,transparent)] px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
      {children}
    </div>
  );
}

export function BellPanel({ variant = "compact", onNavigate, className }: BellPanelProps) {
  // The canvas tab is full screen on a phone: touch-sized rows, one column.
  const isMobile = useIsMobile();
  const touch = variant === "pane" && isMobile;
  const dispatch = useAppDispatch();
  const counts = useInboxCounts();
  const feed = useInboxFeed({ state: "inbox" });
  const actions = useInboxActions(feed.triage);
  // Every kind in the Inbox with its count: each clears in one click (Arman, 2026-10-07).
  const kinds = useInboxKinds(feed.triage);
  const inboxCount = counts.summary?.inbox ?? feed.rows.length;
  const [tab, setTab] = useState<BellTab>("for_you");
  const [expanded, setExpanded] = useState<string | null>(null);
  const handlers = useNoticeHandlers(actions, {
    onOpened: (how) => {
      if (how !== "none") onNavigate?.();
    },
  });

  // Opening the bell is "seen": the badge clears (ruling 1).
  // Re-run as each counting source answers, so what it shows while open is seen too.
  const { markSeen, approvals, work } = counts;
  // The host mounts this body only while it is open; markSeen is idempotent.
  useEffect(() => {
    markSeen();
  }, [approvals, work, markSeen]);

  const openInbox = (initialTab?: string) => {
    dispatch(openOverlay({ overlayId: "notificationsInboxWindow", data: initialTab ? { initialTab } : {} }));
    onNavigate?.();
  };

  const groups = groupNotices(feed.rows);
  const needsYou = groups.filter((g) => g.bucket === "needs_you");
  const forYou = groups.filter((g) => g.bucket === "direct");
  const updates = groups.filter((g) => g.bucket === "updates");
  const listed = tab === "for_you" ? forYou : updates;

  const buckets = new Map<TimeBucket, NoticeGroup[]>();
  for (const group of listed) {
    const b = timeBucketOf(group.lead.sort_at);
    buckets.set(b, [...(buckets.get(b) ?? []), group]);
  }

  const row = (group: NoticeGroup) => (
    <NoticeRow
      key={group.key}
      group={group}
      triage={feed.triage}
      density={touch ? "sheet" : "bell"}
      expanded={expanded === group.key}
      onToggleExpand={() => setExpanded((k) => (k === group.key ? null : group.key))}
      {...handlers}
    />
  );

  const tabButton = (key: BellTab, label: string, dot: boolean) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => setTab(key)}
      className={cn(
        "relative h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
        tab === key
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-[var(--matrx-glass-bg-hover)] hover:text-foreground",
      )}
    >
      {label}
      {dot ? (
        <span aria-label="New updates" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
      ) : null}
    </button>
  );

  let body: React.ReactNode;
  if (feed.error) {
    body = (
      <div className="m-2 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">Your notifications didn&apos;t load.</div>
          <div className="truncate text-xs text-muted-foreground">{feed.error.message}</div>
        </div>
        <Button type="button" variant="outline" onClick={feed.refetch}>
          Retry
        </Button>
        <ErrorAlchemyMenu error={feed.error.message} />
      </div>
    );
  } else if (feed.isLoading) {
    body = (
      <div className="space-y-1 p-2" aria-busy="true" aria-label="Loading notifications">
        {[0, 1, 2, 3, 4].map((n) => (
          <div key={n} className="flex h-14 items-center gap-2.5 px-2">
            <Skeleton className="h-7 w-7 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  } else {
    const showNeeds = tab === "for_you" && needsYou.length > 0;
    body = (
      <>
        {showNeeds ? (
          <section aria-label="Needs you">
            <SectionLabel>Needs you · {needsYou.length}</SectionLabel>
            <div className="px-1">{needsYou.slice(0, NEEDS_YOU_SHOWN).map(row)}</div>
            {needsYou.length > NEEDS_YOU_SHOWN ? (
              <button
                type="button"
                onClick={() => openInbox("needs_you")}
                className="ml-12 h-7 rounded-md px-2 text-xs font-medium text-primary hover:bg-[var(--matrx-glass-bg-hover)]"
              >
                + {needsYou.length - NEEDS_YOU_SHOWN} more
              </button>
            ) : null}
          </section>
        ) : null}
        {BUCKET_ORDER.filter((b) => buckets.has(b)).map((b) => (
          <section key={b} aria-label={b}>
            <SectionLabel>{b}</SectionLabel>
            <div className="px-1">{(buckets.get(b) ?? []).map(row)}</div>
          </section>
        ))}
        {listed.length === 0 && !showNeeds ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Bell className="h-5 w-5" />
            </span>
            <div className="text-sm font-medium text-foreground">
              {tab === "for_you" ? "You're all caught up" : "No updates"}
            </div>
            {counts.summary && counts.summary.done > 0 ? (
              <button
                type="button"
                onClick={() => openInbox("done")}
                className="text-xs text-primary hover:underline"
              >
                See Done · {counts.summary.done}
              </button>
            ) : null}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col",
        variant === "compact" ? "max-h-[min(640px,80dvh)]" : "h-full min-h-0",
        className,
      )}
      data-inbox-panel={variant}
    >
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-3">
        {variant === "compact" ? (
          // The canvas pane header already titles the pane variant.
          <span className="mr-2 text-sm font-semibold text-foreground">Notifications</span>
        ) : null}
        <div role="tablist" aria-label="Notification views" className="flex items-center gap-0.5">
          {tabButton("for_you", "For you", false)}
          {tabButton("updates", "Updates", counts.updatesDot)}
        </div>
        <span className="flex-1" />
        {feed.triage && inboxCount > 0 ? (
          <button
            type="button"
            data-inbox-clear-all
            onClick={() => void actions.clear(null, "Cleared")}
            title="Mark every notice done · undo from the toast"
            className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-[var(--matrx-glass-bg-hover)] hover:text-foreground"
          >
            <Archive className="h-3.5 w-3.5" />
            Clear all
          </button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Inbox options"
              title="Inbox options"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--matrx-glass-bg-hover)] hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => void actions.markAllRead()}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Mark all read
            </DropdownMenuItem>
            {feed.triage && (kinds.data?.length ?? 0) > 0 ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger data-inbox-clear-kind-menu>
                  <ListX className="mr-2 h-4 w-4" />
                  Clear a kind
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-80 w-64 overflow-y-auto">
                  {(kinds.data ?? []).map((kind) => {
                    const label = noticeTitle({ subject: null, event_label: kind.label, event_key: kind.eventKey });
                    return (
                      <DropdownMenuItem
                        key={kind.eventKey}
                        data-inbox-clear-kind={kind.eventKey}
                        onSelect={() => void actions.clear([kind.eventKey], `Cleared: ${label}`)}
                      >
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        <span className="ml-2 shrink-0 text-xs text-muted-foreground">{kind.notices}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                dispatch(
                  openOverlay({
                    overlayId: "userPreferencesWindow",
                    data: { initialTabId: "general.notifications" },
                  }),
                );
                onNavigate?.();
              }}
            >
              <Settings2 className="mr-2 h-4 w-4" />
              Notification settings
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openInbox()}>
              <InboxIcon className="mr-2 h-4 w-4" />
              Open inbox
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* A SHORT PANE KEEPS ITS NOTICES (2026-10-03). In a split canvas the pane
          was ~270px: the header, the pinned All places strip and the footer
          took all of it and "Needs you · 24" was clipped under the strip. The
          notices keep a floor (min-h-24); the strip yields first and scrolls
          inside itself. */}
      <div className="min-h-24 flex-1 overflow-y-auto overscroll-contain py-1">{body}</div>

      <div className="min-h-0 shrink overflow-y-auto overscroll-contain">
        <PlacesStrip onOpened={onNavigate} columns={touch ? 1 : 2} />
      </div>

      <div className={cn("shrink-0 border-t border-border px-1 py-1", touch ? "pb-safe" : undefined)}>
        <button
          type="button"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey) {
              openInNewTab(NOTIFICATIONS_ROUTE);
              onNavigate?.();
              return;
            }
            openInbox();
          }}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium text-foreground transition-colors hover:bg-[var(--matrx-glass-bg-hover)]",
            touch ? "h-11" : "h-8",
          )}
          title="Opens over this page · Ctrl or Cmd-click for a new tab"
        >
          <InboxIcon className="h-3.5 w-3.5" />
          Open inbox
        </button>
      </div>
    </div>
  );
}

export default BellPanel;

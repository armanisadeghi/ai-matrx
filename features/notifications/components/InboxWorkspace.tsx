"use client";

/**
 * features/notifications/components/InboxWorkspace.tsx — THE INBOX (RESEARCH.md §3.5).
 *
 * Linear-style triage to zero: a rail (views + Places), a list of grouped rows,
 * and a detail pane. Mounted by `/notifications` AND by the inbox window (the
 * bell's "Open inbox") — a window wraps the canonical component, never a copy.
 *
 * - Views: Inbox · Needs you · Updates · Snoozed · Done. Snoozed and Done exist
 *   only while the triage doors are on this database (absent, never pretend).
 * - Snoozed gathers hidden items from EVERY source (`HiddenElsewhere`).
 * - Organization filter defaults to All organizations; the page keeps it in
 *   `?org_filter=`, the window in its own state. Never the active organization.
 * - Keys: J/K ↑/↓ move · Enter/O open · E done · U read · H snooze · X select ·
 *   Shift+E done every read · Z undo · ? shortcuts · Esc clear.
 * - Bulk: X, Shift-click a range, select all; Done · Mark read · Snooze.
 *
 * The workspace never navigates: "Open" opens the target's window over the page
 * or a new tab; the page host owns the address (`org_filter`) and nothing else.
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bell,
  Check,
  CheckCheck,
  Clock,
  Inbox as InboxIcon,
  Keyboard,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdminPerson } from "@/lib/redux/selectors/userSelectors";
import { EntityOrgFilter } from "@/lib/entity-list/components/EntityOrgFilter";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { groupNotices, idsOf, type NoticeGroup } from "../grouping";
import { categoryFor, noticeContext, noticeTitle, plainPreview, snoozeChoices } from "../presentation";
import { useInboxActions, useInboxCounts, useInboxFeed } from "../useInbox";
import { useNoticeHandlers } from "../useNoticeHandlers";
import { usePlaceStates, visibleSources } from "../sources/registry";
import type { InboxState } from "../types";
import { NoticeRow } from "./NoticeRow";
import { NoticeDetail } from "./NoticeDetail";
import { NO_STATE, SourceItem } from "./PlacesStrip";
import { HiddenElsewhere } from "./HiddenElsewhere";

export type InboxTab = "inbox" | "needs_you" | "updates" | "snoozed" | "done";

export function isInboxTab(value: unknown): value is InboxTab {
  return value === "inbox" || value === "needs_you" || value === "updates" || value === "snoozed" || value === "done";
}

const TAB_STATE: Record<InboxTab, InboxState> = {
  inbox: "inbox",
  needs_you: "inbox",
  updates: "inbox",
  snoozed: "snoozed",
  done: "done",
};

const TAB_LABEL: Record<InboxTab, string> = {
  inbox: "Inbox",
  needs_you: "Needs you",
  updates: "Updates",
  snoozed: "Snoozed",
  done: "Done",
};

const SHORTCUTS: ReadonlyArray<readonly [string, string]> = [
  ["J / K", "Next / previous"],
  ["Enter / O", "Open in the pane"],
  ["E", "Done"],
  ["Shift + E", "Done for every read item"],
  ["U", "Mark read / unread"],
  ["H", "Snooze"],
  ["X", "Select"],
  ["Z", "Undo"],
  ["G then N", "Inbox, from anywhere"],
  ["Esc", "Clear selection"],
];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export interface InboxWorkspaceProps {
  mode: "page" | "window";
  initialTab?: InboxTab;
  /** The organization filter (null = All organizations), owned by the host. */
  orgFilter: string | null;
  onOrgFilterChange: (orgId: string | null) => void;
}

export function InboxWorkspace({ mode, initialTab = "inbox", orgFilter, onOrgFilterChange }: InboxWorkspaceProps) {
  const [tab, setTab] = useState<InboxTab>(initialTab);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pushed, setPushed] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isAdmin = useAppSelector(selectIsAdminPerson);
  const placeStates = usePlaceStates();

  const counts = useInboxCounts();
  const feed = useInboxFeed({ state: TAB_STATE[tab], orgId: orgFilter, unreadOnly });
  // The Inbox view's rows feed the Needs-you count on every view (same cache when on it).
  const inboxFeed = useInboxFeed({ state: "inbox", orgId: orgFilter, unreadOnly });
  const actions = useInboxActions(feed.triage);
  const handlers = useNoticeHandlers(actions);
  const triage = feed.triage && counts.triage;

  // Opening the inbox is "seen" too (ruling 1).
  const { markSeen, approvals: approvalsCount, work: workCount } = counts;
  // Re-run as each counting source answers, so what it shows is seen too (idempotent).
  useEffect(() => {
    markSeen();
  }, [approvalsCount, workCount, markSeen]);

  // Done needs the triage door; without it the Done view falls back to the Inbox.
  // Snoozed stays: what was hidden in the other systems is listed there either way.
  useEffect(() => {
    if (!triage && tab === "done") setTab("inbox");
  }, [triage, tab]);

  const all = groupNotices(feed.rows);
  const byTab =
    tab === "needs_you"
      ? all.filter((g) => g.bucket === "needs_you")
      : tab === "updates"
        ? all.filter((g) => g.bucket === "updates")
        : tab === "inbox"
          ? all.filter((g) => g.bucket !== "updates")
          : all;
  const categories = [...new Map(byTab.map((g) => {
    const c = categoryFor(g.lead.event_key);
    return [c.key, c] as const;
  })).values()];
  const needle = search.trim().toLowerCase();
  const groups = byTab.filter((g) => {
    if (category && categoryFor(g.lead.event_key).key !== category) return false;
    if (!needle) return true;
    return g.rows.some((row) =>
      `${noticeTitle(row)} ${plainPreview(row.body, 400)} ${noticeContext(row)} ${row.actor_name ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  });
  const filtered = Boolean(needle || category || unreadOnly || orgFilter);

  const cursorIndex = Math.max(0, groups.findIndex((g) => g.key === cursor));
  const current: NoticeGroup | null = groups.length ? groups[cursor ? cursorIndex : 0] ?? null : null;
  const checkedGroups = groups.filter((g) => checked.has(g.key));

  const move = (delta: number) => {
    if (!groups.length) return;
    const next = Math.min(groups.length - 1, Math.max(0, cursorIndex + delta));
    setCursor(groups[next].key);
    rootRef.current
      ?.querySelector(`[data-notice-group="${CSS.escape(groups[next].key)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };

  const select = (group: NoticeGroup) => {
    setCursor(group.key);
    setPushed(true);
    const unread = group.rows.filter((r) => r.read_at === null);
    if (unread.length) void actions.act(unread, "read", { quiet: true });
  };

  // After Done/Snooze the cursor moves to the next row, never to the top.
  const afterRemove = (group: NoticeGroup) => {
    if (cursor !== group.key) return;
    const i = groups.findIndex((g) => g.key === group.key);
    const next = groups[i + 1] ?? groups[i - 1] ?? null;
    setCursor(next?.key ?? null);
  };

  const rowHandlers = {
    ...handlers,
    onOpen: select,
    onDone: (group: NoticeGroup) => {
      afterRemove(group);
      handlers.onDone(group);
    },
    onSnooze: (group: NoticeGroup, until: Date) => {
      afterRemove(group);
      handlers.onSnooze(group, until);
    },
    onUndone: (group: NoticeGroup) => {
      afterRemove(group);
      handlers.onUndone?.(group);
    },
    onUnsnooze: (group: NoticeGroup) => {
      afterRemove(group);
      handlers.onUnsnooze?.(group);
    },
  };

  const toggleCheck = (group: NoticeGroup, shift: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (shift && lastChecked) {
        const a = groups.findIndex((g) => g.key === lastChecked);
        const b = groups.findIndex((g) => g.key === group.key);
        if (a >= 0 && b >= 0) {
          for (const g of groups.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(g.key);
          return next;
        }
      }
      if (next.has(group.key)) next.delete(group.key);
      else next.add(group.key);
      return next;
    });
    setLastChecked(group.key);
  };

  const bulk = (action: "done" | "read" | "snooze", until?: Date) => {
    const rows = checkedGroups.flatMap((g) => g.rows);
    setChecked(new Set());
    void actions.act(rows, action, { until });
  };

  const doneAllRead = () => {
    const read = groups.filter((g) => g.unread === 0);
    if (read.length) void actions.act(read.flatMap((g) => g.rows), "done");
  };

  const onKey = (event: KeyboardEvent | React.KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
    const key = event.key;
    const lower = key.toLowerCase();
    // Enter / Space on a focused control belong to that control, never to the cursor row.
    const control = (event.target as HTMLElement | null)?.closest?.(
      'button, a, [role="menuitem"], [role="tab"], [role="checkbox"]',
    );
    if ((key === "Enter" || key === " " || lower === "o") && control && !control.matches("[data-notice-open]")) return;
    if (key === "?") {
      setHelpOpen(true);
    } else if (lower === "j" || key === "ArrowDown") {
      move(1);
    } else if (lower === "k" || key === "ArrowUp") {
      move(-1);
    } else if ((key === "Enter" || lower === "o") && current) {
      select(current);
    } else if (key === "E" && event.shiftKey && triage) {
      doneAllRead();
    } else if (lower === "e" && current && triage && tab !== "done") {
      rowHandlers.onDone(current);
    } else if (lower === "u" && current && (current.unread > 0 || triage)) {
      handlers.onToggleRead(current);
    } else if (lower === "h" && current && triage && tab !== "done") {
      setSnoozeOpen(true);
    } else if (lower === "x" && current) {
      toggleCheck(current, false);
    } else if (lower === "z" && actions.canUndo) {
      void actions.undo();
    } else if (key === "Escape") {
      setChecked(new Set());
      setPushed(false);
      return;
    } else {
      return;
    }
    event.preventDefault();
  };

  // The page listens everywhere; a window only while focus is inside it.
  useEffect(() => {
    if (mode !== "page") return;
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as Node | null;
      if (target && target !== document.body && !rootRef.current?.contains(target)) return;
      onKey(event);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });

  const summary = counts.summary;
  const hiddenElsewhere = counts.workSnoozed;
  const tabCount = (t: InboxTab): number | null => {
    if (!summary) return null;
    if (t === "inbox") return summary.unread || null;
    if (t === "needs_you") return groupNotices(inboxFeed.rows).filter((g) => g.bucket === "needs_you").length || null;
    if (t === "updates") return null;
    if (t === "snoozed") return summary.snoozed + hiddenElsewhere || null;
    return null;
  };
  const tabs: InboxTab[] = triage
    ? ["inbox", "needs_you", "updates", "snoozed", "done"]
    : ["inbox", "needs_you", "updates", "snoozed"];

  const tabButton = (t: InboxTab, layout: "rail" | "strip") => {
    const n = tabCount(t);
    const dot = t === "updates" && counts.updatesDot;
    return (
      <button
        key={t}
        type="button"
        role="tab"
        aria-selected={tab === t}
        onClick={() => {
          setTab(t);
          setCursor(null);
          setChecked(new Set());
          setPushed(false);
        }}
        className={cn(
          "flex items-center gap-2 rounded-md text-left text-sm transition-colors",
          layout === "rail" ? "h-8 w-full px-2.5" : "h-8 shrink-0 px-2.5",
          tab === t ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-[var(--matrx-glass-bg-hover)] hover:text-foreground",
        )}
      >
        {layout === "rail" ? (
          t === "snoozed" ? <Clock className="h-3.5 w-3.5" /> : t === "done" ? <Check className="h-3.5 w-3.5" /> : t === "updates" ? <Bell className="h-3.5 w-3.5" /> : <InboxIcon className="h-3.5 w-3.5" />
        ) : null}
        <span className={layout === "rail" ? "flex-1" : undefined}>{TAB_LABEL[t]}</span>
        {dot ? <span aria-label="New updates" className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
        {n ? <span className="text-xs tabular-nums text-muted-foreground">{n > 999 ? "999+" : n}</span> : null}
      </button>
    );
  };

  // ── list body ──────────────────────────────────────────────────────────
  let list: React.ReactNode;
  if (feed.error) {
    list = (
      <div className="m-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground">
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
    list = (
      <div className="space-y-1 p-2" aria-busy="true" aria-label="Loading notifications">
        {Array.from({ length: 8 }, (_, n) => (
          <div key={n} className="flex h-16 items-center gap-2.5 px-3">
            <Skeleton className="h-7 w-7 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (groups.length === 0) {
    list = (
      <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {filtered ? <Search className="h-5 w-5" /> : <CheckCheck className="h-5 w-5" />}
        </span>
        <div className="text-sm font-medium text-foreground">
          {filtered
            ? "Nothing matches"
            : tab === "done"
              ? "Nothing done yet"
              : tab === "snoozed"
                ? "Nothing snoozed here"
                : "You're all caught up"}
        </div>
        {filtered ? (
          <Button
            type="button"
            variant="quiet"
            onClick={() => {
              setSearch("");
              setCategory(null);
              setUnreadOnly(false);
              onOrgFilterChange(null);
            }}
          >
            Clear filters
          </Button>
        ) : tab !== "done" && triage && summary && summary.done > 0 ? (
          <Button type="button" variant="quiet" onClick={() => setTab("done")}>
            See Done · {summary.done}
          </Button>
        ) : null}
      </div>
    );
  } else {
    list = (
      <div className="px-1 py-1">
        {groups.map((group) => (
          <NoticeRow
            key={group.key}
            group={group}
            triage={triage}
            density="page"
            selected={current?.key === group.key}
            checked={checked.has(group.key)}
            selecting={checked.size > 0}
            onCheck={(shift) => toggleCheck(group, shift)}
            {...rowHandlers}
          />
        ))}
        {feed.hasMore ? (
          <div className="flex justify-center py-2">
            <Button type="button" variant="quiet" onClick={feed.loadMore} disabled={feed.loadingMore}>
              {feed.loadingMore ? "Loading more notifications…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const allChecked = groups.length > 0 && checkedGroups.length === groups.length;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={mode === "window" ? (e) => onKey(e) : undefined}
      className="@container flex h-full min-h-0 w-full outline-none"
      data-inbox-workspace={mode}
    >
      {/* RAIL */}
      <nav aria-label="Inbox views" className="hidden w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border p-2 @4xl:flex">
        <div role="tablist" aria-orientation="vertical" className="flex flex-col gap-0.5">
          {tabs.map((t) => tabButton(t, "rail"))}
        </div>
        <div className="mt-3 flex h-6 items-center px-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Places
        </div>
        {visibleSources(Boolean(isAdmin)).map((source) => (
          <SourceItem key={source.key} source={source} state={placeStates[source.key] ?? NO_STATE} layout="rail" />
        ))}
      </nav>

      {/* LIST */}
      <section
        aria-label={TAB_LABEL[tab]}
        className={cn(
          "min-h-0 w-full flex-col border-r border-border @2xl:flex @2xl:w-[420px] @2xl:shrink-0",
          pushed && current ? "hidden" : "flex",
        )}
      >
        <div role="tablist" className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2 py-1.5 scrollbar-hide @4xl:hidden">
          {tabs.map((t) => tabButton(t, "strip"))}
        </div>

        {checkedGroups.length > 0 ? (
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
            <Checkbox
              checked={allChecked ? true : "indeterminate"}
              aria-label="Select all"
              onClick={() => setChecked(allChecked ? new Set() : new Set(groups.map((g) => g.key)))}
            />
            <span className="ml-1 mr-auto text-xs font-medium text-foreground">{idsOf(checkedGroups).length} selected</span>
            {triage && tab !== "done" ? (
              <Button icon={<Check />} type="button" variant="quiet" onClick={() => bulk("done")}> Done
              </Button>
            ) : null}
            <Button type="button" variant="quiet" onClick={() => bulk("read")}>
              Mark read
            </Button>
            {triage && tab !== "done" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button icon={<Clock />} type="button" variant="quiet"> Snooze
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Snooze until</DropdownMenuLabel>
                  {snoozeChoices().map((choice) => (
                    <DropdownMenuItem key={choice.key} onSelect={() => bulk("snooze", choice.until)}>
                      {choice.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <Button icon={<X />} type="button" variant="quiet" onClick={() => setChecked(new Set())} aria-label="Clear selection" />
          </div>
        ) : (
          <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border px-2">
            <div className="relative min-w-[6.5rem] flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input adornment="start"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                aria-label="Search notifications"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="quiet">
                  {category ? categories.find((c) => c.key === category)?.label ?? "Type" : "Type"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => setCategory(null)}>All types</DropdownMenuItem>
                {categories.map((c) => (
                  <DropdownMenuItem key={c.key} onSelect={() => setCategory(c.key)}>
                    <c.icon className="mr-2 h-4 w-4" />
                    {c.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="quiet"
              aria-pressed={unreadOnly}
              onClick={() => setUnreadOnly((v) => !v)}
            >
              Unread
            </Button>
            {triage ? (
              <EntityOrgFilter orgId={orgFilter} onChange={onOrgFilterChange} className="max-w-[9.5rem] shrink-0" />
            ) : null}
            <Button icon={<Keyboard />} type="button" variant="quiet" className="hidden @2xl:inline-flex" onClick={() => setHelpOpen(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {list}
          {tab === "snoozed" ? <HiddenElsewhere /> : null}
        </div>
      </section>

      {/* DETAIL */}
      <section
        aria-label="Notification"
        className={cn("min-h-0 min-w-0 flex-1 flex-col @2xl:flex", pushed && current ? "flex" : "hidden")}
      >
        {current ? (
          <NoticeDetail
            group={current}
            triage={triage}
            handlers={rowHandlers}
            snoozeOpen={snoozeOpen}
            onSnoozeOpenChange={setSnoozeOpen}
            onBack={pushed ? () => setPushed(false) : undefined}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <InboxIcon className="h-8 w-8 opacity-40" />
            <span className="text-sm">Select a notification</span>
          </div>
        )}
      </section>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {SHORTCUTS.map(([keys, what]) => (
              <div key={keys} className="contents">
                <dt>
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{keys}</kbd>
                </dt>
                <dd className="text-muted-foreground">{what}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}

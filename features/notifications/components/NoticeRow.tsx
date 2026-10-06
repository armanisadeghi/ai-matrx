"use client";

/**
 * features/notifications/components/NoticeRow.tsx — ONE row anatomy for the bell,
 * the phone sheet and the inbox page (RESEARCH.md §3.3).
 *
 *   [•] [lead 28px]  Actor · Title ·············· [×N]   time | hover: ✓ ⏰ ⋯
 *                    Context · one-line plain preview
 *
 * Fixed heights (52 / 64 px) — a body is never rendered here; markdown lives in
 * the detail pane only. Unread is a dot plus weight, never a tinted row.
 * Every action opens a window or a new tab; nothing here can move the page.
 * On the phone sheet a swipe left is Done and a swipe right toggles read.
 */

import { useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  BellOff,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NoticeGroup } from "../grouping";
import { actorsPhrase } from "../grouping";
import {
  categoryFor,
  fullTime,
  noticeContext,
  noticeTitle,
  plainPreview,
  shortTime,
  snoozeChoices,
  untilTime,
} from "../presentation";
import type { InboxNotification } from "../types";

export interface NoticeRowHandlers {
  onOpen: (group: NoticeGroup) => void;
  onOpenMember?: (row: InboxNotification) => void;
  onDone: (group: NoticeGroup) => void;
  onUndone?: (group: NoticeGroup) => void;
  onSnooze: (group: NoticeGroup, until: Date) => void;
  onUnsnooze?: (group: NoticeGroup) => void;
  onToggleRead: (group: NoticeGroup) => void;
  onOpenInNewTab: (group: NoticeGroup) => void;
  onMuteType: (group: NoticeGroup) => void;
}

interface NoticeRowProps extends NoticeRowHandlers {
  group: NoticeGroup;
  /** False while the triage doors are absent: Done and Snooze are not offered. */
  triage: boolean;
  density: "bell" | "page" | "sheet";
  selected?: boolean;
  checked?: boolean;
  /** Some row is selected: every row shows its checkbox. */
  selecting?: boolean;
  onCheck?: (shift: boolean) => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

function Lead({ group }: { group: NoticeGroup }) {
  const row = group.lead;
  const category = categoryFor(row.event_key);
  const Icon = category.icon;
  if (row.actor_avatar && group.rows.length === 1) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a profile avatar URL, any host
      <img
        src={row.actor_avatar}
        alt=""
        className="h-7 w-7 shrink-0 rounded-full object-cover"
      />
    );
  }
  if (row.actor_name && group.rows.length === 1) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
        {row.actor_name.trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
        group.bucket === "needs_you"
          ? "bg-primary/10 text-primary-ink"
          : "bg-muted text-muted-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

export function NoticeRow({
  group,
  triage,
  density,
  selected = false,
  checked,
  selecting = false,
  onCheck,
  expanded = false,
  onToggleExpand,
  ...handlers
}: NoticeRowProps) {
  const row = group.lead;
  const unread = group.unread > 0;
  const many = group.rows.length > 1;
  const title = noticeTitle(row);
  const actors = actorsPhrase(group.actors);
  const second = many
    ? [actors, `${group.rows.length} ${row.bucket === "updates" ? "updates" : "notices"}`, noticeContext(row)]
        .filter(Boolean)
        .join(" · ")
    : [noticeContext(row), plainPreview(row.body)].filter(Boolean).join(" · ");
  const hasLink = Boolean(row.deep_link);
  const done = row.done_at !== null;
  const snoozed = row.snoozed_until !== null && Date.parse(row.snoozed_until) > Date.now();

  // ── swipe (phone sheet) ────────────────────────────────────────────────
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dx, setDx] = useState(0);
  // An open menu keeps the hover actions on screen (its trigger must not vanish).
  const [menuOpen, setMenuOpen] = useState(false);
  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState(false);
  const pinned = menuOpen || snoozeMenuOpen;
  const swipe = density === "sheet";
  const onTouchStart = (e: React.TouchEvent) => {
    if (!swipe) return;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!swipe || !start.current) return;
    const x = e.touches[0].clientX - start.current.x;
    const y = e.touches[0].clientY - start.current.y;
    if (Math.abs(y) > Math.abs(x)) return;
    setDx(Math.max(-120, Math.min(120, x)));
  };
  const onTouchEnd = () => {
    if (!swipe) return;
    if (dx <= -80 && triage) handlers.onDone(group);
    else if (dx >= 80 && (unread || triage)) handlers.onToggleRead(group);
    start.current = null;
    setDx(0);
  };

  const iconButton =
    "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--matrx-glass-bg-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const menu = (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={iconButton} aria-label="More actions" title="More actions">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {density === "sheet" && triage && !done ? (
          <>
            {/* The phone has no hover row: Done and Snooze live here (and on the swipe). */}
            <DropdownMenuItem onSelect={() => handlers.onDone(group)}>
              <Check className="mr-2 h-4 w-4" />
              Done
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Clock className="mr-2 h-4 w-4" />
                Snooze
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-44">
                {snoozeChoices().map((choice) => (
                  <DropdownMenuItem key={choice.key} onSelect={() => handlers.onSnooze(group, choice.until)}>
                    {choice.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {unread || triage ? (
          // Mark unread needs the triage door; absent until it is on this database.
          <DropdownMenuItem onSelect={() => handlers.onToggleRead(group)}>
            {unread ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}
            {unread ? "Mark read" : "Mark unread"}
          </DropdownMenuItem>
        ) : null}
        {hasLink ? (
          <DropdownMenuItem onSelect={() => handlers.onOpenInNewTab(group)}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Open in new tab
          </DropdownMenuItem>
        ) : null}
        {triage && done && handlers.onUndone ? (
          <DropdownMenuItem onSelect={() => handlers.onUndone?.(group)}>
            <ChevronRight className="mr-2 h-4 w-4" />
            Move to Inbox
          </DropdownMenuItem>
        ) : null}
        {triage && snoozed && handlers.onUnsnooze ? (
          <DropdownMenuItem onSelect={() => handlers.onUnsnooze?.(group)}>
            <Clock className="mr-2 h-4 w-4" />
            Unsnooze
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => handlers.onMuteType(group)}>
          <BellOff className="mr-2 h-4 w-4" />
          Turn off this type
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const snoozeMenu = triage && !done ? (
    <DropdownMenu open={snoozeMenuOpen} onOpenChange={setSnoozeMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={iconButton} aria-label="Snooze" title="Snooze (H)">
          <Clock className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Snooze until</DropdownMenuLabel>
        {snoozeChoices().map((choice) => (
          <DropdownMenuItem key={choice.key} onSelect={() => handlers.onSnooze(group, choice.until)}>
            {choice.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  const doneButton = triage && !done ? (
    <button
      type="button"
      className={iconButton}
      aria-label="Done"
      title="Done (E)"
      onClick={() => handlers.onDone(group)}
    >
      <Check className="h-4 w-4" />
    </button>
  ) : null;

  const timeLabel = snoozed ? untilTime(row.snoozed_until as string) : shortTime(row.sort_at);

  return (
    <div data-notice-group={group.key} data-notice-id={row.id} className="relative">
      {swipe && dx !== 0 ? (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 flex items-center rounded-lg px-4 text-xs font-medium",
            dx < 0 ? "justify-end bg-primary/15 text-primary-ink" : "justify-start bg-muted text-foreground",
          )}
        >
          {dx < 0 ? (triage ? "Done" : "") : unread ? "Mark read" : "Mark unread"}
        </div>
      ) : null}
      <div
        className={cn(
          "group/row relative flex w-full items-center gap-2 rounded-lg pr-1 transition-colors",
          density === "page" ? "h-16" : many || second ? "h-16" : "h-[52px]",
          selected
            ? "bg-accent"
            : "bg-transparent hover:bg-[var(--matrx-glass-bg-hover)]",
          swipe ? "bg-background" : undefined,
        )}
        style={swipe && dx !== 0 ? { transform: `translateX(${dx}px)` } : undefined}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        aria-selected={density === "page" ? selected : undefined}
      >
        <span
          aria-hidden
          className={cn(
            "ml-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
            unread ? "bg-primary" : "bg-transparent",
          )}
        />
        {onCheck ? (
          <span
            className={cn(
              "shrink-0 items-center",
              // On a phone the checkbox is absent until a selection exists (no invisible tap target).
              checked || selecting
                ? "flex"
                : "hidden opacity-0 @2xl:flex group-hover/row:opacity-100 focus-within:opacity-100",
            )}
          >
            <Checkbox
              checked={Boolean(checked)}
              aria-label={`Select ${title}`}
              onClick={(e) => {
                e.stopPropagation();
                onCheck(e.shiftKey);
              }}
            />
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => handlers.onOpen(group)}
          data-notice-open
          aria-label={`${unread ? "Unread: " : ""}${title}`}
          className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Lead group={group} />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "truncate text-sm text-foreground",
                  unread ? "font-semibold" : "font-normal",
                )}
              >
                {!many && row.actor_name ? (
                  <span className="font-semibold">{row.actor_name} · </span>
                ) : null}
                {title}
              </span>
              {many ? (
                <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-semibold leading-4 text-muted-foreground">
                  {group.rows.length}
                </span>
              ) : null}
            </span>
            {second ? (
              <span className="block truncate text-xs text-muted-foreground">{second}</span>
            ) : null}
          </span>
        </button>

        {/* On the phone the whole row is the tap target; a second Review button only squeezes the title. */}
        {density === "bell" && group.bucket === "needs_you" && hasLink && !done ? (
          <button
            type="button"
            onClick={() => handlers.onOpen(group)}
            className={cn(
              "shrink-0 rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:bg-[var(--matrx-glass-bg-hover)]",
              "h-7 group-hover/row:hidden group-focus-within/row:hidden",
              pinned ? "hidden" : undefined,
            )}
          >
            Review
          </button>
        ) : null}

        <span
          className={cn(
            "min-w-12 shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums text-muted-foreground",
            density === "sheet" ? undefined : "group-hover/row:hidden group-focus-within/row:hidden",
            pinned && density !== "sheet" ? "hidden" : undefined,
          )}
          title={fullTime(snoozed ? (row.snoozed_until as string) : row.sort_at)}
        >
          {timeLabel}
        </span>
        {density !== "sheet" ? (
          <span
            className={cn(
              "shrink-0 items-center gap-0.5 group-hover/row:flex group-focus-within/row:flex",
              pinned ? "flex" : "hidden",
            )}
          >
            {doneButton}
            {snoozeMenu}
            {menu}
          </span>
        ) : (
          <span className="shrink-0">{menu}</span>
        )}

        {many && onToggleExpand ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className={iconButton}
            aria-label={expanded ? "Collapse" : `Show all ${group.rows.length}`}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      {many && expanded ? (
        <ul className="mb-1 ml-12 border-l border-border pl-2">
          {group.rows.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => handlers.onOpenMember?.(member)}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-[var(--matrx-glass-bg-hover)]"
              >
                <span
                  aria-hidden
                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", member.read_at === null ? "bg-primary" : "bg-transparent")}
                />
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {member.actor_name ? `${member.actor_name} · ` : ""}
                  {plainPreview(member.body, 80) || noticeTitle(member)}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground" title={fullTime(member.sort_at)}>
                  {shortTime(member.sort_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

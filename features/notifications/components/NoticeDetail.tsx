"use client";

/**
 * features/notifications/components/NoticeDetail.tsx — the inbox's detail pane.
 *
 * A triage bar (Done · Snooze · Mark unread · Open · Open in new tab · Turn off
 * this type), the notice's full body through the platform's one markdown core,
 * and — for a group — every member. "Open" opens the target as a window over the
 * page (or a new tab when it has no window); the page never moves.
 */

import {
  ArrowLeft,
  BellOff,
  Check,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  PanelTopOpen,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { NoticeGroup } from "../grouping";
import { actorsPhrase } from "../grouping";
import {
  categoryFor,
  fullTime,
  noticeTitle,
  plainPreview,
  shortTime,
  snoozeChoices,
} from "../presentation";
import type { NoticeRowHandlers } from "./NoticeRow";
import { NotificationBody } from "./NotificationBody";

export function NoticeDetail({
  group,
  triage,
  handlers,
  snoozeOpen,
  onSnoozeOpenChange,
  onBack,
}: {
  group: NoticeGroup;
  triage: boolean;
  handlers: NoticeRowHandlers;
  snoozeOpen: boolean;
  onSnoozeOpenChange: (open: boolean) => void;
  /** Narrow layouts: back to the list. */
  onBack?: () => void;
}) {
  const row = group.lead;
  const category = categoryFor(row.event_key);
  const Icon = category.icon;
  const unread = group.unread > 0;
  const done = row.done_at !== null;
  const snoozed = row.snoozed_until !== null && Date.parse(row.snoozed_until) > Date.now();
  const actors = actorsPhrase(group.actors);
  const meta = [category.label, row.organization_name, actors].filter(Boolean).join(" · ");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
        {onBack ? (
          <Button icon={<ArrowLeft />} type="button" variant="quiet" className="@2xl:hidden" onClick={onBack} aria-label="Back to list" />
        ) : null}
        {triage && !done ? (
          <Button icon={<Check />} type="button" variant="quiet" onClick={() => handlers.onDone(group)} title="Done (E)">
            Done
          </Button>
        ) : null}
        {triage && done && handlers.onUndone ? (
          <Button icon={<Undo2 />} type="button" variant="quiet" onClick={() => handlers.onUndone?.(group)}>
            Move to Inbox
          </Button>
        ) : null}
        {triage && !done ? (
          <DropdownMenu open={snoozeOpen} onOpenChange={onSnoozeOpenChange}>
            <DropdownMenuTrigger asChild>
              <Button icon={<Clock />} type="button" variant="quiet" title="Snooze (H)">
                {snoozed ? "Snoozed" : "Snooze"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Snooze until</DropdownMenuLabel>
              {snoozeChoices().map((choice) => (
                <DropdownMenuItem key={choice.key} onSelect={() => handlers.onSnooze(group, choice.until)}>
                  {choice.label}
                </DropdownMenuItem>
              ))}
              {snoozed && handlers.onUnsnooze ? (
                <DropdownMenuItem onSelect={() => handlers.onUnsnooze?.(group)}>Unsnooze</DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {unread || triage ? (
          <Button icon={unread ? <Eye /> : <EyeOff />} type="button" variant="quiet" onClick={() => handlers.onToggleRead(group)} title="Toggle read (U)">
            {unread ? "Mark read" : "Mark unread"}
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button icon={<BellOff />} type="button" variant="quiet" onClick={() => handlers.onMuteType(group)} title="Turn off this type" aria-label="Turn off this type" />
        {row.deep_link ? (
          <Button icon={<ExternalLink />} type="button" variant="quiet" onClick={() => handlers.onOpenInNewTab(group)} title="Open in new tab" aria-label="Open in new tab" />
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold leading-snug text-foreground">{noticeTitle(row)}</h2>
            <div className="mt-0.5 truncate text-xs text-muted-foreground" title={fullTime(row.sort_at)}>
              {meta ? `${meta} · ` : ""}
              {fullTime(row.sort_at)}
            </div>
          </div>
        </div>

        {row.deep_link ? (
          <Button icon={<PanelTopOpen />} variant="primary" type="button" className="mt-4" onClick={() => handlers.onOpen(group)}>
            Open
          </Button>
        ) : null}

        {group.rows.length === 1 ? (
          row.body ? (
            <div className="prose-sm mt-4 break-words text-sm text-foreground">
              <NotificationBody body={row.body} />
            </div>
          ) : null
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {group.rows.map((member) => (
              <li key={member.id}>
                <button
                  type="button"
                  onClick={() => handlers.onOpenMember?.(member)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[var(--matrx-glass-bg-hover)]"
                >
                  <span
                    aria-hidden
                    className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", member.read_at === null ? "bg-primary" : "bg-transparent")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">
                      {member.actor_name ? `${member.actor_name} · ` : ""}
                      {noticeTitle(member)}
                    </span>
                    {member.body ? (
                      <span className="block truncate text-xs text-muted-foreground">{plainPreview(member.body)}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground" title={fullTime(member.sort_at)}>
                    {shortTime(member.sort_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

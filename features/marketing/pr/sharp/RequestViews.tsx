"use client";

/**
 * The Press Room — source requests: the deadline rail, the row, the detail.
 *
 * Deadlines are the ONE genuinely losable thing on this surface, so they are
 * the only place red is spent. The rail is pinned above every view — including
 * the ones about angles and coverage — because a HARO query that closes in four
 * hours does not care which tab you happen to be looking at.
 *
 * Modelled on Muck Rack's opportunity feed for the row content, and on a
 * flight-board for the rail: fixed height, one line, impossible to miss,
 * gone the moment nothing is closing.
 */

import * as React from "react";
import {
  ArrowRight,
  Contact,
  Copy,
  ExternalLink,
  Megaphone,
  Send,
  Timer,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { FIXTURE_MEDIA_LIST_ID } from "./fixtures";
import {
  PLATFORM_LABEL,
  SOURCE_STATUS_LABEL,
  formatDayTime,
  isLiveRequest,
  keyOf,
  readDeadline,
} from "./press-model";
import { DeadlinePill, MatchScore, PanelSection, StatusPill } from "./PressPrimitives";
import {
  SOURCE_PLATFORMS,
  SOURCE_REQUEST_STATUSES,
  readRequirements,
  type SourcePlatform,
  type SourceRequestRow,
  type SourceRequestStatus,
  type StoryAngleRow,
} from "./types";

export function platformLabel(value: string): string {
  return PLATFORM_LABEL[keyOf<SourcePlatform>(value, SOURCE_PLATFORMS, "other")];
}

export function requestStatusLabel(value: string): string {
  return SOURCE_STATUS_LABEL[
    keyOf<SourceRequestStatus>(value, SOURCE_REQUEST_STATUSES, "new")
  ];
}

/** Live first, soonest deadline first, then by match. */
export function rankRequests(
  rows: SourceRequestRow[],
  now: Date,
): SourceRequestRow[] {
  return [...rows].sort((a, b) => {
    const liveA = isLiveRequest(a) ? 0 : 1;
    const liveB = isLiveRequest(b) ? 0 : 1;
    if (liveA !== liveB) return liveA - liveB;
    const msA = readDeadline(a.deadline_at, now).msLeft;
    const msB = readDeadline(b.deadline_at, now).msLeft;
    if (msA !== null && msB !== null && msA !== msB) {
      if (msA > 0 && msB > 0) return msA - msB;
      if (msA > 0) return -1;
      if (msB > 0) return 1;
    }
    return b.match_score - a.match_score;
  });
}

/** Live requests closing inside 24h — the rail's contents, in order. */
export function closingSoon(
  rows: SourceRequestRow[],
  now: Date,
): SourceRequestRow[] {
  return rows
    .filter((row) => {
      if (!isLiveRequest(row)) return false;
      const read = readDeadline(row.deadline_at, now);
      return read.urgency === "critical" || read.urgency === "today";
    })
    .sort(
      (a, b) =>
        (readDeadline(a.deadline_at, now).msLeft ?? 0) -
        (readDeadline(b.deadline_at, now).msLeft ?? 0),
    );
}

export function DeadlineRail({
  rows,
  now,
  onOpen,
}: {
  rows: SourceRequestRow[];
  now: Date;
  onOpen: (id: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="shrink-0 border-b border-glass-edge bg-glass backdrop-blur-glass backdrop-saturate-glass">
      <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide px-4 py-2">
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Timer className="h-3.5 w-3.5" />
          Closing today
        </span>
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onOpen(row.id)}
            className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 text-left transition-colors hover:border-primary/50 hover:bg-accent"
          >
            <DeadlinePill deadlineAt={row.deadline_at} now={now} />
            <span className="max-w-56 truncate text-[11px] font-medium text-foreground">
              {row.outlet ?? platformLabel(row.platform)}
            </span>
            <span className="max-w-64 truncate text-[11px] text-muted-foreground">
              {row.query_title}
            </span>
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Renders the journalist. Always a door when we have one — never a bare id. */
function JournalistRef({
  row,
  compact = false,
}: {
  row: SourceRequestRow;
  compact?: boolean;
}) {
  if (row.party_id) {
    return (
      <EntityRef
        token="party"
        id={row.party_id}
        name={row.journalist_name ?? "Journalist"}
        showIcon={!compact}
        openInNewTab
        className={compact ? "text-[11px]" : "text-xs"}
      />
    );
  }
  if (row.journalist_name) {
    // A name with no party is an UNRESOLVED reference, and it says so plus
    // ships its fix (no-dead-ends §3.2/§3.4) instead of pretending it is fine.
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={compact ? "text-[11px]" : "text-xs"}>
          {row.journalist_name}
        </span>
        <a
          href="/crm"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-0.5 rounded border border-dashed border-border px-1 py-px text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Contact className="h-2.5 w-2.5" />
          not in CRM — add
        </a>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "text-muted-foreground",
        compact ? "text-[11px]" : "text-xs",
      )}
    >
      No journalist named on this query
    </span>
  );
}

export function RequestRow({
  row,
  now,
  selected,
  onSelect,
}: {
  row: SourceRequestRow;
  now: Date;
  selected: boolean;
  onSelect: () => void;
}) {
  const live = isLiveRequest(row);
  return (
    // A DIV, not a BUTTON, on purpose: this row contains an `EntityRef`, whose
    // doors are real links and buttons. Nesting interactive elements inside a
    // <button> is invalid HTML and breaks the inner controls' click handling —
    // so the row takes the button ROLE and keeps its keyboard activation.
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onSelect();
      }}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group flex w-full cursor-pointer items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        selected
          ? "border-l-primary bg-accent/60"
          : "border-l-transparent hover:bg-accent/35",
        !live && "opacity-60",
      )}
    >
      <span className="mt-0.5 w-16 shrink-0">
        <MatchScore value={row.match_score} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug text-foreground">
            {row.query_title}
          </span>
          {row.draft_response ? (
            <span className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Draft ready
            </span>
          ) : null}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
          <span className="shrink-0 rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
            {platformLabel(row.platform)}
          </span>
          <span className="shrink-0 font-medium text-foreground">
            {row.outlet ?? "Outlet not named"}
          </span>
          <span aria-hidden="true">·</span>
          <JournalistRef row={row} compact />
          {row.beat ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{row.beat}</span>
            </>
          ) : null}
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <DeadlinePill deadlineAt={row.deadline_at} now={now} />
        <StatusPill label={requestStatusLabel(row.status)} />
      </span>
    </div>
  );
}

export function RequestDetail({
  row,
  now,
  angle,
  onSetStatus,
  onOpenAngle,
}: {
  row: SourceRequestRow;
  now: Date;
  /** The angle this query maps to, when one is linked. */
  angle: StoryAngleRow | null;
  onSetStatus: (status: SourceRequestStatus) => void;
  onOpenAngle: (id: string) => void;
}) {
  const requirements = readRequirements(row.requirements);
  const deadline = readDeadline(row.deadline_at, now);
  const closed = deadline.urgency === "expired";

  const copyDraft = async () => {
    if (!row.draft_response) return;
    try {
      await navigator.clipboard.writeText(row.draft_response);
      toast.success("Draft copied", {
        description: "Paste it into the platform's reply box.",
      });
    } catch {
      toast.error("Could not copy", {
        description: "Your browser blocked clipboard access. Select the text instead.",
      });
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border/60 px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <DeadlinePill deadlineAt={row.deadline_at} now={now} />
          <StatusPill label={requestStatusLabel(row.status)} />
          <span className="rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {platformLabel(row.platform)}
          </span>
          {row.external_url ? (
            <a
              href={row.external_url}
              target="_blank"
              rel="noreferrer noopener"
              className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              Open on {platformLabel(row.platform)}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
        <h2 className="mt-2 text-sm font-semibold leading-snug text-foreground">
          {row.query_title}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {row.outlet ?? "Outlet not named"}
          </span>
          <span aria-hidden="true">·</span>
          <JournalistRef row={row} />
          {row.beat ? <span>· {row.beat} desk</span> : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <PanelSection
          title="Why you"
          aside={<MatchScore value={row.match_score} />}
        >
          <p className="text-xs leading-relaxed text-foreground">
            {row.match_reason ?? "No match reason recorded for this query."}
          </p>
          {angle ? (
            <button
              type="button"
              onClick={() => onOpenAngle(angle.id)}
              className="mt-2 flex w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Answers your angle
                </span>
                <span className="mt-0.5 block truncate text-xs font-medium text-foreground">
                  {angle.headline}
                </span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          ) : (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Not linked to one of your angles — answer it from scratch, or open
              the angle list and attach one.
            </p>
          )}
        </PanelSection>

        {requirements.items.length > 0 ? (
          <PanelSection title="What they asked for">
            <ul className="space-y-1">
              {requirements.items.map((item, index) => (
                <li
                  key={`${item.label}-${index}`}
                  className="flex items-start gap-2 text-xs text-foreground"
                >
                  <span
                    className={cn(
                      "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                      item.met === true
                        ? "bg-emerald-500"
                        : item.met === false
                          ? "bg-muted-foreground/40"
                          : "bg-amber-500",
                    )}
                  />
                  <span className="min-w-0">
                    {item.label}
                    {item.met === null ? (
                      <span className="ml-1.5 text-[11px] text-muted-foreground">
                        — unconfirmed
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </PanelSection>
        ) : null}

        {row.query_body ? (
          <PanelSection title="The query, verbatim">
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed text-foreground">
              {row.query_body}
            </p>
          </PanelSection>
        ) : null}

        <PanelSection
          title="Your draft reply"
          aside={
            row.draft_generated_at ? (
              <span className="text-[10px] text-muted-foreground">
                drafted {formatDayTime(row.draft_generated_at)}
              </span>
            ) : null
          }
        >
          {row.draft_response ? (
            <>
              <p className="whitespace-pre-wrap rounded-lg border border-primary/25 bg-primary/5 p-3 text-xs leading-relaxed text-foreground">
                {row.draft_response}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => void copyDraft()}
                >
                  <Copy className="mr-1.5 h-3 w-3" />
                  Copy draft
                </Button>
              </div>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              No draft yet. Drafting is what turns this from a to-do into a
              two-minute job — it writes from your angle&apos;s evidence, never
              from thin air.
            </p>
          )}
        </PanelSection>

        <PanelSection title="Where this journalist lives">
          <div className="flex flex-wrap items-center gap-2">
            <JournalistRef row={row} />
            <EntityRef
              token="crm_outreach_list"
              id={FIXTURE_MEDIA_LIST_ID}
              name="Press · media list"
              openInNewTab
              className="text-xs"
            />
            <a
              href="/crm/outreach-lists"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary hover:underline"
            >
              <Megaphone className="h-3 w-3" />
              All media lists
            </a>
          </div>
        </PanelSection>
      </div>

      <footer className="shrink-0 border-t border-border/60 bg-card/60 px-4 py-2.5">
        {closed && isLiveRequest(row) ? (
          <p className="mb-2 rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            This query closed {deadline.label.replace("Closed ", "")} ago and can
            no longer be answered. Mark it so it stops competing for your
            attention.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          {isLiveRequest(row) && !closed ? (
            <Button
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => onSetStatus("submitted")}
              disabled={!row.draft_response}
              title={
                row.draft_response
                  ? undefined
                  : "Nothing to submit yet — there is no draft."
              }
            >
              <Send className="mr-1.5 h-3 w-3" />
              Mark submitted
            </Button>
          ) : null}
          {row.status === "submitted" ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => onSetStatus("won")}
            >
              They used it
            </Button>
          ) : null}
          {isLiveRequest(row) ? (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-[11px] text-muted-foreground"
              onClick={() => onSetStatus(closed ? "expired" : "passed")}
            >
              {closed ? "Mark expired" : "Pass on it"}
            </Button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

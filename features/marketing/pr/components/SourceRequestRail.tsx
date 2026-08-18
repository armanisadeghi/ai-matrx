"use client";

/**
 * Source Requests — journalist queries that expire in HOURS.
 *
 * This is the only genuinely time-critical thing in the product, so it gets the
 * treatment a deadline-driven inbox gets (Front / Superhuman): the queue is
 * ordered by what closes first and by nothing else, the countdown is on every
 * row at a fixed width, and anything inside six hours escalates the whole panel
 * — a bar at the top that names the outlet and the hours left, visible whether
 * or not the user has scrolled.
 *
 * BACKEND FACT 2 is enforced here. `seo.source_request.status` reaches
 * `expired` and `passed`, and those rows carry `draft_response = null` and no
 * subject line — the query cannot be answered any more. So no send or submit
 * affordance is rendered for them (nor for `submitted` / `won`, which are also
 * done). What is rendered instead is WHAT HAPPENED, and the original query door
 * (`external_url`) stays open, because on a closed request that link is the only
 * thing left worth opening.
 *
 * The countdown is driven by ONE clock passed down from the workspace, and the
 * chip reserves its widest width, so a row can never resize as time passes.
 */

import Link from "next/link";

import { pressRoomHref } from "@/features/marketing/pr/routes";
import { useEffect, useMemo, useRef } from "react";
import {
  AlarmClock,
  ArrowUpRight,
  ChevronDown,
  ExternalLink,
  Newspaper,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { cn } from "@/lib/utils";
import {
  JournalistRef,
  MEDIA_LISTS_HREF,
} from "@/features/marketing/pr/components/JournalistRef";
import {
  deadlineState,
  rankRequests,
  type DeadlineUrgency,
} from "@/features/marketing/pr/scoring";
import {
  CLOSED_REQUEST_STORY,
  PLATFORM_LABELS,
  REQUEST_STATUS_LABELS,
  humanize,
  isAnswerable,
  readRequirements,
  type SourceRequest,
  type StoryAngle,
} from "@/features/marketing/pr/types";

const URGENCY_CHIP: Record<DeadlineUrgency, string> = {
  critical:
    "border-destructive/50 bg-destructive/10 text-destructive font-semibold",
  urgent:
    "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold",
  soon: "border-border bg-muted text-foreground",
  later: "border-border bg-muted text-muted-foreground",
  past: "border-border bg-muted text-muted-foreground line-through",
};

export function DeadlineChip({
  deadlineAt,
  now,
  className,
}: {
  deadlineAt: string | null;
  now: number;
  className?: string;
}) {
  const state = deadlineState(deadlineAt, now);
  return (
    <span
      title={
        deadlineAt
          ? `${state.label} — closes ${new Date(deadlineAt).toLocaleString()}`
          : state.label
      }
      className={cn(
        // Fixed width: the widest form ("14d 22h") reserves its space so a
        // ticking countdown never reflows the row beside it.
        "inline-flex w-[74px] shrink-0 items-center justify-center gap-1 rounded-md border px-1 py-0.5 text-[11px] tabular-nums",
        URGENCY_CHIP[state.urgency],
        className,
      )}
    >
      {state.urgency === "critical" ? (
        <AlarmClock
          className="h-3 w-3 shrink-0 animate-pulse motion-reduce:animate-none"
          aria-hidden
        />
      ) : null}
      {state.short}
    </span>
  );
}

function MatchScore({ score }: { score: number }) {
  const tone =
    score >= 85
      ? "text-emerald-600 dark:text-emerald-400"
      : score >= 65
        ? "text-foreground"
        : "text-muted-foreground";
  return (
    <span
      className={cn(
        "w-8 shrink-0 text-right text-xs font-semibold tabular-nums",
        tone,
      )}
      title={`${score}% match against this business`}
    >
      {score}
    </span>
  );
}

function RequestRow({
  request,
  now,
  expanded,
  onToggle,
  angle,
  onRule,
}: {
  request: SourceRequest;
  now: number;
  expanded: boolean;
  onToggle: () => void;
  angle: StoryAngle | null;
  onRule: (status: string) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const state = deadlineState(request.deadline_at, now);
  const requirements = readRequirements(request.requirements);
  const answerable = isAnswerable(request);
  const closed = state.urgency === "past";
  const statusLabel =
    REQUEST_STATUS_LABELS[request.status] ?? humanize(request.status);

  useEffect(() => {
    if (expanded) {
      ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [expanded]);

  return (
    <li
      ref={ref}
      data-request-id={request.id}
      className={cn(
        "min-w-0 border-b border-border last:border-b-0",
        expanded && "bg-muted/30",
        state.urgency === "critical" && answerable && "bg-destructive/[0.04]",
        !answerable && "opacity-80",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full min-w-0 items-start gap-2 px-2.5 py-2 text-left transition-colors hover:bg-muted/50"
      >
        <DeadlineChip
          deadlineAt={request.deadline_at}
          now={now}
          className="mt-0.5"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium leading-4 text-foreground">
            {request.query_title}
          </span>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
            <span className="shrink-0 font-medium text-foreground">
              {request.outlet ?? "Unknown outlet"}
            </span>
            {request.journalist_name ? (
              <span className="shrink-0">· {request.journalist_name}</span>
            ) : null}
            <span className="shrink-0">
              · {PLATFORM_LABELS[request.platform] ?? humanize(request.platform)}
            </span>
            {!answerable ? (
              <span className="shrink-0 font-medium text-muted-foreground">
                · {statusLabel}
              </span>
            ) : null}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
          <MatchScore score={request.match_score} />
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </span>
      </button>

      {expanded ? (
        <div className="space-y-2.5 border-t border-border px-2.5 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              {statusLabel}
            </Badge>
            {request.beat ? (
              <span className="text-[11px] text-muted-foreground">
                {request.beat}
              </span>
            ) : null}
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
              {state.label}
            </span>
          </div>

          {/* WHAT HAPPENED, for anything that can no longer be answered. */}
          {!answerable ? (
            <p className="rounded-md border border-border bg-muted/50 px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
              {CLOSED_REQUEST_STORY[request.status] ??
                "This query is closed and can no longer be answered."}
            </p>
          ) : closed ? (
            <p className="rounded-md border border-border bg-muted/50 px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
              The deadline passed {state.label.replace("Closed ", "").replace(" ago", "")}{" "}
              ago and nothing was sent. Mark it expired so it stops competing for
              your attention.
            </p>
          ) : null}

          {/* THE DOOR LAW: the journalist is a crm.party when one was resolved.
              When there is only a name, it renders as an unresolved reference
              carrying its own fix — never a bare span. */}
          <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
            <Newspaper
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <JournalistRef
              name={request.journalist_name}
              partyId={request.party_id}
              emptyLabel="No journalist named on this query"
            />
            <Button
              asChild
              size="sm"
              variant="outline"
              className="ml-auto h-6 shrink-0 text-[10px]"
            >
              <a href={MEDIA_LISTS_HREF} target="_blank" rel="noreferrer">
                Media lists
                <ArrowUpRight className="ml-1 h-3 w-3" />
              </a>
            </Button>
          </div>

          {request.query_body ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                What they asked for
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-foreground">
                {request.query_body}
              </p>
            </div>
          ) : null}

          {requirements.items.length > 0 ? (
            <ul className="flex flex-wrap gap-1">
              {requirements.items.map((requirement, index) => (
                <li
                  key={`req-${index}`}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {requirement.label}
                </li>
              ))}
            </ul>
          ) : null}

          {request.match_reason ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                Why you, {request.match_score}% match
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-foreground">
                {request.match_reason}
              </p>
            </div>
          ) : null}

          {angle ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Answers your angle:{" "}
                    <Link
                      href={pressRoomHref({ focus: { kind: "angle", id: angle.id } })}
                      className="font-medium text-foreground underline decoration-dotted underline-offset-2 hover:text-primary"
                    >
                      {angle.headline}
                    </Link>
                  </p>
                ) : null}

          {/* A draft, and a send affordance, ONLY where one can honestly exist. */}
          {request.draft_response ? (
            <div className="rounded-md border border-border bg-background">
              <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {answerable
                    ? "Drafted response — yours to edit and send"
                    : "The response on file"}
                </p>
                <CopyButtons
                  size="xs"
                  label={`Draft for ${request.outlet ?? "this request"}`}
                  human={() => request.draft_response ?? ""}
                  agent={() => ({
                    kind: "press-source-request-draft",
                    location: "AI Matrx — Marketing — Press Room",
                    description: `The drafted response to ${request.outlet ?? "a journalist"}'s query "${request.query_title}".`,
                    data: {
                      outlet: request.outlet,
                      journalist: request.journalist_name,
                      query: request.query_body,
                      draft: request.draft_response,
                      deadline_at: request.deadline_at,
                      status: request.status,
                    },
                    summary: request.draft_response ?? "",
                  })}
                />
              </div>
              <p className="whitespace-pre-wrap px-2 py-1.5 text-[11px] leading-4 text-foreground">
                {request.draft_response}
              </p>
            </div>
          ) : answerable ? (
            <p className="rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
              No draft yet. Drafting runs once the request is matched to an angle
              — this one is {statusLabel.toLowerCase()}.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5">
            {answerable && !closed ? (
              <Button
                size="sm"
                className="h-7 text-[11px]"
                disabled={!request.draft_response}
                title={
                  request.draft_response
                    ? undefined
                    : "Nothing to submit yet — there is no draft."
                }
                onClick={() => onRule("submitted")}
              >
                Mark submitted
              </Button>
            ) : null}
            {request.status === "submitted" ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => onRule("won")}
              >
                They used it
              </Button>
            ) : null}
            {answerable ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px] text-muted-foreground"
                onClick={() => onRule(closed ? "expired" : "passed")}
              >
                {closed ? "Mark expired" : "Pass on it"}
              </Button>
            ) : null}

            {/* The original query stays reachable whatever the status — on a
                closed request it is the only door left. */}
            {request.external_url ? (
              <a
                href={request.external_url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                Open the original query on{" "}
                {PLATFORM_LABELS[request.platform] ?? humanize(request.platform)}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function SourceRequestRail({
  requests,
  angles,
  now,
  selectedId,
  onSelect,
  onRuleRequest,
}: {
  requests: readonly SourceRequest[];
  angles: readonly StoryAngle[];
  now: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRuleRequest: (requestId: string, status: string) => void;
}) {
  const ordered = useMemo(() => rankRequests(requests, now), [requests, now]);
  const angleById = useMemo(
    () => new Map(angles.map((angle) => [angle.id, angle])),
    [angles],
  );
  const critical = ordered.filter(
    (request) =>
      isAnswerable(request) &&
      deadlineState(request.deadline_at, now).urgency === "critical",
  );

  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-border bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Journalist requests
        </h2>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {ordered.length}
        </span>
      </div>

      {critical.length > 0 ? (
        <div className="border-b border-destructive/40 bg-destructive/10 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-destructive">
            <AlarmClock
              className="h-3.5 w-3.5 animate-pulse motion-reduce:animate-none"
              aria-hidden
            />
            {critical.length === 1
              ? "1 request closes within 6 hours"
              : `${critical.length} requests close within 6 hours`}
          </p>
          <ul className="mt-1 space-y-0.5">
            {critical.map((request) => (
              <li key={request.id}>
                <button
                  type="button"
                  onClick={() => onSelect(request.id)}
                  className="flex w-full min-w-0 items-center gap-1.5 text-left text-[11px] text-foreground hover:underline"
                >
                  <span className="shrink-0 font-semibold tabular-nums">
                    {deadlineState(request.deadline_at, now).short}
                  </span>
                  <span className="min-w-0 truncate">
                    {request.outlet ?? "Unknown outlet"} — {request.query_title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {ordered.length === 0 ? (
        <div className="px-3 py-8 text-center">
          <p className="text-xs font-medium text-foreground">
            No open journalist requests
          </p>
          <p className="mx-auto mt-1 max-w-xs text-[11px] leading-4 text-muted-foreground">
            HARO, Qwoted, Featured and SourceBottle queries land here as they are
            published and matched against your angles. Nothing is waiting on you
            right now.
          </p>
        </div>
      ) : (
        <ul className="min-w-0 overflow-y-auto scrollbar-thin lg:max-h-[calc(100vh-18rem)]">
          {ordered.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              now={now}
              expanded={selectedId === request.id}
              onToggle={() =>
                onSelect(selectedId === request.id ? null : request.id)
              }
              onRule={(status) => onRuleRequest(request.id, status)}
              angle={
                request.story_angle_id
                  ? (angleById.get(request.story_angle_id) ?? null)
                  : null
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

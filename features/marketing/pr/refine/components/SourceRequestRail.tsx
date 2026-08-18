"use client";

/**
 * Source Requests — journalist queries that expire in HOURS.
 *
 * This is the only genuinely time-critical thing in the product, so it gets
 * the treatment a deadline-driven inbox gets (Front / Superhuman): the queue is
 * ordered by what closes first and by nothing else, the countdown is on every
 * row at a fixed width, and anything inside six hours escalates the whole
 * panel — a bar at the top that names the outlet and the hours left, which is
 * visible whether or not the user has scrolled the list.
 *
 * The countdown is driven by ONE clock passed down from the workspace, and the
 * chip reserves its widest width, so a row can never resize as time passes.
 */

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
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { cn } from "@/lib/utils";
import {
  deadlineState,
  rankRequests,
  type DeadlineUrgency,
} from "@/features/marketing/pr/refine/scoring";
import {
  PLATFORM_LABELS,
  REQUEST_STATUS_LABELS,
  humanize,
  jsonRecords,
  jsonText,
  type SourceRequest,
  type StoryAngle,
} from "@/features/marketing/pr/refine/types";

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
        <AlarmClock className="h-3 w-3 shrink-0 animate-pulse" aria-hidden />
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
      className={cn("w-8 shrink-0 text-right text-xs font-semibold tabular-nums", tone)}
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
}: {
  request: SourceRequest;
  now: number;
  expanded: boolean;
  onToggle: () => void;
  angle: StoryAngle | null;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const state = deadlineState(request.deadline_at, now);
  const requirements = jsonRecords(request.requirements);

  useEffect(() => {
    if (expanded) {
      ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [expanded]);

  return (
    <li
      ref={ref}
      className={cn(
        "min-w-0 border-b border-border last:border-b-0",
        expanded && "bg-muted/30",
        state.urgency === "critical" && "bg-destructive/[0.04]",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full min-w-0 items-start gap-2 px-2.5 py-2 text-left transition-colors hover:bg-muted/50"
      >
        <DeadlineChip deadlineAt={request.deadline_at} now={now} className="mt-0.5" />
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
              {REQUEST_STATUS_LABELS[request.status] ?? humanize(request.status)}
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

          {/* THE DOOR LAW: the journalist is a crm.party — open them, in a new
              tab, without losing the queue. When the row has no party_id yet we
              say so instead of rendering a door that goes nowhere. */}
          <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
            <Newspaper className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {request.party_id ? (
              <EntityRef
                token="party"
                id={request.party_id}
                name={request.journalist_name ?? "This journalist"}
                openInNewTab
                className="min-w-0"
              />
            ) : (
              <span className="min-w-0 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">
                  {request.journalist_name ?? "This journalist"}
                </span>{" "}
                is not in your CRM yet — no contact record to open.
              </span>
            )}
            <Button
              asChild
              size="sm"
              variant="outline"
              className="ml-auto h-6 shrink-0 text-[10px]"
            >
              <a href="/crm/outreach-lists" target="_blank" rel="noreferrer">
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

          {requirements.length > 0 ? (
            <ul className="flex flex-wrap gap-1">
              {requirements.map((requirement, index) => (
                <li
                  key={`req-${index}`}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {jsonText(requirement, "label", "text", "requirement") ??
                    "Requirement"}
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
            <p className="text-[11px] text-muted-foreground">
              Answers your angle:{" "}
              <span className="font-medium text-foreground">
                {angle.headline}
              </span>
            </p>
          ) : null}

          {request.draft_response ? (
            <div className="rounded-md border border-border bg-background">
              <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Drafted response — yours to edit and send
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
                    },
                    summary: request.draft_response ?? "",
                  })}
                />
              </div>
              <p className="whitespace-pre-wrap px-2 py-1.5 text-[11px] leading-4 text-foreground">
                {request.draft_response}
              </p>
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground">
              No draft yet. Drafting runs when the request is matched to an
              angle — this one is {REQUEST_STATUS_LABELS[request.status] ?? request.status}.
            </p>
          )}

          {request.external_url ? (
            <a
              href={request.external_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              Open the original query on{" "}
              {PLATFORM_LABELS[request.platform] ?? humanize(request.platform)}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
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
}: {
  requests: readonly SourceRequest[];
  angles: readonly StoryAngle[];
  now: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const ordered = useMemo(() => rankRequests(requests, now), [requests, now]);
  const angleById = useMemo(
    () => new Map(angles.map((angle) => [angle.id, angle])),
    [angles],
  );
  const critical = ordered.filter(
    (request) => deadlineState(request.deadline_at, now).urgency === "critical",
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
            <AlarmClock className="h-3.5 w-3.5 animate-pulse" aria-hidden />
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
            HARO, Qwoted, Featured and SourceBottle queries land here as they
            are published and matched against your angles. Nothing is waiting on
            you right now.
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

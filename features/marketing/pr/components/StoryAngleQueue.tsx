"use client";

/**
 * Story Angles — the hero. A ranked work queue in the Linear tradition: one
 * dense row per angle, the decision-bearing signals on the row itself, and the
 * whole record one click away IN PLACE rather than behind a side panel the
 * user has to find and then close.
 *
 * Deliberate choices:
 *  • The filter set is a visible segmented row, not a dropdown. A press queue
 *    where "needs you" is hidden behind a menu is a queue where the expert
 *    never answers the question that unblocks three angles.
 *  • The DEFAULT view is live work, and live work is mostly angles with proof
 *    still to gather (backend fact 1). That is the product working, not a
 *    backlog — the copy and the colour say so.
 *  • Expansion happens inside the row and grows DOWNWARD only, so nothing above
 *    the click point moves.
 *  • Every row keeps its footprint whether expanded or not — fixed-width score
 *    comb, fixed-width action chip, tabular numbers.
 *  • ↑/↓ walk the queue and Escape closes the open row, so a queue of thirty is
 *    workable without the mouse.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  CircleDot,
  Clock3,
  FileSearch,
  Link2,
  MessageSquareQuote,
  PauseCircle,
  Send,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/official/SearchInput";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { cn } from "@/lib/utils";
import { formatDateOnly } from "@/features/marketing/components/shared/MarketingUi";
import {
  EvidenceLadder,
  ProofPill,
} from "@/features/marketing/pr/components/EvidenceLadder";
import {
  ScoreBreakdown,
  ScoreComb,
} from "@/features/marketing/pr/components/ScoreComb";
import { readLadder } from "@/features/marketing/pr/ladder";
import {
  QUEUE_SORTS,
  deadlineState,
  isQuickWin,
  pitchReadiness,
  rankRationale,
  sortAngles,
  type DeadlineState,
  type QueueSort,
} from "@/features/marketing/pr/scoring";
import {
  ACTION_COPY,
  ANGLE_STATUS_LABELS,
  ANGLE_TYPE_LABELS,
  ENDOWMENT_COPY,
  OUTLET_KIND_LABELS,
  humanize,
  readFacts,
  type SourceRequest,
  type StoryAngle,
} from "@/features/marketing/pr/types";

// ─── Views ──────────────────────────────────────────────────────────────────

export interface AngleView {
  id: string;
  label: string;
  /** One line of plain English — this is a novice's product. */
  hint: string;
  matches: (angle: StoryAngle) => boolean;
}

export const ANGLE_VIEWS: readonly AngleView[] = [
  {
    id: "live",
    label: "Live work",
    hint: "Everything in play. Most of it is building proof — that is the product working, not a backlog.",
    matches: (angle) =>
      ["proposed", "accepted", "developing"].includes(angle.status) &&
      angle.recommended_action !== "park",
  },
  {
    id: "ready",
    label: "Ready to pitch",
    hint: "Nothing outstanding: no missing evidence, no unmet proof, no contradiction. A journalist could be emailed today.",
    matches: (angle) => angle.recommended_action === "pitch_now",
  },
  {
    id: "proof",
    label: "Building proof",
    hint: "The normal state of a live angle: the story is real and the evidence is being assembled.",
    matches: (angle) => angle.recommended_action === "develop_evidence",
  },
  {
    id: "quick",
    label: "One thing away",
    hint: "A single gap between these and pitchable — the cheapest work on the page.",
    matches: isQuickWin,
  },
  {
    id: "you",
    label: "Needs you",
    hint: "Blocked on your expert judgment — nobody else can answer these.",
    matches: (angle) =>
      angle.recommended_action === "needs_expert_input" ||
      angle.requires_human_review,
  },
  {
    id: "all",
    label: "All angles",
    hint: "Including parked and dismissed.",
    matches: () => true,
  },
];

const ACTION_ICON = {
  pitch_now: Send,
  develop_evidence: FileSearch,
  hold_for_timing: Clock3,
  needs_expert_input: MessageSquareQuote,
  park: PauseCircle,
} as const;

const ACTION_TONE = {
  go: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  build: "border-primary/40 bg-primary/10 text-primary",
  wait: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ask: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  off: "border-border bg-muted text-muted-foreground",
} as const;

function ActionChip({ action }: { action: string }) {
  const copy = ACTION_COPY[action];
  const Icon = ACTION_ICON[action as keyof typeof ACTION_ICON] ?? CircleDot;
  return (
    <span
      title={copy?.meaning}
      className={cn(
        "inline-flex w-[124px] shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px] font-medium",
        ACTION_TONE[copy?.tone ?? "off"],
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{copy?.label ?? humanize(action)}</span>
    </span>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────────

function AngleRow({
  angle,
  rank,
  expanded,
  onToggle,
  linkedRequests,
  onOpenRequest,
  onRule,
  onHoldEvidence,
  shareHref,
  rationale,
}: {
  angle: StoryAngle;
  rank: number;
  expanded: boolean;
  onToggle: () => void;
  linkedRequests: readonly SourceRequest[];
  onOpenRequest: (requestId: string) => void;
  onRule: (status: string) => void;
  onHoldEvidence: (proofKey: string) => void;
  /** A real URL for this row — shareable, reload-safe, new-tab-able. */
  shareHref: string;
  /** Why this row is at this position. Never rank without saying why. */
  rationale: string[];
}) {
  const ref = useRef<HTMLLIElement>(null);
  const endowment = ENDOWMENT_COPY[angle.endowment];
  const facts = readFacts(angle.facts);
  const actionCopy = ACTION_COPY[angle.recommended_action];

  useEffect(() => {
    if (expanded) {
      ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [expanded]);

  return (
    <li
      ref={ref}
      data-angle-id={angle.id}
      className={cn(
        "min-w-0 border-b border-border last:border-b-0",
        expanded && "bg-muted/30",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full min-w-0 items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
      >
        <span
          className="w-5 shrink-0 pt-0.5 text-right text-[11px] font-semibold tabular-nums text-muted-foreground underline decoration-dotted decoration-muted-foreground/40 underline-offset-2"
          title={`Why #${rank}?\n\n${rationale.join("\n")}`}
        >
          {rank}
        </span>
        <ActionChip action={angle.recommended_action} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium leading-5 text-foreground">
            {angle.headline}
          </span>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {endowment ? (
              <span
                title={endowment.blurb}
                className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground"
              >
                {endowment.label}
              </span>
            ) : null}
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {ANGLE_TYPE_LABELS[angle.angle_type] ?? humanize(angle.angle_type)}
            </span>
            {angle.target_beat ? (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                · {angle.target_beat}
              </span>
            ) : null}
            <ProofPill angle={angle} className="shrink-0" />
            {linkedRequests.length > 0 ? (
              <span className="shrink-0 text-[11px] font-medium text-primary">
                · {linkedRequests.length} journalist request
                {linkedRequests.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 pt-0.5">
          <Badge
            variant="outline"
            className="hidden shrink-0 text-[10px] sm:inline-flex"
          >
            {ANGLE_STATUS_LABELS[angle.status] ?? humanize(angle.status)}
          </Badge>
          <ScoreComb angle={angle} />
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </span>
      </button>

      {expanded ? (
        <div className="grid gap-4 border-t border-border px-3 py-3 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                What the story is
              </p>
              <p className="mt-1 text-xs leading-5 text-foreground">
                {angle.summary}
              </p>
            </div>

            {angle.why_now ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden />
                  Why now
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-foreground">
                  {angle.why_now}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                No timeliness hook recorded. Angles without one are harder to
                place — a reporter&apos;s first question is &ldquo;why this
                week?&rdquo;
              </p>
            )}

            {facts.items.length > 0 ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Facts this rests on
                </p>
                <ul className="mt-1 space-y-0.5">
                  {facts.items.map((fact, index) => (
                    <li
                      key={`fact-${index}`}
                      className="flex gap-1.5 text-[11px] leading-4 text-foreground"
                    >
                      <span className="text-muted-foreground">•</span>
                      {fact.statement}
                    </li>
                  ))}
                </ul>
                {facts.malformed > 0 ? (
                  <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
                    {facts.malformed} fact{facts.malformed === 1 ? "" : "s"} could
                    not be read and {facts.malformed === 1 ? "is" : "are"} not
                    listed.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Proof a journalist will ask for
              </p>
              <div className="mt-1.5">
                <EvidenceLadder angle={angle} onHoldEvidence={onHoldEvidence} />
              </div>
            </div>

            {linkedRequests.length > 0 ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Journalists already asking for this
                </p>
                <ul className="mt-1 space-y-1">
                  {linkedRequests.map((request) => (
                    <li key={request.id}>
                      <button
                        type="button"
                        onClick={() => onOpenRequest(request.id)}
                        className="flex w-full min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left transition-colors hover:border-primary/50"
                      >
                        <Target
                          className="h-3.5 w-3.5 shrink-0 text-primary"
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                          {request.outlet ?? "Unknown outlet"} —{" "}
                          {request.query_title}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          Open
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="min-w-0 space-y-3 lg:border-l lg:border-border lg:pl-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Recommendation
              </p>
              <p className="mt-1 text-[11px] leading-4 text-foreground">
                <span className="font-semibold">
                  {actionCopy?.label ?? humanize(angle.recommended_action)}.
                </span>{" "}
                {angle.action_reason ??
                  "No reasoning was recorded for this recommendation."}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {angle.status !== "accepted" && angle.status !== "developing" ? (
                  <Button
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => onRule("accepted")}
                  >
                    Accept this angle
                  </Button>
                ) : null}
                {angle.status !== "pitched" && angle.status !== "landed" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => onRule("pitched")}
                  >
                    Mark pitched
                  </Button>
                ) : null}
                {angle.status !== "dismissed" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px] text-muted-foreground"
                    onClick={() => onRule("dismissed")}
                  >
                    Dismiss
                  </Button>
                ) : null}
                <CopyButtons
                  size="icon"
                  label={`Angle: ${angle.headline}`}
                  human={() => angleAsText(angle)}
                  agent={() => ({
                    kind: "press-story-angle",
                    location: "AI Matrx — Marketing — Press Room",
                    description: `A ranked press angle for this business: "${angle.headline}".`,
                    data: angle,
                    summary: angleAsText(angle),
                    attributes: {
                      angle_key: angle.angle_key,
                      status: angle.status,
                    },
                  })}
                  json={() => angle}
                />
              </div>
              <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
                A ruling applies across this whole page immediately. It is held
                in this session only — there is no write path to{" "}
                <span className="font-mono">seo.story_angle</span> from here yet,
                and the status bar at the top says so while any are outstanding.
              </p>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Why it is ranked #{rank}
              </p>
              <ul className="mt-1 space-y-0.5">
                {rationale.map((line, index) => (
                  <li
                    key={`rationale-${index}`}
                    className="flex gap-1.5 text-[11px] leading-4 text-muted-foreground"
                  >
                    <span aria-hidden>·</span>
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Signals
              </p>
              <div className="mt-1.5">
                <ScoreBreakdown angle={angle} />
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Readiness {pitchReadiness(angle)} · Priority {angle.priority}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
              <div className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Endowment
                </dt>
                <dd className="text-foreground">
                  {endowment?.label ?? humanize(angle.endowment)}
                  {endowment ? (
                    <span className="block text-[10px] text-muted-foreground">
                      {endowment.blurb}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Target outlet
                </dt>
                <dd className="text-foreground">
                  {angle.target_outlet_kind
                    ? (OUTLET_KIND_LABELS[angle.target_outlet_kind] ??
                      humanize(angle.target_outlet_kind))
                    : "Any"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Analysed
                </dt>
                <dd className="text-foreground">
                  {formatDateOnly(angle.analyzed_at)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  This site
                </dt>
                <dd className="min-w-0">
                  <EntityRef
                    token="web_site"
                    id={angle.site_id}
                    name="Open site"
                    showIcon={false}
                  />
                </dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  This angle
                </dt>
                <dd className="min-w-0">
                  {/* `seo.story_angle` has no entry in the shared entity
                      registry, and that file is not ours to edit — so the door
                      is an EXPLICIT href onto this same page, focused on this
                      row. Shareable, bookmarkable, reload-safe. */}
                  <EntityRef
                    token="seo_story_angle"
                    id={angle.id}
                    href={shareHref}
                    name="Link to this angle"
                    showIcon={false}
                    alwaysShowActions
                  >
                    <span className="inline-flex items-center gap-1">
                      <Link2 className="h-3 w-3" aria-hidden />
                      Link to this angle
                    </span>
                  </EntityRef>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function angleAsText(angle: StoryAngle): string {
  const read = readLadder(angle);
  const gaps = read.rungs
    .filter((rung) => rung.missing)
    .map((rung) => `${rung.label} — ${rung.missing?.how_to_get ?? ""}`.trim());
  return [
    `HEADLINE: ${angle.headline}`,
    `Angle type: ${ANGLE_TYPE_LABELS[angle.angle_type] ?? angle.angle_type}`,
    `Endowment: ${ENDOWMENT_COPY[angle.endowment]?.label ?? angle.endowment}`,
    `Status: ${ANGLE_STATUS_LABELS[angle.status] ?? angle.status}`,
    `Recommendation: ${ACTION_COPY[angle.recommended_action]?.label ?? angle.recommended_action}${
      angle.action_reason ? ` — ${angle.action_reason}` : ""
    }`,
    "",
    angle.summary,
    "",
    angle.why_now ? `WHY NOW: ${angle.why_now}` : null,
    `Pitch readiness ${pitchReadiness(angle)}/100 (newsworthy ${angle.newsworthiness}, proven ${angle.evidence_quality}, timely ${angle.timeliness}, confident ${angle.confidence}, priority ${angle.priority})`,
    `Proof: ${read.held} of ${read.total} in hand.`,
    gaps.length ? `STILL NEEDED:\n- ${gaps.join("\n- ")}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

// ─── Queue ──────────────────────────────────────────────────────────────────

export function StoryAngleQueue({
  angles,
  requests,
  onOpenRequest,
  viewId,
  onViewChange,
  sort,
  sortIsDefault,
  onSortChange,
  now,
  expandedAngleId,
  onExpandAngle,
  onRuleAngle,
  onHoldEvidence,
  angleHref,
}: {
  angles: readonly StoryAngle[];
  requests: readonly SourceRequest[];
  onOpenRequest: (requestId: string) => void;
  /**
   * The active filter is CONTROLLED by the workspace (and lives in the URL) so
   * the summary tiles above are real doors into this queue rather than
   * decoration that reports a number and leaves the user to find those rows.
   */
  viewId: string;
  onViewChange: (viewId: string) => void;
  /** Resolved order — an explicit `?sort=`, or this view's own default. */
  sort: QueueSort;
  /** True when the view's default is in force, so the UI can say which it is. */
  sortIsDefault: boolean;
  onSortChange: (sort: QueueSort) => void;
  /** One page clock, for the "a window is closing on this" rationale line. */
  now: number;
  /**
   * Which angle is open, owned by the workspace so the pipeline board and the
   * coverage log can open one from outside, and so it survives a reload.
   */
  expandedAngleId: string | null;
  onExpandAngle: (angleId: string | null) => void;
  onRuleAngle: (angleId: string, status: string) => void;
  onHoldEvidence: (angleId: string, proofKey: string) => void;
  angleHref: (angleId: string) => string;
}) {
  const [search, setSearch] = useState("");

  const view = ANGLE_VIEWS.find((entry) => entry.id === viewId) ?? ANGLE_VIEWS[0];

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of ANGLE_VIEWS) {
      map[entry.id] = angles.filter((angle) => entry.matches(angle)).length;
    }
    return map;
  }, [angles]);

  const requestsByAngle = useMemo(() => {
    const map = new Map<string, SourceRequest[]>();
    for (const request of requests) {
      if (!request.story_angle_id) continue;
      const list = map.get(request.story_angle_id) ?? [];
      list.push(request);
      map.set(request.story_angle_id, list);
    }
    return map;
  }, [requests]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = angles.filter((angle) => {
      // The open angle always survives the filter. A door from the pipeline or
      // the coverage log that lands on a row the current filter hides is a dead
      // end wearing a link's clothing.
      if (angle.id === expandedAngleId) return true;
      if (!view.matches(angle)) return false;
      if (!term) return true;
      return (
        angle.headline.toLowerCase().includes(term) ||
        angle.summary.toLowerCase().includes(term) ||
        (angle.target_beat ?? "").toLowerCase().includes(term)
      );
    });
    return sortAngles(filtered, sort);
  }, [angles, search, view, expandedAngleId, sort]);

  /** The soonest live journalist window pointing at each angle. */
  const soonestByAngle = useMemo(() => {
    const map = new Map<string, DeadlineState>();
    for (const [angleId, list] of requestsByAngle.entries()) {
      let soonest: DeadlineState | null = null;
      for (const request of list) {
        const state = deadlineState(request.deadline_at, now);
        if (state.urgency === "past") continue;
        if (!soonest || state.minutes < soonest.minutes) soonest = state;
      }
      if (soonest) map.set(angleId, soonest);
    }
    return map;
  }, [requestsByAngle, now]);

  /**
   * ↑/↓ walk the queue, Escape closes the open row. Suppressed while the user
   * is typing so the search field keeps its own arrow keys.
   */
  const move = useCallback(
    (step: 1 | -1) => {
      if (rows.length === 0) return;
      const index = expandedAngleId
        ? rows.findIndex((angle) => angle.id === expandedAngleId)
        : -1;
      const next =
        index === -1
          ? step === 1
            ? 0
            : rows.length - 1
          : Math.min(Math.max(index + step, 0), rows.length - 1);
      onExpandAngle(rows[next].id);
    },
    [rows, expandedAngleId, onExpandAngle],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "Escape") {
        if (typing) {
          (target as HTMLInputElement).blur();
          return;
        }
        if (expandedAngleId) {
          event.preventDefault();
          onExpandAngle(null);
        }
        return;
      }
      if (typing) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move, expandedAngleId, onExpandAngle]);

  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-border bg-card">
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Story angles
        </h2>
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {ANGLE_VIEWS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              title={entry.hint}
              onClick={() => onViewChange(entry.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                entry.id === viewId
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {entry.label}
              <span className="tabular-nums opacity-70">
                {counts[entry.id] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Order
          </span>
          {QUEUE_SORTS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              title={entry.hint}
              onClick={() => onSortChange(entry.id)}
              className={cn(
                "rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors",
                entry.id === sort
                  ? "border-border bg-muted text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {entry.label}
              {entry.id === sort && sortIsDefault ? (
                <span className="ml-1 text-[9px] uppercase tracking-wide text-muted-foreground/80">
                  default here
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <SearchInput
          className="w-full sm:w-56"
          inputClassName="h-7 text-xs"
          placeholder="Search angles…"
          value={search}
          onValueChange={setSearch}
          aria-label="Search story angles"
        />
      </div>

      <p className="flex flex-wrap items-center gap-x-2 border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="min-w-0">{view.hint}</span>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/80">
          ↑ ↓ to walk · Esc to close
        </span>
      </p>

      {rows.length === 0 ? (
        <div className="px-3 py-10 text-center">
          <p className="text-xs font-medium text-foreground">
            {search
              ? "No angles match that search."
              : `Nothing in "${view.label}" right now.`}
          </p>
          <p className="mx-auto mt-1 max-w-md text-[11px] leading-4 text-muted-foreground">
            {search
              ? "Try a broader term, or switch to All angles."
              : viewId === "ready"
                ? "Nothing is fully provable today. That is normal — an angle only reaches “ready” once every proof is in hand, so the work is in Building proof."
                : "That is a real answer, not an error — the other views may still have work waiting."}
          </p>
          {viewId !== "all" ? (
            <Button
              size="sm"
              variant="outline"
              className="mt-3 h-7 text-[11px]"
              onClick={() => {
                onViewChange(viewId === "ready" ? "proof" : "all");
                setSearch("");
              }}
            >
              {viewId === "ready" ? "Show what is building proof" : "Show all angles"}
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="min-w-0">
          {rows.map((angle, index) => (
            <AngleRow
              key={angle.id}
              angle={angle}
              rank={index + 1}
              expanded={expandedAngleId === angle.id}
              onToggle={() =>
                onExpandAngle(expandedAngleId === angle.id ? null : angle.id)
              }
              linkedRequests={requestsByAngle.get(angle.id) ?? []}
              onOpenRequest={onOpenRequest}
              onRule={(status) => onRuleAngle(angle.id, status)}
              onHoldEvidence={(key) => onHoldEvidence(angle.id, key)}
              shareHref={angleHref(angle.id)}
              rationale={rankRationale(angle, {
                sort,
                linkedRequests: (requestsByAngle.get(angle.id) ?? []).length,
                soonestDeadline: soonestByAngle.get(angle.id) ?? null,
              })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

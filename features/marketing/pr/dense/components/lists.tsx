"use client";

/**
 * The four work queues.
 *
 * Modelled on Linear's issue list for the ranked-queue pattern: a fixed-height
 * row, one strong first-glance signal on the left, the title carrying the row,
 * and everything else compressed to the right edge where the eye only goes on
 * the second pass. Rows are ~40px, two lines, and every row is a single
 * clickable region with the interactive doors stopping propagation.
 */

import * as React from "react";
import {
  CircleDot,
  ExternalLink,
  FileText,
  Link2,
  Send,
  Newspaper,
  Trophy,
  UserRound,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { formatDateOnly } from "@/features/marketing/components/shared/MarketingUi";
import {
  ACTION_LABEL,
  ANGLE_TYPE_LABEL,
  buildEvidenceLedger,
  coverageAngleId,
  ENDOWMENT_LABEL,
  PIPELINE,
  PLATFORM_LABEL,
  titleCase,
  urgencyOf,
  type CoverageMentionRow,
  type SourceRequestRow,
  type StoryAngleRow,
} from "../types";
import {
  Chip,
  DeadlinePip,
  EmptyPanel,
  EvidenceMeter,
  PriorityMark,
  ScoreComb,
  TONE_CHIP,
  type Tone,
} from "./chrome";

/* ── shared row shell ─────────────────────────────────────────────────────── */

function Row({
  active,
  onSelect,
  children,
  id,
}: {
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <li>
      <div
        role="option"
        aria-selected={active}
        tabIndex={-1}
        data-press-row={id}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          "flex cursor-pointer flex-col gap-0.5 border-l-2 px-2 py-1.5 transition-colors",
          active
            ? "border-l-primary bg-accent"
            : "border-l-transparent hover:bg-accent/50",
        )}
      >
        {children}
      </div>
    </li>
  );
}

function ListShell({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <ul role="listbox" aria-label={label} className="divide-y divide-border">
      {children}
    </ul>
  );
}

const ACTION_TONE: Record<string, Tone> = {
  pitch_now: "good",
  develop_evidence: "accent",
  hold_for_timing: "cool",
  needs_expert_input: "warn",
  park: "muted",
};

const ANGLE_STATUS_TONE: Record<string, Tone> = {
  proposed: "muted",
  accepted: "cool",
  developing: "accent",
  pitched: "warn",
  landed: "good",
  dismissed: "muted",
};

const REQUEST_STATUS_TONE: Record<string, Tone> = {
  new: "cool",
  matched: "accent",
  drafted: "warn",
  submitted: "cool",
  won: "good",
  passed: "muted",
  expired: "muted",
};

/* ── story angles ─────────────────────────────────────────────────────────── */

export function AngleList({
  angles,
  focusedId,
  onSelect,
}: {
  angles: StoryAngleRow[];
  focusedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (angles.length === 0) {
    return (
      <EmptyPanel
        icon={<Newspaper className="h-5 w-5" />}
        title="No angles match these filters"
        hint="Clear a facet on the left, or search for something else. Analysis finds new angles whenever the site's facts change."
      />
    );
  }

  return (
    <ListShell label="Story angles">
      {angles.map((angle) => {
        const ledger = buildEvidenceLedger(angle);
        return (
          <Row
            key={angle.id}
            id={angle.id}
            active={focusedId === angle.id}
            onSelect={() => onSelect(angle.id)}
          >
            <div className="flex items-center gap-2">
              <PriorityMark value={angle.priority} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-foreground">
                {angle.headline}
              </span>
              {angle.requires_human_review ? (
                <CircleDot
                  className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-label="Needs your ruling"
                />
              ) : null}
              <ScoreComb angle={angle} className="shrink-0" />
            </div>
            <div className="flex items-center gap-1.5 pl-9">
              <Chip tone={ACTION_TONE[angle.recommended_action] ?? "muted"}>
                {ACTION_LABEL[angle.recommended_action] ??
                  titleCase(angle.recommended_action)}
              </Chip>
              <Chip tone={ANGLE_STATUS_TONE[angle.status] ?? "muted"}>
                {titleCase(angle.status)}
              </Chip>
              <span
                className="flex shrink-0 items-center gap-1"
                title={
                  ledger.provable
                    ? "Every proof this angle needs is already in hand"
                    : `${ledger.total - ledger.have} more proof${
                        ledger.total - ledger.have === 1 ? "" : "s"
                      } to gather`
                }
              >
                <EvidenceMeter have={ledger.have} total={ledger.total} />
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {ledger.have}/{ledger.total}
                </span>
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {ENDOWMENT_LABEL[angle.endowment] ?? angle.endowment}
                {" · "}
                {ANGLE_TYPE_LABEL[angle.angle_type] ?? angle.angle_type}
                {angle.why_now ? ` · ${angle.why_now}` : ""}
              </span>
            </div>
          </Row>
        );
      })}
    </ListShell>
  );
}

/* ── source requests ──────────────────────────────────────────────────────── */

export function RequestList({
  requests,
  now,
  focusedId,
  onSelect,
}: {
  requests: SourceRequestRow[];
  now: number;
  focusedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (requests.length === 0) {
    return (
      <EmptyPanel
        icon={<FileText className="h-5 w-5" />}
        title="No journalist queries match"
        hint="Queries stream in from HARO, Qwoted, Featured and SourceBottle throughout the day and are scored against your angles automatically."
      />
    );
  }

  return (
    <ListShell label="Source requests">
      {requests.map((request) => {
        const urgency = urgencyOf(request.deadline_at, now);
        return (
          <Row
            key={request.id}
            id={request.id}
            active={focusedId === request.id}
            onSelect={() => onSelect(request.id)}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex h-5 w-7 shrink-0 items-center justify-center rounded border text-[11px] font-semibold tabular-nums",
                  TONE_CHIP[
                    request.match_score >= 70
                      ? "good"
                      : request.match_score >= 45
                        ? "warn"
                        : "muted"
                  ],
                )}
                title={`Match ${request.match_score} of 100 against your angles`}
              >
                {request.match_score}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-foreground">
                {request.query_title}
              </span>
              <DeadlinePip urgency={urgency} />
            </div>
            <div className="flex items-center gap-1.5 pl-9">
              <Chip tone="muted">
                {PLATFORM_LABEL[request.platform] ?? request.platform}
              </Chip>
              <Chip tone={REQUEST_STATUS_TONE[request.status] ?? "muted"}>
                {titleCase(request.status)}
              </Chip>
              {request.draft_response ? (
                <Chip tone="accent" icon={<FileText className="h-2.5 w-2.5" />}>
                  Draft ready
                </Chip>
              ) : null}
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {request.outlet ?? "Outlet not stated"}
                {request.journalist_name ? ` · ${request.journalist_name}` : ""}
                {request.beat ? ` · ${request.beat}` : ""}
              </span>
              {request.party_id && request.journalist_name ? (
                <span
                  className="shrink-0"
                  onClick={(event) => event.stopPropagation()}
                >
                  <EntityRef
                    token="party"
                    id={request.party_id}
                    name={request.journalist_name}
                    openInNewTab
                    className="text-[11px]"
                  />
                </span>
              ) : null}
            </div>
          </Row>
        );
      })}
    </ListShell>
  );
}

/* ── pitch pipeline ───────────────────────────────────────────────────────── */

/**
 * Grouped by stage rather than drawn as a kanban board.
 *
 * A six-column board inside a resizable centre panel gives every column about
 * 90px, which is not a column — it is a stack of truncated words. Stage groups
 * keep every angle's headline legible at any panel width, and the funnel bar
 * above carries the thing the board was for: how many fell out at each step.
 */
export function PipelineView({
  angles,
  requests,
  coverage,
  focusedId,
  onSelect,
}: {
  angles: StoryAngleRow[];
  requests: SourceRequestRow[];
  coverage: CoverageMentionRow[];
  focusedId: string | null;
  onSelect: (id: string) => void;
}) {
  const byStage = PIPELINE.map((stage) => ({
    stage,
    rows: angles.filter((angle) => angle.status === stage.status),
  }));
  const workable = angles.filter((angle) => angle.status !== "dismissed").length;

  if (angles.length === 0) {
    return (
      <EmptyPanel
        icon={<Send className="h-5 w-5" />}
        title="Nothing in the pipeline yet"
        hint="An angle enters the pipeline the moment you accept it."
      />
    );
  }

  return (
    <div>
      <div className="flex items-stretch gap-px border-b border-border bg-muted/30 p-2">
        {byStage
          .filter(({ stage }) => stage.status !== "dismissed")
          .map(({ stage, rows }, index, all) => {
            const previous = index > 0 ? all[index - 1].rows.length : null;
            const share = workable === 0 ? 0 : (rows.length / workable) * 100;
            return (
              <div
                key={stage.status}
                className="min-w-0 flex-1 border-r border-border px-1.5 last:border-r-0"
                title={stage.blurb}
              >
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {rows.length}
                  </span>
                  {previous !== null && previous > 0 ? (
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {Math.round((rows.length / previous) * 100)}%
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {stage.label}
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${share}%` }}
                  />
                </div>
              </div>
            );
          })}
      </div>

      {byStage.map(({ stage, rows }) => (
        <section key={stage.status}>
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-muted/60 px-2 py-1 backdrop-blur-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
              {stage.label}
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {rows.length}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              {stage.blurb}
            </span>
          </div>
          {rows.length === 0 ? (
            <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
              Nothing at this stage.
            </p>
          ) : (
            <ListShell label={`${stage.label} angles`}>
              {rows.map((angle) => {
                const pitches = requests.filter(
                  (row) => row.story_angle_id === angle.id,
                );
                const wins = coverage.filter(
                  (row) => coverageAngleId(row) === angle.id,
                );
                return (
                  <Row
                    key={angle.id}
                    id={angle.id}
                    active={focusedId === angle.id}
                    onSelect={() => onSelect(angle.id)}
                  >
                    <div className="flex items-center gap-2">
                      <PriorityMark value={angle.priority} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-foreground">
                        {angle.headline}
                      </span>
                      {pitches.length > 0 ? (
                        <Chip tone="cool" icon={<Send className="h-2.5 w-2.5" />}>
                          {pitches.length}
                        </Chip>
                      ) : null}
                      {wins.length > 0 ? (
                        <Chip tone="good" icon={<Trophy className="h-2.5 w-2.5" />}>
                          {wins.length}
                        </Chip>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5 pl-9 text-[11px] text-muted-foreground">
                      <StageTrail angle={angle} />
                    </div>
                  </Row>
                );
              })}
            </ListShell>
          )}
        </section>
      ))}
    </div>
  );
}

/** The dated trail an angle actually left, from its own timestamp columns. */
function StageTrail({ angle }: { angle: StoryAngleRow }) {
  const stamps: [string, string | null][] = [
    ["Found", angle.analyzed_at],
    ["Accepted", angle.accepted_at],
    ["Pitched", angle.pitched_at],
    ["Landed", angle.landed_at],
    ["Dismissed", angle.dismissed_at],
  ];
  const present = stamps.filter(([, value]) => value);
  if (present.length === 0) return <span>No stage timestamps recorded.</span>;
  return (
    <span className="truncate">
      {present
        .map(([label, value]) => `${label} ${formatDateOnly(value)}`)
        .join("  →  ")}
    </span>
  );
}

/* ── coverage ─────────────────────────────────────────────────────────────── */

const SENTIMENT_TONE: Record<string, Tone> = {
  positive: "good",
  neutral: "muted",
  negative: "hot",
  mixed: "warn",
};

export function CoverageList({
  coverage,
  angles,
  focusedId,
  onSelect,
}: {
  coverage: CoverageMentionRow[];
  angles: StoryAngleRow[];
  focusedId: string | null;
  onSelect: (id: string) => void;
}) {
  const angleById = new Map(angles.map((angle) => [angle.id, angle]));

  if (coverage.length === 0) {
    return (
      <EmptyPanel
        icon={<Trophy className="h-5 w-5" />}
        title="No coverage recorded yet"
        hint="Coverage appears here automatically when the tracker finds your brand named anywhere it watches."
      />
    );
  }

  return (
    <ListShell label="Coverage">
      {coverage.map((mention) => {
        const angleId = coverageAngleId(mention);
        const angle = angleId ? angleById.get(angleId) : undefined;
        return (
          <Row
            key={mention.id}
            id={mention.id}
            active={focusedId === mention.id}
            onSelect={() => onSelect(mention.id)}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex h-5 w-7 shrink-0 items-center justify-center rounded border text-[11px] font-semibold tabular-nums",
                  TONE_CHIP[
                    (mention.hit_score ?? 0) >= 70
                      ? "good"
                      : (mention.hit_score ?? 0) >= 40
                        ? "warn"
                        : "muted"
                  ],
                )}
                title={`Hit score ${mention.hit_score ?? 0} of 100`}
              >
                {mention.hit_score ?? "—"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-foreground">
                {mention.title ?? mention.url}
              </span>
              {mention.links_to_site ? (
                <Link2
                  className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-label="Links to your site"
                />
              ) : null}
              <span
                className="shrink-0"
                onClick={(event) => event.stopPropagation()}
              >
                <a
                  href={mention.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                  title={`Open ${mention.domain} in a new tab`}
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </span>
            </div>
            <div className="flex items-center gap-1.5 pl-9">
              {mention.is_competitor ? (
                <Chip tone="warn">Competitor</Chip>
              ) : null}
              {mention.sentiment ? (
                <Chip tone={SENTIMENT_TONE[mention.sentiment] ?? "muted"}>
                  {titleCase(mention.sentiment)}
                </Chip>
              ) : null}
              {mention.prominence ? (
                <Chip tone="muted">{titleCase(mention.prominence)}</Chip>
              ) : null}
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {mention.domain} · {formatDateOnly(mention.published_at)}
                {angle ? ` · from “${angle.headline}”` : " · not attributed"}
              </span>
              {mention.author_party_id && mention.author_name ? (
                <span
                  className="shrink-0"
                  onClick={(event) => event.stopPropagation()}
                >
                  <EntityRef
                    token="party"
                    id={mention.author_party_id}
                    name={mention.author_name}
                    openInNewTab
                    className="text-[11px]"
                  />
                </span>
              ) : mention.author_name ? (
                <span
                  className="shrink-0 text-[11px] text-muted-foreground"
                  title="This author is not in the CRM yet, so there is no record to open."
                >
                  <UserRound className="mr-0.5 inline h-3 w-3" />
                  {mention.author_name}
                </span>
              ) : null}
            </div>
          </Row>
        );
      })}
    </ListShell>
  );
}

export { ACTION_TONE, ANGLE_STATUS_TONE, REQUEST_STATUS_TONE, SENTIMENT_TONE };

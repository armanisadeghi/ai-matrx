"use client";

/**
 * The Press Room — story angles: the ranked row, and the detail panel.
 *
 * Modelled on Linear's issue list. One line per angle, the decision signal on
 * the left, the identity in the middle, the state on the right; the whole row
 * is one hit target and the detail lives in a panel that never navigates away.
 * The second line is the thing Linear does NOT have and this product needs: the
 * *why now*, because a press angle without timing is not a press angle.
 *
 * Every row is a pure function of `StoryAngleRow`.
 */

import * as React from "react";
import {
  ArrowRight,
  CalendarClock,
  CircleAlert,
  ExternalLink,
  Send,
  ThumbsUp,
  Trash2,
  UserCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { cn } from "@/lib/utils";

import { EvidenceLadder, LadderMeter, readLadder } from "./EvidenceLadder";
import {
  ACTION_COPY,
  ANGLE_TYPE_LABEL,
  ANGLE_STATUS_LABEL,
  formatDay,
  keyOf,
  pressScore,
} from "./press-model";
import {
  ActionChip,
  EndowmentChip,
  PanelSection,
  ScoreBreakdown,
  ScoreComb,
  StatusPill,
} from "./PressPrimitives";
import {
  ANGLE_STATUSES,
  ANGLE_TYPES,
  RECOMMENDED_ACTIONS,
  readContradictions,
  readFacts,
  readInferences,
  type AngleStatus,
  type AngleType,
  type CoverageMentionRow,
  type RecommendedAction,
  type SourceRequestRow,
  type StoryAngleRow,
} from "./types";

export function angleTypeLabel(value: string): string {
  return ANGLE_TYPE_LABEL[keyOf<AngleType>(value, ANGLE_TYPES, "expertise")];
}

export function angleStatusLabel(value: string): string {
  return ANGLE_STATUS_LABEL[
    keyOf<AngleStatus>(value, ANGLE_STATUSES, "proposed")
  ];
}

export function angleAction(value: string): RecommendedAction {
  return keyOf<RecommendedAction>(value, RECOMMENDED_ACTIONS, "park");
}

/** Ranked by the composite, then by how close the proof is. */
export function rankAngles(rows: StoryAngleRow[]): StoryAngleRow[] {
  return [...rows].sort((a, b) => {
    const byScore = pressScore(b) - pressScore(a);
    if (byScore !== 0) return byScore;
    const ladderA = readLadder(a);
    const ladderB = readLadder(b);
    return (
      ladderB.total - ladderB.held - (ladderA.total - ladderA.held)
    );
  });
}

export function AngleRow({
  angle,
  selected,
  onSelect,
}: {
  angle: StoryAngleRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const ladder = readLadder(angle);
  const dimmed = angle.status === "dismissed";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors",
        selected
          ? "border-l-primary bg-accent/60"
          : "border-l-transparent hover:bg-accent/35",
        dimmed && "opacity-55",
      )}
    >
      <ScoreComb angle={angle} className="mt-0.5 shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug text-foreground">
            {angle.headline}
          </p>
          <ActionChip action={angle.recommended_action} />
        </div>

        <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
          <EndowmentChip endowment={angle.endowment} />
          <span className="shrink-0">{angleTypeLabel(angle.angle_type)}</span>
          {angle.target_beat ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">{angle.target_beat}</span>
            </>
          ) : null}
          {angle.why_now ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="min-w-0 truncate italic">{angle.why_now}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <StatusPill label={angleStatusLabel(angle.status)} />
        <span className="flex items-center gap-1.5">
          <LadderMeter read={ladder} />
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {ladder.held}/{ladder.total}
          </span>
        </span>
      </div>
    </button>
  );
}

/* ── detail ──────────────────────────────────────────────────────────────── */

export function AngleDetail({
  angle,
  requests,
  coverage,
  onResolveEvidence,
  onSetStatus,
  onOpenRequest,
  onPrimaryAction,
}: {
  angle: StoryAngleRow;
  /** Every source request pointing at this angle. */
  requests: SourceRequestRow[];
  /** Coverage tied to this angle through `metadata.story_angle_id`. */
  coverage: CoverageMentionRow[];
  onResolveEvidence: (key: string) => void;
  onSetStatus: (status: AngleStatus) => void;
  onOpenRequest: (id: string) => void;
  onPrimaryAction: () => void;
}) {
  const action = ACTION_COPY[angleAction(angle.recommended_action)];
  const facts = readFacts(angle.facts);
  const inferences = readInferences(angle.inferences);
  const contradictions = readContradictions(angle.contradictions);
  const status = keyOf<AngleStatus>(angle.status, ANGLE_STATUSES, "proposed");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border/60 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <ActionChip action={angle.recommended_action} />
          <StatusPill label={angleStatusLabel(angle.status)} />
          {angle.requires_human_review ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              <UserCheck className="h-3 w-3" />
              Wants your ruling
            </span>
          ) : null}
        </div>
        <h2 className="mt-2 text-sm font-semibold leading-snug text-foreground">
          {angle.headline}
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {angle.summary}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <EndowmentChip endowment={angle.endowment} />
          <span>{angleTypeLabel(angle.angle_type)}</span>
          {angle.target_beat ? <span>· {angle.target_beat} desk</span> : null}
          {angle.target_outlet_kind ? (
            <span>· {angle.target_outlet_kind} outlets</span>
          ) : null}
          <span>· analysed {formatDay(angle.analyzed_at)}</span>
          {/* The site is a record with a route. It gets a door. */}
          <EntityRef
            token="web_site"
            id={angle.site_id}
            name="this site"
            showIcon={false}
            openInNewTab
            className="text-[11px]"
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {angle.why_now ? (
          <div className="mx-4 mt-3.5 flex gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
            <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                Why now
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground">
                {angle.why_now}
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-4 mt-3.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground">
              No timing hook recorded. A journalist&apos;s first question is
              &ldquo;why this week?&rdquo; — give this angle an answer before it
              goes out.
            </p>
          </div>
        )}

        <div className="mx-4 mt-3 rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-medium text-foreground">{action.meaning}</p>
          {angle.action_reason ? (
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {angle.action_reason}
            </p>
          ) : null}
          <Button size="sm" className="mt-2.5 h-7 text-[11px]" onClick={onPrimaryAction}>
            {action.cta}
            <ArrowRight className="ml-1.5 h-3 w-3" />
          </Button>
        </div>

        <PanelSection
          title="Proof a journalist will demand"
          aside={
            <span className="text-[10px] text-muted-foreground">
              drives the Evidence score
            </span>
          }
        >
          <EvidenceLadder angle={angle} onResolve={onResolveEvidence} />
        </PanelSection>

        <PanelSection title="Why this score">
          <ScoreBreakdown angle={angle} />
        </PanelSection>

        {facts.items.length > 0 ? (
          <PanelSection title={`Facts (${facts.items.length})`}>
            <ul className="space-y-1.5">
              {facts.items.map((fact, index) => (
                <li
                  key={`${fact.statement}-${index}`}
                  className="text-xs leading-relaxed text-foreground"
                >
                  {fact.statement}
                  {fact.source_key ? (
                    <span className="ml-1.5 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {fact.source_key}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </PanelSection>
        ) : null}

        {inferences.items.length > 0 ? (
          <PanelSection title="Inferences — not facts">
            <ul className="space-y-1.5">
              {inferences.items.map((item, index) => (
                <li
                  key={`${item.statement}-${index}`}
                  className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
                >
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                  <span>
                    {item.statement}
                    {item.confidence !== null ? (
                      <span className="ml-1 tabular-nums text-[10px]">
                        ({Math.round(item.confidence * 100)}% sure)
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </PanelSection>
        ) : null}

        {contradictions.items.length > 0 ? (
          <PanelSection title="What argues against it">
            <ul className="space-y-2">
              {contradictions.items.map((item, index) => (
                <li
                  key={`${item.statement}-${index}`}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-2"
                >
                  <p className="flex items-start gap-1.5 text-xs font-medium text-foreground">
                    <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                    {item.statement}
                  </p>
                  {item.detail ? (
                    <p className="mt-1 pl-[18px] text-[11px] text-muted-foreground">
                      {item.detail}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </PanelSection>
        ) : null}

        <PanelSection
          title={`Journalists already asking (${requests.length})`}
        >
          {requests.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No open journalist query matches this angle yet. It will appear
              here the moment one does.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {requests.map((request) => (
                <li key={request.id}>
                  <button
                    type="button"
                    onClick={() => onOpenRequest(request.id)}
                    className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground">
                        {request.query_title}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {request.outlet ?? "Outlet not named"}
                        {request.journalist_name
                          ? ` · ${request.journalist_name}`
                          : ""}
                      </span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PanelSection>

        <PanelSection title={`Coverage this produced (${coverage.length})`}>
          {coverage.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Nothing has run from this angle yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {coverage.map((mention) => (
                <li
                  key={mention.id}
                  className="rounded-md border border-border bg-card px-2.5 py-2"
                >
                  <a
                    href={mention.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-start gap-1.5 text-xs font-medium text-foreground hover:text-primary hover:underline"
                  >
                    <span className="min-w-0 flex-1">
                      {mention.title ?? mention.url}
                    </span>
                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                  </a>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {mention.domain} · {formatDay(mention.published_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </PanelSection>
      </div>

      <footer className="shrink-0 border-t border-border/60 bg-card/60 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {status !== "accepted" && status !== "landed" ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => onSetStatus("accepted")}
            >
              <ThumbsUp className="mr-1.5 h-3 w-3" />
              Accept
            </Button>
          ) : null}
          {status !== "pitched" && status !== "landed" ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => onSetStatus("pitched")}
            >
              <Send className="mr-1.5 h-3 w-3" />
              Mark pitched
            </Button>
          ) : null}
          {status !== "landed" ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => onSetStatus("landed")}
            >
              It landed
            </Button>
          ) : null}
          {status !== "dismissed" ? (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-[11px] text-muted-foreground"
              onClick={() => onSetStatus("dismissed")}
            >
              <Trash2 className="mr-1.5 h-3 w-3" />
              Not for us
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-[11px]"
              onClick={() => onSetStatus("proposed")}
            >
              Bring it back
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

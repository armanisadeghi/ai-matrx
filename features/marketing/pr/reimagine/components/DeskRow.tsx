"use client";

/**
 * One row of the run-of-show.
 *
 * The reconception this file carries: a story angle, a journalist request and
 * a published clipping are NOT three different objects on three different
 * screens. They are one object — a story — at three points in its life. So
 * they share a row, a rank, and a queue, and the operator works top-down
 * instead of deciding which tab today's work is hiding in.
 */

import {
  CheckCircle2,
  Inbox,
  Lightbulb,
  Newspaper,
  ShieldAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  ACTION_LABEL,
  ANGLE_TYPE_LABEL,
  countdownTo,
  ENDOWMENT_LABEL,
  humanise,
  laneOf,
  missingCount,
  PLATFORM_LABEL,
  rankReasons,
  angleReadiness,
  titleOf,
  subtitleOf,
} from "../lib/desk";
import { buildProofLedger } from "../lib/proof";
import type { DeskItem, DeskSite } from "../types";
import { SiteRef } from "./Doors";
import { MatchMeter, ProofPips, ReadinessMeter } from "./ReadinessMeter";

const KIND_ICON = {
  angle: Lightbulb,
  request: Inbox,
  coverage: Newspaper,
} as const;

const KIND_TINT = {
  angle: "bg-primary/10 text-primary",
  request: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  coverage: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
} as const;

export function DeskRow({
  item,
  rank,
  site,
  now,
  selected,
  onSelect,
}: {
  item: DeskItem;
  rank: number;
  site: DeskSite | null;
  now: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const Icon = KIND_ICON[item.kind];
  const reasons = rankReasons(item, now);
  const lane = laneOf(item, now);
  const title = titleOf(item);
  const subtitle = subtitleOf(item);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected}
      onClick={() => onSelect(item.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item.id);
        }
      }}
      className={cn(
        "group relative flex w-full cursor-pointer gap-3 border-b border-border/60 px-3 py-2.5 text-left outline-none transition-colors",
        "hover:bg-accent/50 focus-visible:bg-accent/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
        selected && "bg-accent",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-[3px] bg-primary transition-opacity",
          selected ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Rank — priority is a POSITION, never a fifth number in the row. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/50 text-[11px] font-semibold tabular-nums text-muted-foreground">
            {rank}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-80">
          <p className="text-xs font-semibold text-foreground">
            Why this is #{rank}
          </p>
          <ul className="mt-1 space-y-0.5">
            {reasons.map((reason) => (
              <li key={reason} className="text-[11px] leading-snug text-muted-foreground">
                {reason}
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>

      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
          KIND_TINT[item.kind],
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-[13px] font-medium leading-5 text-foreground",
            selected && "text-foreground",
          )}
        >
          {title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <SiteRef site={site} />
          <span className="text-border">·</span>
          <RowMeta item={item} now={now} lane={lane} />
        </div>
        {subtitle ? (
          <p className="mt-1 line-clamp-1 text-[11px] leading-snug text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between gap-1.5 pl-1">
        <RowSignal item={item} now={now} />
      </div>
    </div>
  );
}

function RowMeta({
  item,
  now,
  lane,
}: {
  item: DeskItem;
  now: number;
  lane: string;
}) {
  if (item.kind === "angle") {
    const angle = item.row;
    return (
      <>
        <span className="text-[11px] text-muted-foreground">
          {ENDOWMENT_LABEL[angle.endowment] ?? humanise(angle.endowment)} ·{" "}
          {ANGLE_TYPE_LABEL[angle.angle_type] ?? humanise(angle.angle_type)}
        </span>
        <Badge
          variant={
            angle.recommended_action === "pitch_now"
              ? "success"
              : angle.recommended_action === "park"
                ? "neutral"
                : "secondary"
          }
          className="whitespace-nowrap"
        >
          {ACTION_LABEL[angle.recommended_action] ?? humanise(angle.recommended_action)}
        </Badge>
        {angle.requires_human_review ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                <ShieldAlert className="h-3 w-3" />
                your call
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              <p className="text-xs">
                The analyzer flagged this as needing a human ruling before it
                goes anywhere — usually a clinical, legal or client-naming
                judgement it is not entitled to make.
              </p>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </>
    );
  }

  if (item.kind === "request") {
    const request = item.row;
    return (
      <>
        <span className="text-[11px] text-muted-foreground">
          {PLATFORM_LABEL[request.platform] ?? humanise(request.platform)}
          {request.outlet ? ` · ${request.outlet}` : ""}
          {request.journalist_name ? ` · ${request.journalist_name}` : ""}
        </span>
        <Badge variant="secondary" className="whitespace-nowrap">
          {humanise(request.status)}
        </Badge>
      </>
    );
  }

  const mention = item.row;
  return (
    <>
      <span className="text-[11px] text-muted-foreground">
        {mention.domain}
        {mention.author_name ? ` · ${mention.author_name}` : ""}
      </span>
      <Badge variant="success" className="whitespace-nowrap">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        {mention.prominence ? humanise(mention.prominence) : "Landed"}
      </Badge>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
        {lane}
      </span>
    </>
  );
}

function RowSignal({ item, now }: { item: DeskItem; now: number }) {
  if (item.kind === "angle") {
    const ledger = buildProofLedger({
      id: item.row.id,
      evidenceRefs: item.row.evidence_refs,
      proofRequired: item.row.proof_required,
      missingEvidence: item.row.missing_evidence,
      contradictions: item.row.contradictions,
    });
    const gaps = missingCount(item.row);
    return (
      <>
        <ReadinessMeter segments={angleReadiness(item.row)} />
        <ProofPips met={ledger.met} total={ledger.total} />
        {gaps > 0 ? (
          <span className="text-[10px] font-medium text-muted-foreground">
            {gaps === 1 ? "1 fact away" : `${gaps} facts away`}
          </span>
        ) : (
          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            provable
          </span>
        )}
      </>
    );
  }

  if (item.kind === "request") {
    const countdown = countdownTo(item.row.deadline_at, now);
    return (
      <>
        <MatchMeter value={item.row.match_score} reason={item.row.match_reason} />
        {countdown ? (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              countdown.band === "critical" &&
                "bg-destructive/10 text-destructive",
              countdown.band === "urgent" &&
                "bg-amber-500/10 text-amber-700 dark:text-amber-300",
              (countdown.band === "soon" || countdown.band === "later") &&
                "text-muted-foreground",
              countdown.band === "expired" && "bg-muted text-muted-foreground",
            )}
          >
            {countdown.expired ? countdown.label : `closes in ${countdown.label}`}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">no deadline</span>
        )}
      </>
    );
  }

  const mention = item.row;
  return (
    <>
      <span className="text-[11px] font-semibold tabular-nums text-foreground">
        {mention.prominence_score ?? mention.hit_score ?? "—"}
        <span className="text-muted-foreground">/100</span>
      </span>
      <span className="text-[10px] text-muted-foreground">
        {mention.links_to_site ? "links to site" : "no link"}
      </span>
    </>
  );
}

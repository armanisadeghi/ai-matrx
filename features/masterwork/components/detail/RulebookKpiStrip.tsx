"use client";

// features/masterwork/components/detail/RulebookKpiStrip.tsx
//
// The encouragement engine of the review loop (Arman, 2026-08-17): the Expert
// should always see how far they've come and exactly what one click gets them
// next. Counts, a review-progress bar, and a next-step line that celebrates
// forward motion — never a wall of numbers. Enterprise: Lucide only, semantic
// tokens, no emojis.

import {
  BadgeCheck,
  CircleDashed,
  ListChecks,
  MessageSquareWarning,
  Rocket,
  Trophy,
  Workflow,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Masterwork, Rulebook } from "../../types";
import { ruleState } from "../../types";
import type { Journey } from "../../journey";

export interface RulebookKpis {
  total: number;
  approved: number;
  drafts: number;
  rejected: number;
  changeRequests: number;
  retired: number;
  /** 0-100, share of live rules the Expert has approved. */
  progressPct: number;
}

export interface MasterworkKpis {
  built: number;
  current: number;
  released: number;
  currentPct: number;
  /**
   * 🚨 THE ARCHIVED-ITEMS LAW, honesty half (row F10 repair, 2026-09-10).
   *
   * `built` is the LIVE half of the archive split, which is right for a count
   * of working systems and WRONG as evidence that nothing was ever built. With
   * every Masterwork archived, `built === 0` and the strip printed "No
   * Masterworks built yet." one line above its own "Archived Masterworks (2)"
   * door — a screen lying about the Expert's own work and telling them to
   * rebuild it. Every caption that could claim "never built" now reads
   * `built + archived`, never `built` alone.
   */
  archived: number;
}

export function computeMasterworkKpis(
  masterworks: Masterwork[],
  rulebookVersion: number,
  /**
   * The ARCHIVED half of the same split — the rows the surface's
   * `ArchivedDisclosure` reveals. Counts stay live-only; only the never-built
   * claim consults this. Defaults to none so a caller with no split (a surface
   * that reads one half) cannot accidentally invent archived systems.
   */
  archivedMasterworks: readonly Masterwork[] = [],
): MasterworkKpis {
  const built = masterworks.filter((masterwork) => !masterwork.understudy);
  const current = built.filter(
    (masterwork) => masterwork.rulebook_version === rulebookVersion,
  ).length;
  const released = built.filter(
    (masterwork) => masterwork.released_at !== null,
  ).length;

  return {
    built: built.length,
    current,
    released,
    currentPct:
      built.length === 0 ? 0 : Math.round((current / built.length) * 100),
    archived: archivedMasterworks.filter((masterwork) => !masterwork.understudy)
      .length,
  };
}

export function computeKpis(rulebook: Pick<Rulebook, "rules">): RulebookKpis {
  let approved = 0;
  let drafts = 0;
  let rejected = 0;
  let retired = 0;
  let changeRequests = 0;
  for (const rule of rulebook.rules) {
    const state = ruleState(rule);
    // 🚨 Every rule counts (2026-09-12). For a few hours a per-piece judgment
    // was counted as "evidence" and set aside here so the strip would say a
    // smaller number — a counter that hides work is a counter that lies.
    // Volume is answered by the default view, the sections and a bulk approve
    // that records what was read, never by a smaller total.
    if (state === "retired") retired += 1;
    else if (state === "rejected") rejected += 1;
    else if (state === "draft") drafts += 1;
    else approved += 1;
    if (rule.feedback && state !== "rejected" && state !== "retired")
      changeRequests += 1;
  }
  const live = approved + drafts + rejected;
  return {
    total: rulebook.rules.length,
    approved,
    drafts,
    rejected,
    changeRequests,
    retired,
    progressPct: live === 0 ? 0 : Math.round((approved / live) * 100),
  };
}

/**
 * The one line under the bar — always forward-looking, always earned.
 *
 * 🚨 It is THE JOURNEY's headline (`features/masterwork/journey.ts`, mirroring
 * aidream `masterwork_assists/journey.py`), not a private opinion. Before the
 * journey existed this line stopped at "Ready to Build" — so a Rulebook with a
 * finished Checkup nobody had looked at, three unanswered questions, three
 * built Masterworks and zero Auditions was told it was all caught up, while
 * the improvement chips right below it said something else entirely.
 *
 * `journey` is optional only so the KPI computation stays usable on its own
 * (the module home renders counts without facts); when it is absent this falls
 * back to the review-queue half of the same precedence, never to a claim about
 * a life stage it cannot see.
 */
function nextStepLine(k: RulebookKpis, journey?: Journey): string {
  if (journey) return journey.headline;
  if (k.total === 0)
    return "Start the interview — your first rules are one conversation away.";
  if (k.drafts === 0 && k.rejected === 0 && k.changeRequests === 0)
    return k.approved > 0
      ? `All caught up — ${k.approved} approved ${k.approved === 1 ? "rule" : "rules"} and nothing waiting on you.`
      : "No rules waiting on you.";
  if (k.drafts > 0 && k.drafts <= 3)
    return `Almost there — ${k.drafts} ${k.drafts === 1 ? "rule" : "rules"} left to review.`;
  if (k.drafts > 0)
    return `${k.drafts} suggested ${k.drafts === 1 ? "rule needs" : "rules need"} your call — approve, correct, or reject each one.`;
  if (k.rejected > 0)
    // Never "they'll come back rewritten": a rejected rule is rewritten by the
    // Scout on its NEXT turn, so nothing is happening to it while nobody is
    // talking to the interviewer. Same sentence as the journey's.
    return `${k.rejected} rejected ${k.rejected === 1 ? "rule" : "rules"} will be rewritten the next time you talk to the interviewer.`;
  return `${k.changeRequests} change ${k.changeRequests === 1 ? "request is" : "requests are"} queued for the interviewer.`;
}

function Tile({
  icon,
  value,
  label,
  tone,
  href,
  onClick,
  active = false,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone?: "positive" | "attention" | "negative" | "muted";
  href?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const valueCls =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "attention"
        ? "text-primary"
        : tone === "negative"
          ? "text-destructive"
          : "text-foreground";
  const className = cn(
    "flex min-w-[5.5rem] flex-1 items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-left transition-colors",
    href || onClick
      ? "cursor-pointer hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      : "border-border",
    active
      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
      : "border-border",
  );
  const content = (
    <>
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0 leading-tight">
        <div className={`text-base font-semibold tabular-nums ${valueCls}`}>
          {value}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {label}
        </div>
      </div>
    </>
  );
  if (href)
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  return <div className={className}>{content}</div>;
}

/**
 * The views of a Rulebook's rules. The first four are review STATES; the last
 * four are SAVED VIEWS (Airtable's answer to volume), and `attention` is what a
 * large Rulebook OPENS on.
 *
 * 🚨 THE DEFAULT VIEW IS NOT EVERYTHING (2026-09-12, Linear's triage inbox).
 * A Rulebook past `LARGE_RULEBOOK` rules opens on `attention` — the
 * disagreements plus the rules only one source holds — and "All N" is a
 * deliberate click. Grouping sorts a pile; a default filter shrinks it. The
 * live shape that forced this: Newsroom Desk, 416 rules in ONE section, zero
 * drafts, because Approve-all had fired on all of them.
 */
export type RuleKpiFilter =
  | "all"
  | "approved"
  | "draft"
  | "rejected"
  | "changes"
  | "attention"
  | "disagreements"
  | "seen_once"
  | "only_source";

/**
 * Where a Rulebook stops being a list and becomes a pile. Hardcoded with this
 * comment, deliberately: it is the same 40 the server sections at
 * (`aidream/services/distillation/sectioning.py`), and it stays a constant
 * until an organization asks for a different number.
 */
export const LARGE_RULEBOOK = 40;

export function RulebookKpiStrip({
  kpis,
  journey,
  live = false,
  activeFilter,
  onFilterChange,
}: {
  kpis: RulebookKpis;
  /**
   * Where this Rulebook is in its life. When given, its headline IS the next
   * step line — the same computation the improvement brain raises chips from,
   * so the page and the chips can never say different things.
   */
  journey?: Journey;
  /**
   * True when the Rulebook's Understudy exists — the system is already
   * running, and every approval visibly improves it (vision doc 13).
   */
  live?: boolean;
  activeFilter?: RuleKpiFilter;
  onFilterChange?: (filter: RuleKpiFilter) => void;
}) {
  const done = kpis.progressPct >= 100 && kpis.approved > 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Tile
          icon={<ListChecks className="h-4 w-4" />}
          value={kpis.approved + kpis.drafts + kpis.rejected}
          label="Rules"
          active={activeFilter === "all"}
          onClick={onFilterChange ? () => onFilterChange("all") : undefined}
        />
        <Tile
          icon={<BadgeCheck className="h-4 w-4" />}
          value={kpis.approved}
          label="Approved"
          tone="positive"
          active={activeFilter === "approved"}
          onClick={
            onFilterChange ? () => onFilterChange("approved") : undefined
          }
        />
        <Tile
          icon={<CircleDashed className="h-4 w-4" />}
          value={kpis.drafts}
          label="Waiting on you"
          tone={kpis.drafts > 0 ? "attention" : "muted"}
          active={activeFilter === "draft"}
          onClick={onFilterChange ? () => onFilterChange("draft") : undefined}
        />
        {kpis.rejected > 0 ? (
          <Tile
            icon={<XCircle className="h-4 w-4" />}
            value={kpis.rejected}
            label="With the interviewer"
            tone="negative"
            active={activeFilter === "rejected"}
            onClick={
              onFilterChange ? () => onFilterChange("rejected") : undefined
            }
          />
        ) : null}
        {kpis.changeRequests > 0 ? (
          <Tile
            icon={<MessageSquareWarning className="h-4 w-4" />}
            value={kpis.changeRequests}
            label="Change requests"
            tone="attention"
            active={activeFilter === "changes"}
            onClick={
              onFilterChange ? () => onFilterChange("changes") : undefined
            }
          />
        ) : null}
      </div>
      <div>
        {/* ONE line, not three. Arman, 2026-08-18: "We don't need to write a
            goddamn novel about everything. Pick your favorite one, and that's
            all we write." The favourite is the next step — a "Review progress"
            label restates the bar, and a second sentence about the system
            being live restates the Understudy card below. */}
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            {done ? (
              <Trophy className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : null}
            {live ? (
              <span
                className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                title="Your system is already running — every approval improves it"
              />
            ) : null}
            <span className="truncate">{nextStepLine(kpis, journey)}</span>
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {kpis.progressPct}%
          </span>
        </div>
        <div
          className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={kpis.progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Rules reviewed"
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              done ? "bg-emerald-500" : "bg-primary"
            }`}
            style={{ width: `${Math.max(kpis.progressPct, 2)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The ONE line under the Masterwork bar.
 *
 * 🚨 "yet" is a claim about the Expert's WHOLE history, so it may only be made
 * against live + archived. `built === 0` alone meant "nothing was ever built"
 * until the archive split made `built` the live half; after it, this strip
 * printed "No Masterworks built yet." one line above its own "Archived
 * Masterworks (2)" door, and the Rulebook header told the Expert to rebuild
 * work they already had (row F10 live review, 2026-09-10). Exported so the
 * forcing test can hold every branch to that, without re-implementing it.
 */
export function masterworkFreshnessLine(kpis: MasterworkKpis): string {
  const totalBuilt = kpis.built + kpis.archived;
  if (totalBuilt === 0) return "No Masterworks built yet.";
  if (kpis.built === 0)
    return `All ${kpis.archived} ${kpis.archived === 1 ? "Masterwork is" : "Masterworks are"} archived.`;
  if (kpis.current === kpis.built)
    return "Every Masterwork is using the current rules.";
  const stale = kpis.built - kpis.current;
  return `${stale} ${stale === 1 ? "Masterwork needs" : "Masterworks need"} rebuilding.`;
}

export type MasterworkKpiFilter = "all" | "current" | "released";

export function MasterworkKpiStrip({
  kpis,
  rulebookId,
  activeFilter,
}: {
  kpis: MasterworkKpis;
  rulebookId?: string;
  activeFilter?: MasterworkKpiFilter;
}) {
  const allCurrent = kpis.built > 0 && kpis.current === kpis.built;
  const freshnessLine = masterworkFreshnessLine(kpis);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Tile
          icon={<Workflow className="h-4 w-4" />}
          value={kpis.built}
          label="Built"
          href={
            rulebookId
              ? `/masterwork/${rulebookId}/masterworks?status=all`
              : undefined
          }
          active={activeFilter === "all"}
        />
        <Tile
          icon={<BadgeCheck className="h-4 w-4" />}
          value={kpis.current}
          label="Current"
          tone={allCurrent ? "positive" : "attention"}
          href={
            rulebookId
              ? `/masterwork/${rulebookId}/masterworks?status=current`
              : undefined
          }
          active={activeFilter === "current"}
        />
        <Tile
          icon={<Rocket className="h-4 w-4" />}
          value={kpis.released}
          label="Released"
          tone={kpis.released > 0 ? "positive" : "muted"}
          href={
            rulebookId
              ? `/masterwork/${rulebookId}/masterworks?status=released`
              : undefined
          }
          active={activeFilter === "released"}
        />
      </div>
      <div>
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="truncate">{freshnessLine}</span>
          <span className="shrink-0 tabular-nums">{kpis.currentPct}%</span>
        </div>
        <div
          className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={kpis.currentPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Masterworks using the current rules"
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              allCurrent ? "bg-emerald-500" : "bg-primary",
            )}
            style={{ width: `${Math.max(kpis.currentPct, 2)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * The standing table's impact cells (Agent Change Impact, I4).
 *
 * Every word a person reads about a grade, a blocker or a finding is the
 * server's (`POST /mandates/impact`, via `./impact`) — these components only
 * lay it out. A row the read did not grade says why; it is never shown as
 * clean.
 */

import React from "react";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  FastForward,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useOpenMandateWindow } from "@/features/overlays/openers/mandateWindow";
import {
  BLOCKER_META,
  GRADE_META,
  IMPACT_GRADE_ORDER,
  batchEligibilityOf,
  blockerKeyOf,
  isAdvanceAnyway,
  setAsideReasonOf,
  settingsSignalOf,
  versionLabel,
  type ImpactBlocker,
  type ImpactVerdict,
  type StandingImpact,
} from "./impact";

/** Why a row carries no verdict — each is a different fact. */
export type UngradedReason = "loading" | "read_failed" | "no_agent" | "not_returned";

const UNGRADED_SENTENCE: Record<UngradedReason, string> = {
  loading: "Grading against the server…",
  read_failed:
    "The impact read failed, so this row's danger is unknown — not safe.",
  no_agent:
    "No agent holds this mandate's default, so there is no version to grade.",
  not_returned:
    "The impact read returned no verdict for this rung (it may belong to someone you cannot see). Unknown, not safe.",
};

export function VerdictDetail({ verdict }: { verdict: ImpactVerdict }) {
  const settings = settingsSignalOf(verdict);
  const reason = setAsideReasonOf(verdict);
  const eligibility = batchEligibilityOf(verdict);
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={GRADE_META[verdict.grade].toneClassName}>
          {GRADE_META[verdict.grade].label}
        </Badge>
        <span className="font-mono text-[11px] text-muted-foreground">
          {verdict.holder_kind === "binding"
            ? `${verdict.principal.kind} binding`
            : "mandate default"}
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          {versionLabel(verdict.pinned_version_number)}
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          {versionLabel(verdict.latest_version_number)}
        </span>
      </div>
      {verdict.findings && verdict.findings.length > 0 ? (
        <ul className="space-y-0.5">
          {verdict.findings.map((finding, index) => (
            <li
              key={`${finding.rule_id}-${index}`}
              className="flex items-start gap-1.5 leading-snug"
            >
              <span
                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                  finding.grade === "red"
                    ? "bg-rose-500"
                    : finding.grade === "orange"
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                }`}
              />
              <span>{finding.message}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">
          {verdict.grade === "identical"
            ? "No change between these versions affects a run."
            : "The server graded this row but listed no finding."}
        </p>
      )}
      {settings.state !== "clean" ? (
        <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
          <CircleHelp className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            {settings.state === "unmeasured" ? "UNMEASURED — " : ""}
            {settings.sentence}
          </span>
        </p>
      ) : null}
      {verdict.blocker ? (
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">
            {BLOCKER_META[verdict.blocker].label}:
          </span>{" "}
          {BLOCKER_META[verdict.blocker].meaning}
          {reason ? ` “${reason}”` : ""}
        </p>
      ) : null}
      {!eligibility.batchable ? (
        <p className="text-muted-foreground">Not in a batch — {eligibility.why}</p>
      ) : null}
    </div>
  );
}

export function ImpactGradeCell({
  mandateKey,
  defaultVerdict,
  bindingVerdicts,
  ungraded,
}: {
  mandateKey: string;
  defaultVerdict: ImpactVerdict | null;
  bindingVerdicts: ImpactVerdict[];
  ungraded: UngradedReason | null;
}) {
  if (!defaultVerdict) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
        title={UNGRADED_SENTENCE[ungraded ?? "not_returned"]}
      >
        {ungraded === "loading" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <CircleHelp className="h-3 w-3" />
        )}
        {ungraded === "loading" ? "Grading" : "Not graded"}
      </span>
    );
  }
  const settings = settingsSignalOf(defaultVerdict);
  const worstBinding = bindingVerdicts.reduce<ImpactVerdict | null>(
    (worst, v) =>
      !worst ||
      IMPACT_GRADE_ORDER.indexOf(v.grade) > IMPACT_GRADE_ORDER.indexOf(worst.grade)
        ? v
        : worst,
    null,
  );
  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          aria-label={`What changed for ${mandateKey}`}
          className="inline-flex flex-wrap items-center gap-1 rounded text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Badge
            variant="outline"
            className={GRADE_META[defaultVerdict.grade].toneClassName}
          >
            {GRADE_META[defaultVerdict.grade].label}
          </Badge>
          {defaultVerdict.findings && defaultVerdict.findings.length > 0 ? (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {defaultVerdict.findings.length}
            </span>
          ) : null}
          {settings.state === "unmeasured" ? (
            <Badge
              variant="outline"
              className="border-amber-500/40 px-1 text-[10px] text-amber-700 dark:text-amber-400"
            >
              unmeasured
            </Badge>
          ) : null}
          {worstBinding ? (
            <span className="text-[10px] text-muted-foreground">
              +{bindingVerdicts.length} binding
              {bindingVerdicts.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-[min(28rem,calc(100vw-2rem))] space-y-2 p-3"
      >
        <div className="text-xs font-medium">
          {defaultVerdict.agent_name} — what changed
        </div>
        <VerdictDetail verdict={defaultVerdict} />
        {bindingVerdicts.length > 0 ? (
          <div className="space-y-2 border-t border-border pt-2">
            <div className="text-[11px] text-muted-foreground">
              {bindingVerdicts.length} binding rung
              {bindingVerdicts.length === 1 ? "" : "s"} on this mandate, graded
              separately. This table batches the mandate's own default pin;
              open the mandate to review its bindings.
            </div>
            {bindingVerdicts.map((verdict) => (
              <VerdictDetail
                key={`${verdict.holder_kind}:${verdict.row_id}`}
                verdict={verdict}
              />
            ))}
          </div>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}

export function ImpactBlockerCell({
  verdict,
  onAdvanceAnyway,
  busy,
}: {
  verdict: ImpactVerdict | null;
  onAdvanceAnyway: (verdict: ImpactVerdict) => void;
  busy: boolean;
}) {
  const openMandateWindow = useOpenMandateWindow();
  if (!verdict) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const key = blockerKeyOf(verdict);
  const meta = BLOCKER_META[key];
  const eligibility = batchEligibilityOf(verdict);
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      onClick={(event) => event.stopPropagation()}
    >
      <Badge
        variant="outline"
        className={meta.toneClassName}
        title={`${meta.meaning} ${meta.remedy}`}
      >
        {meta.label}
      </Badge>
      {/* R17: a blocked row's door is per row — open the mandate in place. */}
      {verdict.blocker && verdict.blocker !== "tracks_latest" ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-1.5 text-[11px]"
          title={meta.remedy}
          onClick={() =>
            openMandateWindow({
              initialMandateKey: verdict.mandate_key,
              mandateKeys: [verdict.mandate_key],
              initialView: "admin",
              surfaceName: "administration-mandates",
            })
          }
        >
          <ExternalLink className="h-3 w-3" />
          Open
        </Button>
      ) : null}
      {eligibility.batchable && isAdvanceAnyway(verdict) ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          className="h-6 gap-1 px-1.5 text-[11px] text-rose-700 dark:text-rose-400"
          title="Move this pin even though the change is graded orange or red — the next dialog says exactly what moves."
          onClick={() => onAdvanceAnyway(verdict)}
        >
          <FastForward className="h-3 w-3" />
          Advance anyway
        </Button>
      ) : null}
    </div>
  );
}

/** The one-glance legend: every grade and every blocker, in words. */
export function ImpactLegend() {
  return (
    <HoverCard openDelay={100} closeDelay={80}>
      <HoverCardTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs">
          <CircleHelp className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Legend</span>
        </Button>
      </HoverCardTrigger>
      <HoverCardContent
        align="end"
        className="w-[min(30rem,calc(100vw-2rem))] space-y-2 p-3 text-xs"
      >
        <div className="font-medium">Grade — how dangerous the change is</div>
        <ul className="space-y-1">
          {IMPACT_GRADE_ORDER.map((grade) => (
            <li key={grade} className="flex items-start gap-2">
              <Badge
                variant="outline"
                className={`w-16 justify-center ${GRADE_META[grade].toneClassName}`}
              >
                {GRADE_META[grade].label}
              </Badge>
              <span className="leading-snug">{GRADE_META[grade].meaning}</span>
            </li>
          ))}
          <li className="flex items-start gap-2">
            <Badge
              variant="outline"
              className="w-16 justify-center border-amber-500/40 text-amber-700 dark:text-amber-400"
            >
              unmeasured
            </Badge>
            <span className="leading-snug">
              The settings check could not run. Never read as clean, and never
              auto-advanced.
            </span>
          </li>
        </ul>
        <div className="pt-1 font-medium">Blocker — can this pin move at all</div>
        <ul className="space-y-1">
          {(Object.keys(BLOCKER_META) as Array<ImpactBlocker | "none">).map(
            (key) => (
              <li key={key} className="flex items-start gap-2">
                <Badge
                  variant="outline"
                  className={`w-24 shrink-0 justify-center ${BLOCKER_META[key].toneClassName}`}
                >
                  {BLOCKER_META[key].label}
                </Badge>
                <span className="leading-snug">
                  {BLOCKER_META[key].meaning}
                </span>
              </li>
            ),
          )}
        </ul>
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * The success measure at the top (B § Surface 3): stale-and-safe, near zero
 * when the tool is working — plus the grade counts and the withheld sentence.
 */
export function StandingImpactStrip({
  impact,
  error,
  loading,
  staleSafeCount,
  behindCounts,
  blockedBehind,
  onAdvanceAllGreen,
  busy,
}: {
  impact: StandingImpact | null;
  error: string | null;
  loading: boolean;
  staleSafeCount: number;
  behindCounts: Record<string, number>;
  blockedBehind: number;
  onAdvanceAllGreen: () => void;
  busy: boolean;
}) {
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-400">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-medium">
            Grades are unavailable — every row is unknown, not safe.
          </div>
          <div className="text-muted-foreground">{error}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
      <span className="inline-flex items-center gap-1.5">
        <BrainCircuit className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Behind latest &amp; safe to move</span>
        {loading || !impact ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (
          <span
            className={`text-sm font-semibold tabular-nums ${staleSafeCount === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}
          >
            {staleSafeCount}
          </span>
        )}
      </span>
      {impact ? (
        <>
          {IMPACT_GRADE_ORDER.slice()
            .reverse()
            .map((grade) => (
              <span key={grade} className="inline-flex items-center gap-1">
                <span
                  className={`h-2 w-2 rounded-full ${
                    grade === "red"
                      ? "bg-rose-500"
                      : grade === "orange"
                        ? "bg-amber-500"
                        : grade === "green"
                          ? "bg-emerald-500"
                          : "bg-muted-foreground/50"
                  }`}
                />
                <span className="text-muted-foreground">
                  {GRADE_META[grade].label}
                </span>
                <span className="tabular-nums">{behindCounts[grade] ?? 0}</span>
              </span>
            ))}
          <span className="text-muted-foreground">
            behind latest · {blockedBehind} blocked
          </span>
          {impact.withheldTotal > 0 ? (
            <span className="basis-full text-amber-700 dark:text-amber-400 sm:basis-auto">
              {impact.withheldTotal} rung{impact.withheldTotal === 1 ? "" : "s"}{" "}
              withheld
              {impact.withheldSentences.length > 0
                ? ` — ${impact.withheldSentences.join(" ")}`
                : ""}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 gap-1 text-xs"
            disabled={busy || staleSafeCount === 0}
            title="Every row that is green or identical, has no blocker, and the server marks eligible to auto-advance."
            onClick={onAdvanceAllGreen}
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            Advance all green ({staleSafeCount})
          </Button>
        </>
      ) : null}
    </div>
  );
}

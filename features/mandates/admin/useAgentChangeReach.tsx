"use client";

/**
 * THE POST-EDIT BADGE (Agent Change Impact, I6) — Arman's single-agent moment.
 *
 * "Imagine I'm working on an individual agent, and I've just modified the
 * system prompt… at that moment, I typically know if I've done something that
 * would break things or not. So if the system shows me… oh, yeah, this agent
 * is used in a mandate…" (MANDATE.md).
 *
 * After a successful save of an agent definition, ONE read through the
 * public door — `POST /mandates/impact/mine`, which answers only about the
 * mandates this person can already see (R31) — scoped to this agent WITH its
 * duplicated descendants (R4). Then:
 *   • ≥1 verdict → a NON-BLOCKING badge beside the save pill and a toast with
 *     a "Review" door. Both open the EXISTING batch panel (I5) scoped to this
 *     agent; there is no second panel body. Never a wall (R2).
 *   • 0 verdicts → nothing. The absence of a badge is the honest "this reaches
 *     no job you can see" — but what the server WITHHELD is still said, once,
 *     as a plain info toast, because a silent short answer is forbidden (R31).
 *   • a failed read → a dismissible notice carrying the server's sentence.
 *     Never silent: an unknown reach is not a clean one.
 *
 * Whether the badge also OPENS the panel by itself is an organization knob
 * (`agent_impact.post_edit_auto_open`, default off — opinions become knobs).
 *
 * AUTO-ADVANCE (I9): a second organization knob, `agent_impact.auto_advance_green`
 * (default OFF = nothing automatic, ever). ON means the rungs that meet EVERY
 * hard condition (`autoAdvanceVerdictOf`: green or identical, no blocker,
 * zero unexpected settings findings, capability check ran, no duplicate at a
 * higher grade, target older than the organization's minimum version age) are
 * advanced through the SAME advance route the batch panel uses, and the
 * result ANNOUNCES itself: a toast naming every pin that moved with a "Put
 * back" door that calls the same revert. Never silent, never a wall.
 */

import { Fragment, useState, type ReactNode } from "react";
import { Loader2, Radar } from "lucide-react";
import { TapTargetButton } from "@ai-matrx/tap-target";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import { useOpenAgentFindUsagesWindow } from "@/features/overlays/openers/agentFindUsagesWindow";
import {
  autoAdvanceCandidates,
  countBatchTiers,
  describeReach,
  fetchImpact,
  postAdvance,
  postRevert,
  reachFactsOf,
  readAutoAdvanceGreen,
  readPostEditAutoOpen,
  rungSuffixOf,
  summarizeAdvanceReport,
  versionsLabelOf,
  mergeAdvanceReports,
  splitWriteLegs,
  type AdvanceReport,
  type BatchTierCounts,
  type ImpactPosture,
  type ImpactVerdict,
  type ReachFacts,
  type StandingImpact,
  type WriteContext,
} from "./impact";
import type { AppDispatch } from "@/lib/redux/store";

/** What one post-save read decided — exported so a test can pin every branch. */
export type AgentReach =
  | { state: "reading" }
  | { state: "none"; withheldTotal: number; withheldSentences: string[] }
  | {
      state: "reached";
      counts: BatchTierCounts;
      sentence: string;
      impact: StandingImpact;
    }
  | { state: "failed"; why: string };

/**
 * The read, as a pure step: this agent, descendants walked, the public
 * posture. Throws nothing — a failure is a value the badge can show.
 */
export async function readAgentReach(
  dispatch: AppDispatch,
  agentId: string,
  context: WriteContext,
): Promise<AgentReach> {
  try {
    const impact = await fetchImpact(dispatch, [agentId], {
      includeDescendants: true,
      posture: "mine",
    });
    if (impact.verdicts.length === 0) {
      return {
        state: "none",
        withheldTotal: impact.withheldTotal,
        withheldSentences: impact.withheldSentences,
      };
    }
    // Counted the way THIS person can act (I12): their own personal pins are
    // movable through the owner lane; other people's are "not movable here".
    const counts = countBatchTiers(impact.verdicts, { context });
    return { state: "reached", counts, sentence: describeReach(counts), impact };
  } catch (error) {
    return {
      state: "failed",
      why: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Icon color only — no chip chrome. Red before check before quiet. */
export function reachToneClassName(counts: BatchTierCounts): string {
  if (counts.byTier.red > 0) return "text-rose-600 dark:text-rose-400";
  if (counts.byTier.drift > 0) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function ReachFactRows({ facts }: { facts: ReachFacts }): ReactNode {
  const rows: Array<[string, number]> = [
    ["Advance", facts.advance],
    ["Check", facts.check],
    ["Red", facts.red],
    ["Mandates", facts.mandates],
  ];
  if (facts.blocked > 0) rows.push(["Blocked", facts.blocked]);
  if (facts.current > 0) rows.push(["Current", facts.current]);
  return (
    <div className="grid grid-cols-[auto_minmax(2ch,auto)] gap-x-4 gap-y-0.5 font-mono text-[11px] leading-4">
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <span className="text-muted-foreground">{label}</span>
          <span className="text-right tabular-nums">{value}</span>
        </Fragment>
      ))}
    </div>
  );
}

const REACH_TOAST_MS = 20_000;
const AUTO_ADVANCE_TOAST_MS = 60_000;

/** What the auto-advance step decided — exported so a test can pin every branch. */
export type AutoAdvanceOutcome =
  | { state: "off" }
  | { state: "knob_unknown"; why: string }
  | { state: "no_candidates" }
  | { state: "advanced"; report: AdvanceReport; legs: AutoAdvanceLeg[]; candidates: ImpactVerdict[] }
  | { state: "failed"; why: string; candidates: ImpactVerdict[] };

/** One server batch behind the automatic move — the door it went through, so Put back uses the same one. */
export interface AutoAdvanceLeg {
  posture: ImpactPosture;
  batchId: string;
  report: AdvanceReport;
}

/**
 * The automatic step, as a pure function of the read: candidates by the hard
 * predicate, the knob, then the SAME writer the panel uses. Throws nothing.
 */
export async function autoAdvanceAfterSave(
  dispatch: AppDispatch,
  impact: StandingImpact,
  context: WriteContext,
  batchLabel: string,
): Promise<AutoAdvanceOutcome> {
  const knob = await readAutoAdvanceGreen();
  if (knob.state === "unknown") return { state: "knob_unknown", why: knob.why };
  if (!knob.value) return { state: "off" };
  // THE SAME LANES AS THE PANEL (R47): a super admin's OWN personal pins go
  // through the owner door (/mine), org/global rungs through the admin lane,
  // and another person's pin is never sent — `splitWriteLegs` drops it before
  // any request. One request per lane, shown as one batch.
  const legs = splitWriteLegs(autoAdvanceCandidates(impact.verdicts, context), context);
  const candidates = legs.flatMap((leg) => leg.verdicts);
  if (candidates.length === 0) return { state: "no_candidates" };
  try {
    const written: AutoAdvanceLeg[] = [];
    for (const leg of legs) {
      const report = await postAdvance(dispatch, leg.verdicts, batchLabel, leg.posture);
      written.push({ posture: leg.posture, batchId: report.batch_id, report });
    }
    const report = mergeAdvanceReports(written.map((leg) => leg.report));
    return { state: "advanced", report, legs: written, candidates };
  } catch (error) {
    return {
      state: "failed",
      why: error instanceof Error ? error.message : String(error),
      candidates,
    };
  }
}

/**
 * Put back EVERY leg of an automatic move through the door it went through
 * (a /mine batch cannot be reverted through the admin door, nor the reverse).
 * Never throws — each leg answers with its report or its failure sentence.
 */
export async function revertAutoAdvance(
  dispatch: AppDispatch,
  legs: readonly AutoAdvanceLeg[],
  batchLabel: string,
): Promise<{ reports: AdvanceReport[]; failures: string[] }> {
  const reports: AdvanceReport[] = [];
  const failures: string[] = [];
  for (const leg of legs) {
    if ((leg.report.counts?.advanced ?? 0) === 0) continue;
    try {
      reports.push(await postRevert(dispatch, leg.batchId, null, batchLabel, leg.posture));
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { reports, failures };
}

/** The announcement's lines: every pin that moved, from → to, in the batch's own words. */
export function describeAutoAdvance(
  report: AdvanceReport,
  candidates: readonly ImpactVerdict[],
): { title: string; lines: string[] } {
  const byRung = new Map(candidates.map((v) => [`${v.holder_kind}:${v.row_id}`, v]));
  const lines: string[] = [];
  for (const row of report.results ?? []) {
    const verdict = byRung.get(`${row.token.holder_kind}:${row.token.row_id}`);
    const name = row.mandate_key ?? verdict?.mandate_key ?? row.token.row_id;
    const versions = verdict ? ` ${versionsLabelOf(verdict)}` : "";
    const suffix = verdict ? rungSuffixOf(verdict) : "";
    lines.push(`${name}${suffix}${versions} — ${row.status}${row.status === "advanced" ? "" : `: ${row.reason ?? ""}`}`);
  }
  const advanced = report.counts?.advanced ?? 0;
  return {
    title: `Advanced ${advanced} green pin${advanced === 1 ? "" : "s"} automatically (${summarizeAdvanceReport(report)})`,
    lines,
  };
}

export function useAgentChangeReach(agentId: string) {
  const dispatch = useAppDispatch();
  const openFindUsagesWindow = useOpenAgentFindUsagesWindow();
  const [reach, setReach] = useState<AgentReach | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const actorUserId = useAppSelector(selectUserId);
  const writeContext: WriteContext = {
    posture: isSuperAdmin ? "admin" : "mine",
    actorUserId: actorUserId ?? null,
  };

  // ONE surface answers "where is this agent used and what did I just risk?":
  // the Find Usages window (mandates, derived agents, shortcuts, apps, … in one
  // table, graded). The badge and the toast's Review door open THAT — never a
  // second panel with its own rules. Version history and the quick test are
  // one click away inside it ("Compare versions & test").
  const openPanel = (_name: string | null) => openFindUsagesWindow({ agentId });

  /**
   * Call after a save has succeeded. Resolves when the read has answered; the
   * caller never awaits it on the save's critical path.
   */
  const announce = async (name: string | null): Promise<AgentReach> => {
    setAgentName(name);
    setReach({ state: "reading" });
    const result = await readAgentReach(dispatch, agentId, writeContext);
    setReach(result);
    if (result.state === "reached") {
      // I9 — the automatic move, BEFORE the review toast so the sentence the
      // person reads describes what is true after it ran.
      const auto = await autoAdvanceAfterSave(
        dispatch,
        result.impact,
        writeContext,
        `Auto-advance after edit of ${name ?? "agent"}`,
      );
      let countsNow = result.counts;
      if (auto.state === "advanced") {
        const { lines } = describeAutoAdvance(auto.report, auto.candidates);
        const advanced = auto.report.counts?.advanced ?? 0;
        const legs = auto.legs;
        const announce = advanced > 0 ? toast.success : toast.error;
        announce(`Moved ${advanced}`, {
          duration: AUTO_ADVANCE_TOAST_MS,
          description: lines.join("\n"),
          action:
            advanced > 0
              ? {
                  label: "Put back",
                  onClick: () => {
                    void revertAutoAdvance(
                      dispatch,
                      legs,
                      `Put back auto-advance after edit of ${name ?? "agent"}`,
                    ).then(({ reports, failures }) => {
                      const revert = reports.length > 0 ? mergeAdvanceReports(reports) : null;
                      const back = revert?.counts?.reverted ?? 0;
                      const lines = (revert?.results ?? []).map(
                        (row) => `${row.mandate_key ?? row.token.row_id}: ${row.status} — ${row.reason ?? ""}`,
                      );
                      if (failures.length > 0) {
                        lines.push(
                          `${failures.length} revert request${failures.length === 1 ? "" : "s"} failed: ${failures.join("; ")} — the batch is in its ledger and can be put back from the impact panel.`,
                        );
                      }
                      (back > 0 && failures.length === 0 ? toast.success : toast.error)(
                        `${back > 0 ? "Put back" : "Nothing put back"}${revert ? `: ${summarizeAdvanceReport(revert)}` : "."}`,
                        { description: lines.join(" · ") },
                      );
                    });
                  },
                }
              : undefined,
        });
        // The badge's counts describe the world AFTER the move.
        const after = await readAgentReach(dispatch, agentId, writeContext);
        setReach(after);
        if (after.state === "reached") countsNow = after.counts;
      } else if (auto.state === "failed") {
        toast.error(`Auto-advance failed`, {
          duration: AUTO_ADVANCE_TOAST_MS,
          description: `${auto.candidates.length} qualified · ${auto.why}`,
        });
      } else if (auto.state === "knob_unknown") {
        console.warn(
          `[agent-change-reach] agent_impact.auto_advance_green could not be read (${auto.why}); nothing was advanced automatically.`,
        );
      }
      const facts = reachFactsOf(countsNow);
      toast.info(`${facts.mandates} mandate${facts.mandates === 1 ? "" : "s"}`, {
        duration: REACH_TOAST_MS,
        description: <ReachFactRows facts={facts} />,
        action: { label: "Review", onClick: () => openPanel(name) },
      });
      const autoOpen = await readPostEditAutoOpen();
      if (autoOpen.state === "known" && autoOpen.value) {
        openPanel(name);
      } else if (autoOpen.state === "unknown") {
        // The knob could not be read: the badge and the toast still stand, so
        // the person loses nothing but the automatic open — said once, quietly.
        console.warn(
          `[agent-change-reach] agent_impact.post_edit_auto_open could not be read (${autoOpen.why}); the panel was not opened automatically.`,
        );
      }
    } else if (result.state === "failed") {
      toast.error(`Reach unknown`, {
        duration: REACH_TOAST_MS,
        description: result.why,
      });
    } else if (result.state === "none" && result.withheldTotal > 0) {
      toast.info(
        `0 visible · ${result.withheldTotal} hidden`,
        {
          duration: REACH_TOAST_MS,
          description: result.withheldSentences.join("\n") || undefined,
        },
      );
    }
    return result;
  };

  const badge =
    reach === null || reach.state === "none" ? null : reach.state === "reading" ? (
      <span className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground" title="Checking reach…">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </span>
    ) : reach.state === "failed" ? (
      <button
        type="button"
        onClick={() => setReach(null)}
        className="inline-flex h-6 w-6 items-center justify-center text-rose-600 dark:text-rose-400"
        title={reach.why}
        aria-label="Dismiss the reach notice"
      >
        <Radar className="h-3.5 w-3.5" />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => openPanel(agentName)}
        className={`inline-flex h-6 items-center gap-0.5 ${reachToneClassName(reach.counts)}`}
        title={reach.sentence}
        aria-label={reach.sentence}
        data-testid="agent-change-reach-badge"
      >
        <Radar className="h-3.5 w-3.5" />
        <span className="text-[10px] font-medium tabular-nums">{reach.counts.mandates}</span>
      </button>
    );

  // The mobile header is a fixed row of 44pt tap targets, so the chip above
  // would squeeze the mode pill. This is the same badge as ONE tap target: a
  // radar with the count in a bubble; tapping opens the scoped panel, and a
  // failed read is a red radar that tapping dismisses (the toast already
  // carried the sentence).
  const tapBadge =
    reach === null || reach.state === "none" || reach.state === "reading" ? null : (
      <div className="relative shrink-0" data-testid="agent-change-reach-tap">
        <TapTargetButton
          icon={
            <Radar
              className={`h-4 w-4 ${reach.state === "failed" ? "text-rose-600 dark:text-rose-400" : "text-primary"}`}
            />
          }
          ariaLabel={
            reach.state === "failed"
              ? `This change's reach is unknown: ${reach.why}. Tap to dismiss.`
              : `${reach.sentence}. Open the impact panel.`
          }
          tooltip={false}
          onClick={() => (reach.state === "failed" ? setReach(null) : openPanel(agentName))}
        />
        {reach.state === "reached" ? (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute -right-0.5 -top-0.5 text-[10px] font-semibold tabular-nums leading-none ${reachToneClassName(reach.counts)}`}
          >
            {reach.counts.mandates}
          </span>
        ) : null}
      </div>
    );

  return { reach, announce, badge, tapBadge } as const;
}

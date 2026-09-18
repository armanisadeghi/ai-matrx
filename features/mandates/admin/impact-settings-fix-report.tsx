"use client";

/**
 * What a settings fix (R13) did to the pins it touched — before → after, in
 * words, from the read that followed the save. A fix that changed no pile
 * says so (nothing silent); one that moved a row out of "Check settings"
 * says which pile it landed in.
 */

import { CheckCircle2, Loader2, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BATCH_TIER_META,
  batchTierOf,
  newestLabelOf,
  pinnedLabelOf,
  rungIdentityOf,
  settingsSignalOf,
  type BatchTier,
  type ImpactVerdict,
  type WriteContext,
} from "./impact";
import type { SettingsFixOutcome } from "./impact-settings-fix";

export interface SettingsFixRowBefore {
  rungId: string;
  mandateKey: string;
  tier: BatchTier;
  versions: string;
}

export interface SettingsFixRowAfter extends SettingsFixRowBefore {
  afterTier: BatchTier | null;
  afterVersions: string | null;
  /** The settings check's own sentence after the fix, when it still finds something. */
  stillFinds: string | null;
}

export interface SettingsFixReport {
  outcome: SettingsFixOutcome;
  /** The read epoch that must land before this fix can be settled. */
  settleEpoch: number;
  before: SettingsFixRowBefore[];
  /** Filled by `settleSettingsFix`. */
  after?: SettingsFixRowAfter[];
  /** The newest version the re-read shows for the agent (proof the save created one). */
  newestAfter?: number | null;
  changedPile?: boolean;
  sentence?: string;
}

const MOVABLE_TIERS: ReadonlySet<BatchTier> = new Set<BatchTier>(["safe", "drift", "red"]);

/** Compare the fix's rows before the save with the verdicts read after it. */
export function settleSettingsFix(
  fix: SettingsFixReport,
  verdicts: readonly ImpactVerdict[],
  options: { dryRun: boolean; context: WriteContext },
): Required<Pick<SettingsFixReport, "after" | "changedPile" | "sentence" | "newestAfter">> &
  SettingsFixReport {
  const byRung = new Map<string, ImpactVerdict>();
  for (const verdict of verdicts) byRung.set(rungIdentityOf(verdict.apply_token), verdict);
  let newestAfter: number | null = null;
  for (const verdict of verdicts) {
    if (verdict.agent_id === fix.outcome.agentId && verdict.latest_version_number != null) {
      newestAfter = Math.max(newestAfter ?? 0, verdict.latest_version_number);
    }
  }
  const after: SettingsFixRowAfter[] = fix.before.map((row) => {
    const verdict = byRung.get(row.rungId);
    if (!verdict) {
      return { ...row, afterTier: null, afterVersions: null, stillFinds: null };
    }
    const signal = settingsSignalOf(verdict);
    return {
      ...row,
      afterTier: batchTierOf(verdict, options),
      afterVersions: `${pinnedLabelOf(verdict)} → ${newestLabelOf(verdict)}`,
      stillFinds: signal.state === "clean" ? null : signal.sentence,
    };
  });
  const moved = after.filter((row) => row.afterTier !== null && row.afterTier !== row.tier);
  const changedPile = moved.length > 0;
  // The rows a person could act on before the fix; blocked/current rungs on
  // the same agent are counted, not listed, unless the fix moved one.
  const movable = after.filter((row) => MOVABLE_TIERS.has(row.tier));
  const others = after.length - movable.length;
  const othersSentence = others > 0 ? ` ${others} other rung${others === 1 ? "" : "s"} on this agent (not in this batch, or current) unchanged.` : "";
  const name = fix.outcome.agentName;
  const version =
    newestAfter != null
      ? `now v${newestAfter}`
      : `expected v${fix.outcome.expectedVersionNumber ?? "N+1"}`;
  const changes = fix.outcome.changes.join(", ");
  const sentence = changedPile
    ? `Fixed settings on ${name} (${version}: ${changes}) — ${moved.length} of ${movable.length} movable pin${movable.length === 1 ? "" : "s"} moved from ${BATCH_TIER_META[moved[0].tier].label} to ${BATCH_TIER_META[moved[0].afterTier ?? moved[0].tier].label}.${othersSentence}`
    : `Fixed settings on ${name} (${version}: ${changes}) — no pile changed: ${movable.length === 1 ? "the pin still grades" : "the pins still grade"} ${(movable.length > 0 ? movable : after).map((row) => `${row.afterTier ? BATCH_TIER_META[row.afterTier].label : "no longer in this read"}${row.stillFinds ? ` (${row.stillFinds})` : ""}`).join("; ")}. Open the agent, or advance anyway.${othersSentence}`;
  return { ...fix, after, newestAfter, changedPile, sentence };
}

export function SettingsFixReportCard({
  pending,
  reports,
  onDismiss,
}: {
  pending: readonly SettingsFixReport[];
  reports: readonly SettingsFixReport[];
  onDismiss: () => void;
}) {
  if (pending.length === 0 && reports.length === 0) return null;
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">Settings fixes</span>
        {reports.length > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 gap-1 px-1.5 text-[11px]"
            onClick={onDismiss}
            title="Hide these reports (the versions they created stay)."
          >
            <X className="h-3 w-3" /> Dismiss
          </Button>
        ) : null}
      </div>
      {pending.map((fix) => (
        <p key={`pending-${fix.outcome.agentId}-${fix.settleEpoch}`} className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saved the fix on {fix.outcome.agentName} ({fix.outcome.changes.join(", ")}) — grading its pins again…
        </p>
      ))}
      {reports.map((report, index) => (
        <div key={`${report.outcome.agentId}-${report.settleEpoch}-${index}`} className="space-y-0.5">
          <p className={`flex items-start gap-1.5 ${report.changedPile ? "" : "text-amber-700 dark:text-amber-400"}`}>
            <CheckCircle2 className={`mt-0.5 h-3 w-3 shrink-0 ${report.changedPile ? "text-emerald-500" : "text-amber-500"}`} />
            <span>{report.sentence}</span>
          </p>
          {report.after && report.after.filter((row) => MOVABLE_TIERS.has(row.tier) || row.afterTier !== row.tier).length > 1 ? (
            <ul className="ml-5 space-y-0.5 font-mono text-[11px] text-muted-foreground">
              {report.after.filter((row) => MOVABLE_TIERS.has(row.tier) || row.afterTier !== row.tier).map((row) => (
                <li key={row.rungId}>
                  {row.mandateKey}: {BATCH_TIER_META[row.tier].label} → {row.afterTier ? BATCH_TIER_META[row.afterTier].label : "no longer in this read"}
                  {row.afterVersions ? ` (${row.afterVersions})` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}

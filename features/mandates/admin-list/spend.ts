// features/mandates/admin-list/spend.ts
//
// PURE: the admin mandate list's COST columns (Arman, 2026-10-08: "points and
// actual dollar amounts for a given period").
//
// THE SOURCE is the usage ledger's own declared definition `ai_usage` (the
// hourly rollup the usage explorer reads), asked through the one read door
// `platform.drill_ask` in the platform lane — never a parallel spend pipeline.
// A mandate run is tagged with the feature `mandate:<key>`, so ONE question
// (by feature, the chosen period) answers every mandate at once (measured
// 2026-10-08 on live: ~200 ms, 441 feature groups for 30 days).
//
// Points are dollars at the `billing.points_per_usd` rate (components/cost),
// exactly as every other admin cost column shows them.

import type { DrillAnswer, DrillQuestion } from "@ai-matrx/records";
import {
  MATRX_DRILL_WINDOW_PRESETS,
  drillWindowRange,
} from "@ai-matrx/design-system/data-table";

/** The feature tag a mandate run carries in the ledger. */
export const MANDATE_FEATURE_PREFIX = "mandate:";

/** The URL parameter that holds the period. */
export const SPEND_PERIOD_PARAM = "period";

export const DEFAULT_SPEND_PERIOD = "30d";

/** The period choices: the drill window presets (Today … Last 12 months). */
export const SPEND_PERIODS = MATRX_DRILL_WINDOW_PRESETS;

/** The door's page ceiling; past it groups fold into Other. */
const ONE_PAGE = 1000;

/** The period the address names, or the default for anything it does not know. */
export function parseSpendPeriod(raw: string | null | undefined): string {
  return raw && SPEND_PERIODS.some((preset) => preset.key === raw) ? raw : DEFAULT_SPEND_PERIOD;
}

/**
 * The one question: cost by feature over the period. The window starts on the
 * hour (UTC) — the rollup counts whole hours — and ends now.
 */
export function spendQuestion(period: string, now: Date = new Date()): DrillQuestion {
  const range = drillWindowRange(period, now) ?? drillWindowRange(DEFAULT_SPEND_PERIOD, now);
  const from = new Date(range?.from ?? now.toISOString());
  from.setUTCMinutes(0, 0, 0);
  return {
    by: ["feature"],
    show: ["cost"],
    where: {},
    lane: "platform",
    limit: ONE_PAGE,
    sort: { key: "cost", direction: "desc" },
    window: { key: "at", from: from.toISOString(), to: range?.to ?? now.toISOString() },
  };
}

export interface MandateSpend {
  /** Mandate key → dollars over the period. A key absent here spent nothing. */
  byKey: Record<string, number>;
  /** The door folded groups past its cap into Other — absent keys are not "nothing". */
  folded: boolean;
}

/** The answer → dollars per mandate key. An unreadable cost is left out, never zero-filled. */
export function mandateSpendFromAnswer(answer: Pick<DrillAnswer, "rows">): MandateSpend {
  const byKey: Record<string, number> = {};
  let folded = false;
  for (const row of answer.rows) {
    if (row.kind === "other") {
      folded = true;
      continue;
    }
    if (row.kind !== "group") continue;
    const feature = row.groups?.feature;
    if (typeof feature !== "string" || !feature.startsWith(MANDATE_FEATURE_PREFIX)) continue;
    const key = feature.slice(MANDATE_FEATURE_PREFIX.length);
    const raw = row.measures?.cost;
    const usd = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (!key || !Number.isFinite(usd)) continue;
    byKey[key] = (byKey[key] ?? 0) + usd;
  }
  return { byKey, folded };
}

/**
 * The Model cell: the default Holder's model first (the database puts it
 * there; "Workflow" for a workflow Holder), every other model a binding runs
 * on behind it. `null` = the database answer carried no models.
 */
export function modelCellOf(
  models: readonly string[] | null | undefined,
): { primary: string; others: string[] } | null {
  if (!models || models.length === 0) return null;
  const [primary, ...others] = models;
  return { primary, others };
}

/**
 * features/files/storage-meter/summary.ts
 *
 * THE STORAGE METER'S ONE DERIVATION — pure, so it can be proven.
 *
 * Folder-sync D11: storage limits come from ONE resolver,
 * `billing.resolve_capability`, metered to the ORGANIZATION. The client-side
 * spelling of that resolver is `billing.plan_status(p_org)`, whose every
 * dimension is literally `resolve_capability(user, capability, org)` — so the
 * plan NAME and the storage LIMIT on this screen come from the same read, and
 * neither can drift from the other.
 *
 * What this file forbids, by construction:
 *   - a limit that did not come from billing (the retired `files.account_tiers`
 *     ladder used to supply 5.0 GB while billing's Free was 512 MB);
 *   - a plan name shown when the plan read failed (it fell back to
 *     `account_tiers.tier_name` and nothing said so);
 *   - a percentage over a number nobody measured.
 *
 * The one thing that IS still provisional is the GRAIN, and it says so on
 * screen: `public.apply_usage_delta` is keyed on the user and writes
 * `files.user_storage_usage(user_id, …)`, so the measured bytes are this
 * person's files, not the whole organization's. SPEC-SERVER §8's amendment
 * permits that grain until FS-L6 re-grains the ledger, and requires that
 * "metering is on" and "metering is at the right grain" never be read as one
 * sentence. {@link GRAIN_NOTE} is that second sentence.
 */

import { formatFileSize } from "@ai-matrx/kit/format";

/** The billing capability that carries the storage ceiling. */
export const STORAGE_CAPABILITY = "platform.storage_bytes";

/** Where a person buys more storage — the one purchasable surface today. */
export const PLAN_PAGE_HREF = "/pricing";

/**
 * The grain disclosure. Shown whenever a measured number is shown, because the
 * number is per-user and the limit is per-organization (SPEC-SERVER §8
 * amendment, 2026-09-13). Delete this the day FS-L6 re-grains the ledger.
 */
export const GRAIN_NOTE =
  "Counts the files you own. Everyone else's files in this organization are not in this number yet.";

/** What the billing read gave us, or why it gave us nothing. */
export type PlanInput =
  | { status: "loading" }
  | { status: "unreadable"; reason: string }
  | {
      status: "read";
      /** `null` when billing holds no plan row for this organization. */
      planName: string | null;
      /** Bytes, or `null` for an unlimited plan. From `resolve_capability`. */
      limitBytes: number | null;
      /** True when the capability is not in this plan's dimension list. */
      missingDimension: boolean;
    };

/** What the measured ledger gave us, or why it gave us nothing. */
export type UsageInput =
  | { status: "loading" }
  | { status: "unreadable"; reason: string }
  /** No ledger row exists — nobody has measured this account. */
  | { status: "unmeasured" }
  | { status: "read"; bytesUsed: number; measuredAt: string | null };

export type MeterSeverity =
  | "unmeasured"
  | "ok"
  | "warning"
  | "critical"
  | "over";

export type StorageMeter =
  | { kind: "loading" }
  /**
   * Nothing true can be said yet. `title` and `detail` are the sentence; the
   * meter draws no bar and no percentage, and offers Retry.
   */
  | { kind: "unreadable"; title: string; detail: string }
  | {
      kind: "ready";
      /** Billing's plan name, or null when billing holds no plan for the org. */
      planName: string | null;
      /** The headline shown beside the plan name, e.g. "1.1 GB of 10 GB". */
      headline: string;
      /** The one sentence under the bar. */
      detail: string;
      /** Always present when a measured number is shown (SPEC-SERVER §8). */
      grain: string | null;
      bytesUsed: number | null;
      limitBytes: number | null;
      fraction: number | null;
      percent: number | null;
      severity: MeterSeverity;
      /** True when the person should be sent to the plan page. */
      offerMoreStorage: boolean;
    };

/**
 * The whole meter, from the two reads. No `Date.now()`, no fetch, no fallback
 * ladder — if billing did not answer, the answer is `unreadable`.
 */
export function summarizeOrgStorage(input: {
  plan: PlanInput;
  usage: UsageInput;
}): StorageMeter {
  const { plan, usage } = input;

  if (plan.status === "loading" || usage.status === "loading")
    return { kind: "loading" };

  if (plan.status === "unreadable")
    return {
      kind: "unreadable",
      title: "Your plan's storage limit could not be read",
      detail: `Nothing is wrong with your files — the plan service did not answer (${plan.reason}). Try again; the limit shown anywhere else on this page would be a guess, so none is shown.`,
    };

  if (plan.status === "read" && plan.missingDimension)
    return {
      kind: "unreadable",
      title: "This plan does not list a storage limit",
      detail: `Billing answered for this organization but its plan carries no ${STORAGE_CAPABILITY} row, so there is no ceiling to show. Your files are unaffected.`,
    };

  if (usage.status === "unreadable")
    return {
      kind: "unreadable",
      title: "Your storage usage could not be read",
      detail: `The usage ledger did not answer (${usage.reason}). Try again — a number from anywhere else would not be a measurement.`,
    };

  const limitBytes = plan.limitBytes;
  const limitLabel = limitBytes === null ? null : formatFileSize(limitBytes);

  if (usage.status === "unmeasured")
    return {
      kind: "ready",
      planName: plan.planName,
      headline: limitLabel ? `— of ${limitLabel}` : "— used",
      detail:
        "Nobody has measured this account's storage yet, so there is no number to show. It appears as soon as the usage ledger is built.",
      grain: null,
      bytesUsed: null,
      limitBytes,
      fraction: null,
      percent: null,
      severity: "unmeasured",
      offerMoreStorage: false,
    };

  const bytesUsed = usage.bytesUsed;
  const usedLabel = formatFileSize(bytesUsed);

  if (limitBytes === null)
    return {
      kind: "ready",
      planName: plan.planName,
      headline: `${usedLabel} used`,
      detail: "This plan has no storage ceiling.",
      grain: GRAIN_NOTE,
      bytesUsed,
      limitBytes: null,
      fraction: null,
      percent: null,
      severity: "ok",
      offerMoreStorage: false,
    };

  const ratio = limitBytes > 0 ? bytesUsed / limitBytes : 0;
  const fraction = Math.min(ratio, 1);
  const percent = Math.round(ratio * 100);
  const over = bytesUsed > limitBytes;
  const severity: MeterSeverity = over
    ? "over"
    : ratio >= 0.95
      ? "critical"
      : ratio >= 0.8
        ? "warning"
        : "ok";

  return {
    kind: "ready",
    planName: plan.planName,
    headline: `${usedLabel} of ${limitLabel}`,
    detail: over
      ? `You are over the ${limitLabel} this plan includes by ${formatFileSize(bytesUsed - limitBytes)}. Nothing has been deleted; add storage or move to a larger plan.`
      : `${percent}% of the ${limitLabel} this plan includes.`,
    grain: GRAIN_NOTE,
    bytesUsed,
    limitBytes,
    fraction,
    percent,
    severity,
    offerMoreStorage: over || severity === "critical",
  };
}

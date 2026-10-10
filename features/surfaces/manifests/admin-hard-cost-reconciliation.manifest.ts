/**
 * Surface manifest — Hard-cost reconciliation (`matrx-admin/hard-cost-reconciliation`).
 *
 * `/administration/usage/reconciliation`: per run x window x provider, what the vendor says it charged,
 * what our ledger recorded, the points charged against the points expected, and the drift. Rows are
 * `billing.hard_cost_reconciliation`, written by the `hard_cost_reconciliation` system task. Read-only:
 * no write target and no fixed AI job. This page used to borrow the usage explorer's surface
 * (`matrx-admin/ai-usage`), whose values describe a different screen, so an agent here read nothing true.
 */

import type { SurfaceManifest, SurfaceScopePayload, SurfaceValue, SurfaceValueGroup } from "@ai-matrx/chat/surfaces/types";
import { MATRX_WEB_APP_EXECUTOR } from "@ai-matrx/chat/surfaces/executor";

export const ADMIN_HARD_COST_RECONCILIATION_SURFACE_NAME = "matrx-admin/hard-cost-reconciliation";

const groups: SurfaceValueGroup[] = [{ key: "reconciliation", label: "Reconciliation", sortOrder: 100 }];

const values: SurfaceValue[] = [
  {
    name: "reconciliation_summary",
    label: "Reconciliation (latest per window and provider)",
    description:
      'The newest run for each window and provider as one XML bundle: <reconciliation runs total_rows ok drift unverifiable shown?> with one <row window from provider status vendor_usd recorded_usd drift_usd drift_pct points_charged points_expected uncharged_rows run>findings</row> per window and provider. Money is dollars; vendor_usd is absent when the vendor reports nothing (status unverifiable). status is ok, drift or unverifiable. Absent while loading or when load_error is set.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    inlineUpTo: 7000,
    group: "reconciliation",
    sortOrder: 100,
  },
  {
    name: "row_count",
    label: "Rows loaded",
    description: "How many reconciliation rows the page holds in all (every run, every window and provider). 0 when none have run yet. Absent while loading or on a failed read.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "reconciliation",
    sortOrder: 110,
  },
  {
    name: "load_error",
    label: "Load error",
    description: "Why the reconciliation could not be read (the database's own words). Present only on a failed read; then no rows or counts are supplied.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "reconciliation",
    sortOrder: 190,
  },
];

export const adminHardCostReconciliationManifest: SurfaceManifest = {
  surfaceName: ADMIN_HARD_COST_RECONCILIATION_SURFACE_NAME,
  client: "matrx-admin",
  executor: MATRX_WEB_APP_EXECUTOR,
  executionMode: "python-stream",
  description: "Super-admin hard-cost reconciliation: vendor-reported spend against our ledger and the points charged, per window and provider.",
  readiness: "partial",
  readinessNote: "Manifest, registry and runtime emitter are wired; the focused DB sync and independent certification remain.",
  label: "Hard-cost reconciliation",
  urlPattern: "/administration/usage/reconciliation",
  intro: `<surface_intro>
This is an ADMIN surface: the hard-cost reconciliation. Each row compares, for one window and provider, what the vendor says it charged (vendor_usd) with what our ledger recorded (recorded_usd) and the points we charged with the points that cost converts to.

status "drift" means vendor and ledger disagree (drift_usd, drift_pct); "unverifiable" means the vendor reports nothing to compare with — not that the numbers are fine. Read reconciliation_summary first; row_count is every row ever written, the summary only the newest per window and provider.

This surface is read-only: explain and diagnose the figures, never imply that a charge, a ledger or a vendor bill was changed.
</surface_intro>`,
  groups,
  values,
  skipBaselineValues: true,
};

export function createHardCostReconciliationScope(scope: {
  reconciliation_summary?: string;
  row_count?: number;
  load_error?: string;
}): SurfaceScopePayload {
  return scope as SurfaceScopePayload;
}

// features/mandates/admin-list/surface-scope.ts
//
// PURE: the `matrx-admin/mandates` surface scope built from the admin list's
// loaded page — what an agent working beside the list reads (mandate count,
// the page's mandates, the health roll-up, the unhealthy ones). The list is
// server-paged, so the summaries are the page on screen and `mandate_count` is
// the query's total.

import { isBehindLatest } from "@/features/mandates/admin/impact";
import type {
  MandateSummary,
  MandatesHealthSummary,
} from "@/features/surfaces/manifests/mandates.manifest";
import type { MandateAdminRow } from "./types";

/** One list row → the manifest's summary shape. */
export function toMandateSummary(row: MandateAdminRow): MandateSummary {
  return {
    id: row.id,
    mandate_key: row.mandateKey,
    label: row.label,
    agent_name: row.agentName,
    pin: row.pinLabel,
    drift: row.drift,
    health: row.health,
    code_truth_drift: row.codeTruth?.drift ?? null,
    bound_agent_drift: row.codeTruth?.bound_agent_drift ?? null,
    code_variables: row.codeTruth?.code_variables ?? [],
    bound_agent_variables: row.codeTruth?.bound_agent?.declared_variables ?? [],
    input_kind: row.inputKind,
    output_kind: row.outputKind,
    overrides_count: row.overridesCount,
    is_enabled: row.isEnabled,
    is_placeholder: row.isPlaceholder,
  };
}

/** The health roll-up over the rows on screen. */
export function healthSummaryOf(rows: readonly MandateAdminRow[]): MandatesHealthSummary {
  const health: MandatesHealthSummary = {
    ok: 0,
    behind_latest: 0,
    agent_archived: 0,
    not_a_system_agent: 0,
    unresolved_pin: 0,
    code_agent_drift: 0,
    code_contract_drift: 0,
    code_truth_import_failed: 0,
    no_holder_yet: 0,
  };
  for (const row of rows) {
    if (row.defaultVerdict && isBehindLatest(row.defaultVerdict)) health.behind_latest += 1;
    if (row.health === "ok") health.ok += 1;
    else if (row.health === "no Mandate Holder yet") health.no_holder_yet += 1;
    else if (row.health === "code ↔ agent drift") health.code_agent_drift += 1;
    else if (row.health === "code ↔ contract drift") health.code_contract_drift += 1;
    else if (row.health === "code truth import failed") health.code_truth_import_failed += 1;
    else if (row.health === "agent archived") health.agent_archived += 1;
    else if (row.health === "unresolved pin") health.unresolved_pin += 1;
    else health.not_a_system_agent += 1;
  }
  return health;
}

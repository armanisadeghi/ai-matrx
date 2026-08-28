// features/admin/hr/jurisdiction-rules/service.ts
//
// The browser half of the D25 jurisdiction-rules admin doors.
//
// 🚨 THE `hr` SCHEMA IS NOT EXPOSED TO PostgREST. Never `.schema("hr")` — every
// door is a `public.hr_*` SECURITY DEFINER function reached through
// `supabase.rpc`. This is still the DIRECT lane (React → Supabase); no Next.js
// API route, no Python hop.
//
// 🚨 A REFUSAL IS DATA, NOT AN EXCEPTION. `{granted:false, reason:…}` comes back
// as `{state:"refused"}` and is rendered in place. Nothing here throws — not on
// a refusal, not on a network rejection (`supabase.rpc` REJECTS on a dropped
// connection, and an escaping rejection would leave a page spinning forever
// with nothing on screen).

import { supabase } from "@/utils/supabase/client";

import {
  type JurisdictionAdminLoad,
  type JurisdictionRule,
  type JurisdictionRuleCitation,
  type JurisdictionRuleClass,
  type JurisdictionRuleFixture,
  type JurisdictionRuleOverdue,
  type JurisdictionRuleStatus,
  type JurisdictionRuleStatusChange,
  type JurisdictionSetStatusResult,
  type JurSeedProgress,
} from "./types";

type Row = Record<string, unknown>;

function asRow(value: unknown): Row | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Row)
    : null;
}

function asRows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((item): item is Row => asRow(item) !== null)
    : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function req(value: unknown, fallback: string): string {
  return str(value) ?? fallback;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function count(value: unknown): number {
  return num(value) ?? 0;
}

function bool(value: unknown): boolean {
  return value === true;
}

function strList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function mapCitation(value: unknown): JurisdictionRuleCitation | null {
  const row = asRow(value);
  if (!row) return null;
  return {
    authority: str(row.authority),
    title: str(row.title),
    url: str(row.url),
    retrieved_at: str(row.retrieved_at),
    verified_by: str(row.verified_by),
    verified_at: str(row.verified_at),
    confidence: str(row.confidence) ?? (num(row.confidence)?.toString() ?? null),
  };
}

function mapStatus(value: unknown): JurisdictionRuleStatus {
  const raw = str(value);
  return raw === "draft" ||
    raw === "advisory" ||
    raw === "active" ||
    raw === "superseded"
    ? raw
    : "draft";
}

function mapFixture(row: Row): JurisdictionRuleFixture {
  return {
    code: req(row.code, "—"),
    title: str(row.title),
    expected_status: str(row.expected_status),
    pinned: bool(row.pinned),
  };
}

function mapStatusChange(row: Row): JurisdictionRuleStatusChange {
  return {
    at: str(row.at),
    by: str(row.by),
    from: str(row.from),
    to: str(row.to),
    reason: str(row.reason),
    citation_at_change: mapCitation(row.citation_at_change),
  };
}

function mapClass(row: Row): JurisdictionRuleClass {
  return {
    id: req(row.id, ""),
    slug: req(row.slug, ""),
    label: req(row.label, req(row.slug, "Unnamed class")),
    description: str(row.description),
    precedence_mode: str(row.precedence_mode),
    org_configurable: str(row.org_configurable),
    produces_money: bool(row.produces_money),
    absence_semantics: str(row.absence_semantics),
    consumer_engines: row.consumer_engines ?? null,
    is_active: row.is_active !== false,
    parameter_schema: row.parameter_schema ?? null,
  };
}

function mapRule(row: Row): JurisdictionRule {
  return {
    id: req(row.id, ""),
    rule_class: req(row.rule_class, ""),
    rule_class_label: req(row.rule_class_label, req(row.rule_class, "—")),
    produces_money: bool(row.produces_money),
    jurisdiction_key: req(row.jurisdiction_key, "—"),
    jurisdiction_name: str(row.jurisdiction_name),
    jurisdiction_level: str(row.jurisdiction_level),
    effective_from: str(row.effective_from),
    effective_to: str(row.effective_to),
    status: mapStatus(row.status),
    basis: str(row.basis),
    citation: mapCitation(row.citation),
    verification_due: str(row.verification_due),
    version: num(row.version),
    source_scope: str(row.source_scope),
    organization_id: str(row.organization_id),
    applicability: row.applicability ?? null,
    parameters: row.parameters ?? null,
    unverified_keys: strList(row.unverified_keys),
    jur_seed_task: str(row.jur_seed_task),
    status_history: asRows(row.status_history).map(mapStatusChange),
    supersedes_id: str(row.supersedes_id),
    correction_of_id: str(row.correction_of_id),
    fixtures: asRows(row.fixtures).map(mapFixture),
  };
}

function mapSeedProgress(row: Row): JurSeedProgress {
  return {
    jur_seed_task: req(row.jur_seed_task, "—"),
    rows_total: count(row.rows_total),
    rows_active: count(row.rows_active),
    rows_advisory: count(row.rows_advisory),
    rows_draft: count(row.rows_draft),
    rows_with_unverified_keys: count(row.rows_with_unverified_keys),
    rows_overdue: count(row.rows_overdue),
    next_verification_due: str(row.next_verification_due),
    task_complete: bool(row.task_complete),
  };
}

function mapOverdue(row: Row): JurisdictionRuleOverdue {
  return {
    rule_id: req(row.rule_id, ""),
    rule_version: num(row.rule_version),
    rule_class: req(row.rule_class, ""),
    rule_class_label: req(row.rule_class_label, req(row.rule_class, "—")),
    jurisdiction_key: req(row.jurisdiction_key, "—"),
    jurisdiction_name: str(row.jurisdiction_name),
    status: req(row.status, "—"),
    jur_seed_task: str(row.jur_seed_task),
    verification_due: str(row.verification_due),
    days_overdue: count(row.days_overdue),
    basis: str(row.basis),
    citation: mapCitation(row.citation),
    organization_id: str(row.organization_id),
  };
}

/** One RPC round trip, never throwing. */
async function callDoor(
  fn: string,
  args: Record<string, unknown>,
  whatFailed: string,
): Promise<
  | { kind: "payload"; payload: Row }
  | { kind: "failed"; message: string; technical: string | null }
> {
  let data: unknown = null;
  let error: { code?: string; message?: string } | null = null;
  try {
    ({ data, error } = (await supabase.rpc(fn as never, args as never)) as {
      data: unknown;
      error: { code?: string; message?: string } | null;
    });
  } catch (thrown) {
    return {
      kind: "failed",
      message: `${whatFailed} did not reach the server.`,
      technical: thrown instanceof Error ? thrown.message : String(thrown),
    };
  }

  if (error) {
    return {
      kind: "failed",
      message: `${whatFailed} could not be completed.`,
      technical: error.message ?? error.code ?? null,
    };
  }

  const payload = asRow(data);
  if (!payload) {
    return {
      kind: "failed",
      message: `${whatFailed} came back in a shape this app does not understand.`,
      technical: null,
    };
  }
  return { kind: "payload", payload };
}

/** Route 85 / 85a / 85b read door. Superadmin-only, refuses as data. */
export async function loadJurisdictionRulesAdminData(): Promise<JurisdictionAdminLoad> {
  const result = await callDoor(
    "hr_jurisdiction_rules_admin_data",
    {},
    "The employment-law rule library",
  );
  if (result.kind === "failed") {
    return {
      state: "failed",
      message: result.message,
      technical: result.technical,
    };
  }
  const payload = result.payload;
  if (payload.granted === false) {
    return {
      state: "refused",
      reason: req(payload.reason, "refused"),
      detail: str(payload.detail),
    };
  }
  return {
    state: "ok",
    data: {
      classes: asRows(payload.classes).map(mapClass),
      rules: asRows(payload.rules).map(mapRule),
      seedProgress: asRows(payload.seed_progress).map(mapSeedProgress),
      overdue: asRows(payload.overdue).map(mapOverdue),
    },
  };
}

/**
 * THE promote/demote door (D25). The caller must already have shown the
 * citation and basis on screen and collected a sign-off reason — the database
 * refuses a promotion without one (`reason_required`), and `promotion_blocked`
 * carries the §6.1 fixture gate's own words, which the UI renders verbatim.
 */
export async function setJurisdictionRuleStatus(
  ruleId: string,
  newStatus: JurisdictionRuleStatus,
  reason: string,
): Promise<JurisdictionSetStatusResult> {
  const result = await callDoor(
    "hr_jurisdiction_rule_set_status",
    { p_rule_id: ruleId, p_new_status: newStatus, p_reason: reason },
    "The status change",
  );
  if (result.kind === "failed") {
    return {
      state: "failed",
      message: result.message,
      technical: result.technical,
    };
  }
  const payload = result.payload;
  if (payload.granted === false) {
    return {
      state: "refused",
      reason: req(payload.reason, "refused"),
      detail: str(payload.detail),
    };
  }
  return {
    state: "ok",
    ruleId: req(payload.rule_id, ruleId),
    status: mapStatus(payload.status),
    version: num(payload.version),
  };
}

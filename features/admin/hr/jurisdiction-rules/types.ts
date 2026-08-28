// features/admin/hr/jurisdiction-rules/types.ts
//
// Wire types for the D25 jurisdiction-rules admin doors
// (migrations/hr_l9_00_jurisdiction_rules_admin_doors.sql).
//
// 🚨 These types describe what the doors ACTUALLY send. The `hr` schema is not
// PostgREST-exposed and every return is `jsonb`, so `supabase gen types` knows
// nothing about them: nothing here is checked by the compiler against the
// database. The service maps the payload field by field rather than casting it,
// so a field that is missing on the wire arrives as `null`/`[]` here instead of
// silently rendering as `undefined` on a page.

export type JurisdictionRuleStatus =
  | "draft"
  | "advisory"
  | "active"
  | "superseded";

/** The transitions `hr.jurisdiction_rule_set_status` will accept. */
export const ALLOWED_STATUS_TRANSITIONS: ReadonlyArray<
  readonly [JurisdictionRuleStatus, JurisdictionRuleStatus]
> = [
  ["draft", "advisory"],
  ["draft", "active"],
  ["advisory", "active"],
  ["active", "advisory"],
  ["advisory", "draft"],
];

export function allowedTransitionsFrom(
  status: string,
): JurisdictionRuleStatus[] {
  return ALLOWED_STATUS_TRANSITIONS.filter(([from]) => from === status).map(
    ([, to]) => to,
  );
}

export interface JurisdictionRuleCitation {
  authority: string | null;
  title: string | null;
  url: string | null;
  retrieved_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  confidence: string | null;
}

export interface JurisdictionRuleFixture {
  code: string;
  title: string | null;
  expected_status: string | null;
  pinned: boolean;
}

export interface JurisdictionRuleStatusChange {
  at: string | null;
  by: string | null;
  from: string | null;
  to: string | null;
  reason: string | null;
  citation_at_change: JurisdictionRuleCitation | null;
}

export interface JurisdictionRuleClass {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  precedence_mode: string | null;
  org_configurable: string | null;
  produces_money: boolean;
  absence_semantics: string | null;
  consumer_engines: unknown;
  is_active: boolean;
  parameter_schema: unknown;
}

export interface JurisdictionRule {
  id: string;
  rule_class: string;
  rule_class_label: string;
  produces_money: boolean;
  jurisdiction_key: string;
  jurisdiction_name: string | null;
  jurisdiction_level: string | null;
  effective_from: string | null;
  effective_to: string | null;
  status: JurisdictionRuleStatus;
  basis: string | null;
  citation: JurisdictionRuleCitation | null;
  verification_due: string | null;
  version: number | null;
  source_scope: string | null;
  organization_id: string | null;
  applicability: unknown;
  parameters: unknown;
  unverified_keys: string[];
  jur_seed_task: string | null;
  status_history: JurisdictionRuleStatusChange[];
  supersedes_id: string | null;
  correction_of_id: string | null;
  fixtures: JurisdictionRuleFixture[];
}

export interface JurSeedProgress {
  jur_seed_task: string;
  rows_total: number;
  rows_active: number;
  rows_advisory: number;
  rows_draft: number;
  rows_with_unverified_keys: number;
  rows_overdue: number;
  next_verification_due: string | null;
  task_complete: boolean;
}

export interface JurisdictionRuleOverdue {
  rule_id: string;
  rule_version: number | null;
  rule_class: string;
  rule_class_label: string;
  jurisdiction_key: string;
  jurisdiction_name: string | null;
  status: string;
  jur_seed_task: string | null;
  verification_due: string | null;
  days_overdue: number;
  basis: string | null;
  citation: JurisdictionRuleCitation | null;
  organization_id: string | null;
}

export interface JurisdictionRulesAdminData {
  classes: JurisdictionRuleClass[];
  rules: JurisdictionRule[];
  seedProgress: JurSeedProgress[];
  overdue: JurisdictionRuleOverdue[];
}

/**
 * A refusal is DATA. Every caller renders one of these three states; nothing on
 * this surface throws when the database says no.
 */
export type JurisdictionAdminLoad =
  | { state: "ok"; data: JurisdictionRulesAdminData }
  | { state: "refused"; reason: string; detail: string | null }
  | { state: "failed"; message: string; technical: string | null };

export type JurisdictionSetStatusResult =
  | {
      state: "ok";
      ruleId: string;
      status: JurisdictionRuleStatus;
      version: number | null;
    }
  | { state: "refused"; reason: string; detail: string | null }
  | { state: "failed"; message: string; technical: string | null };

/**
 * The California PTO-payout `excludes` key. §6.1 withholds the payout AMOUNT
 * while this task is incomplete, so the verification board calls it out by name
 * rather than leaving it as one row among many.
 */
export const CA_PTO_PAYOUT_SEED_TASK = "JUR-SEED-9";

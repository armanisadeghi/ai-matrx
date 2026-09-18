// GENERATED — do not edit by hand.
//
// Every `platform.feature_knob` row with `value_type = 'enum'`: the exact
// `allowed_values` the settings picker offers, and the `default_value` a
// reader falls back to. Regenerate with
// `pnpm generate:knob-enum-vocabularies`; `pnpm check:knob-enum-vocabularies`
// FAILS when this file no longer matches the live database.
//
// 🚨 A FEATURE NEVER RETYPES ONE OF THESE LISTS. Derive the union from here
// (`KnobEnumValue<"seo.topical_map.default_view">`) so the types cannot
// disagree with the rows the admin is actually choosing between. On
// 2026-09-17 three topical-map vocabularies had drifted this way, and the
// reader RAISED on a legal value instead of degrading — an admin choosing
// `bulk_action_confirm = never` would have blanked every map screen.

export interface KnobEnumVocabulary {
  readonly allowed: readonly string[];
  readonly default: string;
}

export const KNOB_ENUM_VOCABULARIES = {
  "cloud_browser.checkpoint.reverify_mode": { allowed: ["full", "hash_only", "background"], default: "hash_only" },
  "commerce.intake.gate1_mode": { allowed: ["exceptions_only", "every_item"], default: "exceptions_only" },
  "commerce.intake.grading_standard": { allowed: ["r2v3", "cosmetic_abc", "custom"], default: "r2v3" },
  "commerce.labels.default_template": { allowed: ["avery-5160", "avery-5163", "avery-5164", "avery-22806", "avery-22807"], default: "avery-5163" },
  "commerce.labels.qr_ec_level": { allowed: ["L", "M", "Q"], default: "M" },
  "commerce.pipeline.processing_mode": { allowed: ["batch", "instant", "deadline"], default: "batch" },
  "commerce.printer_certification.failed_printer_behavior": { allowed: ["warn", "block"], default: "warn" },
  "connectors.shared_account.member_default_level": { allowed: ["viewer", "commenter", "editor", "admin"], default: "editor" },
  "extensibility.custom_fields.ai_exposure_default": { allowed: ["allowed", "aggregate_only", "never"], default: "allowed" },
  "extensibility.custom_fields.validation_mode": { allowed: ["advisory", "strict"], default: "advisory" },
  "google.rollout.read_only_sweep_phase": { allowed: ["internal_test", "available"], default: "internal_test" },
  "hitl.google.agent_import": { allowed: ["mode_1", "mode_2", "mode_3", "mode_4", "mode_5"], default: "mode_4" },
  "hitl.google.attended_file_write": { allowed: ["mode_1", "mode_2", "mode_3", "mode_4", "mode_5"], default: "mode_1" },
  "hitl.google.unattended_file_write": { allowed: ["mode_1", "mode_2", "mode_3", "mode_4", "mode_5"], default: "mode_4" },
  "hr.access.comp_visibility_for_managers": { allowed: ["none", "band_only"], default: "none" },
  "hr.approvals.address_change_approver": { allowed: ["hr_admin", "hr_owner", "manager"], default: "hr_admin" },
  "hr.approvals.sole_authority_mode_default": { allowed: ["auto_record", "require_second_actor"], default: "require_second_actor" },
  "hr.approvals.top_of_chart_approver": { allowed: ["org_owner", "hr_owner"], default: "org_owner" },
  "hr.domain_wide.ai_sensitivity_ceiling_default": { allowed: ["public", "internal", "confidential"], default: "internal" },
  "hr.domain_wide.tasks_default_scope_employee": { allowed: ["mine", "team", "queue"], default: "mine" },
  "hr.domain_wide.tasks_default_scope_hr": { allowed: ["mine", "team", "queue"], default: "queue" },
  "hr.domain_wide.tasks_default_scope_manager": { allowed: ["mine", "team", "queue"], default: "team" },
  "hr.hiring.ai_screening_posture": { allowed: ["recommend", "review_and_comment", "off"], default: "review_and_comment" },
  "hr.jurisdiction_rules.config_violation_action": { allowed: ["reject", "warn"], default: "reject" },
  "hr.jurisdiction_rules.missing_fact_behavior": { allowed: ["fail", "flag"], default: "fail" },
  "hr.jurisdiction_rules.recompute_posture": { allowed: ["open_period_auto", "always_manual"], default: "open_period_auto" },
  "hr.leave.accrual_run_cadence": { allowed: ["daily", "per_pay_period"], default: "daily" },
  "hr.leave.ai_balance_query_posture": { allowed: ["apply_final", "recommend", "review_and_comment", "off"], default: "apply_final" },
  "hr.leave.ai_policy_qa_posture": { allowed: ["apply_final", "recommend", "review_and_comment", "off"], default: "apply_final" },
  "hr.leave.day_hours_basis": { allowed: ["scheduled_shift", "fte_standard_day"], default: "scheduled_shift" },
  "hr.leave.holiday_inside_leave": { allowed: ["excluded", "counted"], default: "excluded" },
  "hr.leave.negative_balance_settlement": { allowed: ["write_off", "deduct_from_final_pay"], default: "write_off" },
  "hr.onboarding.access_shutoff_mode": { allowed: ["immediate", "end_of_day", "scheduled"], default: "immediate" },
  "hr.relations.incident_escalation_target": { allowed: ["org_owner", "named_employment", "external_investigator"], default: "org_owner" },
  "hr.scheduling.ai_draft_posture": { allowed: ["apply_final", "recommend", "review_and_comment", "off"], default: "recommend" },
  "hr.scheduling.ai_fill_posture": { allowed: ["apply_final", "recommend", "review_and_comment", "off"], default: "recommend" },
  "hr.scheduling.expired_credential": { allowed: ["block", "warn", "ignore"], default: "block" },
  "hr.scheduling.ot_would_trigger": { allowed: ["block", "warn", "ignore"], default: "warn" },
  "hr.time_and_attendance.export_format_default": { allowed: ["quickbooks_online", "quickbooks_iif", "gusto_csv", "adp_csv", "generic_csv", "json"], default: "generic_csv" },
  "hr.time_and_attendance.ip_verification_mode": { allowed: ["off", "warn", "block"], default: "off" },
  "hr.time_and_attendance.kiosk_cross_location_punch": { allowed: ["allow", "allow_with_flag", "block"], default: "allow_with_flag" },
  "hr.time_and_attendance.kiosk_time_authority": { allowed: ["server", "device"], default: "server" },
  "hr.time_and_attendance.remote_worker_validation": { allowed: ["none", "attest", "geo"], default: "attest" },
  "hr.time_and_attendance.rounding_mode": { allowed: ["nearest", "up"], default: "nearest" },
  "hr.time_and_attendance.workweek_start_day": { allowed: ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"], default: "sunday" },
  "hr.workflow.inbox_default_sort": { allowed: ["due_at asc", "activated_at asc", "priority desc"], default: "due_at asc" },
  "masterwork.capture_plan.cadence": { allowed: ["daily", "weekdays", "every_other_day", "weekly"], default: "daily" },
  "masterwork.capture_plan.reminder_channel": { allowed: ["preferences", "in_app", "email", "sms", "off"], default: "preferences" },
  "masterwork.capture_plan.stop_rule": { allowed: ["yield_flat", "coverage_met", "either", "horizon_only"], default: "either" },
  "masterwork.interview.context_mode": { allowed: ["auto", "primed", "blank_slate"], default: "auto" },
  "masterwork.review.vocabulary": { allowed: ["auto", "standard", "ownership"], default: "auto" },
  "masterwork.triad_game.default_mode": { allowed: ["best_one", "odd_one_out"], default: "best_one" },
  "meet.guest_record_access": { allowed: ["none", "summary", "full"], default: "summary" },
  "records.confirmation.agent_context": { allowed: ["labeled", "confirmed_only", "exclude"], default: "confirmed_only" },
  "seo.rank_tracking.default_device": { allowed: ["desktop", "mobile"], default: "desktop" },
  "seo.rank_tracking.default_provider": { allowed: ["brave", "serpapi"], default: "brave" },
  "seo.topical_map.bulk_action_confirm": { allowed: ["always", "above_n", "never"], default: "above_n" },
  "seo.topical_map.default_view": { allowed: ["outline", "table", "graph", "text"], default: "outline" },
  "seo.topical_map.description_regeneration_mode": { allowed: ["automatic", "queued", "manual"], default: "queued" },
  "seo.topical_map.detail_panel": { allowed: ["window", "drawer"], default: "window" },
  "seo.topical_map.geography_branch_policy": { allowed: ["refuse", "propose_as_facet", "allow"], default: "refuse" },
  "seo.topical_map.intent_review_mode": { allowed: ["one_by_one", "accept_all", "batch"], default: "one_by_one" },
  "seo.topical_map.map_agent_change_mode": { allowed: ["apply", "propose", "ask"], default: "propose" },
  "seo.topical_map.outline_detail": { allowed: ["labels", "counts", "counts_snippet"], default: "labels" },
  "seo.topical_map.proposal_mode": { allowed: ["auto_apply", "approval", "auto_apply_initial"], default: "auto_apply_initial" },
  "seo.topical_map.proposal_review_mode": { allowed: ["one_by_one", "accept_all", "reject_all", "batch"], default: "one_by_one" },
  "seo.topical_map.region_value_evidence": { allowed: ["confirmed_only", "confirmed_and_inferred"], default: "confirmed_only" },
  "seo.topical_map.topic_agent_change_mode": { allowed: ["apply", "propose", "ask"], default: "apply" },
  "shape_system.structured_document.optional_fields": { allowed: ["omit", "note", "show"], default: "omit" },
  "tables.density.mode": { allowed: ["condensed", "normal", "spacious"], default: "normal" },
  "tables.pagination.mode": { allowed: ["scroll", "manual"], default: "scroll" },
  "ui.detail.default_presentation": { allowed: ["window", "docked", "page"], default: "window" },
  "workflow.conductor.apply_mode": { allowed: ["auto", "review"], default: "auto" },
} as const satisfies Readonly<Record<string, KnobEnumVocabulary>>;

export type KnobEnumAddress = keyof typeof KNOB_ENUM_VOCABULARIES;

/** The union of legal values for one enum knob, straight from its row. */
export type KnobEnumValue<A extends KnobEnumAddress> =
  (typeof KNOB_ENUM_VOCABULARIES)[A]["allowed"][number];

/**
 * Narrow a live knob value onto its row's vocabulary. Returns null — never
 * throws — when the value is outside it: an unknown value is a real problem to
 * REPORT, and a screen that dies on one punishes the admin for a choice the
 * picker offered. Callers report it and fall back to
 * `KNOB_ENUM_VOCABULARIES[address].default`.
 */
export function asKnobEnumValue<A extends KnobEnumAddress>(
  address: A,
  value: string,
): KnobEnumValue<A> | null {
  const vocabulary = KNOB_ENUM_VOCABULARIES[address];
  return (vocabulary.allowed as readonly string[]).includes(value)
    ? (value as KnobEnumValue<A>)
    : null;
}

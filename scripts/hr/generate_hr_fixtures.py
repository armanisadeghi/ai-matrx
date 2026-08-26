#!/usr/bin/env python3
"""Generate SPEC-CONTRACTS §6.4's mock fixture set.

    cd /Users/armanisadeghi/code/aidream && \
      uv run python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/generate_hr_fixtures.py
    ... --check     # rebuild and diff without writing (the §7.3 drift gate)

§6.4: **four fixtures per endpoint, minimum — happy, empty, error, edge** — living at
`features/hr/__fixtures__/<family>/<operation>.<case>.json` and loaded by BOTH the mock transport
and the client tests, *"so a fixture that drifts from the contract breaks a test rather than
quietly misleading a UI."*

HOW THE FOUR CASES ARE PRODUCED, AND WHY IT IS NOT 240 HAND-TYPED FILES
-----------------------------------------------------------------------
`happy` and `empty` are SYNTHESIZED FROM THE STUB'S OWN RESPONSE SCHEMA
(`aidream/hr-contracts.openapi.json`). That is the whole point: a hand-typed body drifts from the
contract silently, and §6.4's stated reason for the fixture set is to make drift loud. Synthesizing
means the fixture is shape-correct by construction, and re-running this after a §7 amendment
re-renders every affected body.

  happy — every optional field populated, because *"a UI built only against minimal responses
          breaks on real data."*
  empty — the designed zero case: `line_count: 0`, `[]`, nulls where nullable. *"The empty state is
          a designed screen, not an accident."*

`error` is the §1.3 envelope for that family's most likely failure, with the real error code and
the real HTTP status from the §1.3 table.

`edge` is the ONE case §6.4 lists per family, and these are HAND-AUTHORED because each is *"a real
defect this program has already reasoned about"* — the whole value is in the specific numbers.
Seventeen are mandatory; five of them have a row in `hr.jurisdiction_rule_test` and are RENDERED
FROM THAT ROW rather than hand-typed (§6.4's closing paragraph), so the client's mock and the
server's test assert the same numbers by construction. A fixture whose row is
`expected_status='pending_verification'` gets a `"__pending_verification": true` marker, *"so nobody
builds a screen that depends on an unverified number looking final."*

statement_cache_size=0 is required — the host is pgbouncer in transaction pooling mode.
"""
import asyncio, json, os, sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

load_dotenv("/Users/armanisadeghi/code/aidream/.env")

STUB = Path("/Users/armanisadeghi/code/aidream/hr-contracts.openapi.json")
ROOT = Path("/Users/armanisadeghi/code/matrx-frontend/features/hr/__fixtures__")

# Stable, obviously-fake identifiers. Never a real org, never a real person.
ORG = "00000000-0000-4000-8000-00000000hr01".replace("hr", "ab")
UID = "00000000-0000-4000-8000-0000000000{:02d}"


def _uuid(n):
    return UID.format(n % 100)


# --------------------------------------------------------------- schema -> example value
def synth(schema, case, seed=1, key=""):
    """Emit a value conforming to an OpenAPI schema.

    `case` is "happy" (populate everything) or "empty" (the designed zero state).
    """
    if schema is None:
        return None
    if "$ref" in schema:
        name = schema["$ref"].rsplit("/", 1)[-1]
        return synth(COMPONENTS[name], case, seed, key)
    if "anyOf" in schema:
        branches = schema["anyOf"]
        nullable = any(b.get("type") == "null" for b in branches)
        real = [b for b in branches if b.get("type") != "null"]
        if case == "empty" and nullable:
            return None
        return synth(real[0] if real else branches[0], case, seed, key)
    if "enum" in schema:
        return schema["enum"][0]

    t = schema.get("type")
    if t == "object":
        props = schema.get("properties") or {}
        if not props:
            return {}
        out = {}
        required = set(schema.get("required") or [])
        for i, (name, sub) in enumerate(props.items()):
            if case == "empty" and name not in required:
                # The zero state still declares required fields; optional ones drop away.
                continue
            out[name] = synth(sub, case, seed + i, name)
        return out
    if t == "array":
        if case == "empty":
            return []
        return [synth(schema.get("items") or {}, case, seed, key)]
    if t == "boolean":
        return schema.get("default", False if case == "empty" else True)
    if t == "integer":
        return 0 if case == "empty" else _int_for(key, seed)
    if t == "number":
        return 0 if case == "empty" else round(8.0 + seed * 0.25, 2)
    if t == "null":
        return None
    # string
    return _str_for(key, schema, case, seed)


def _int_for(key, seed):
    table = {"line_count": 1184, "total": 4, "signed": 3, "outstanding": 1, "declined": 0,
             "member_count": 4, "sent": 4, "skipped": 0, "employments_included": 288,
             "export_version": 1, "rule_version": 3, "position": 1, "max_uses": 1,
             "grace_minutes": 15, "relative_cost_band": 2, "expires_in_days": 14}
    return table.get(key, 1 + seed)


def _str_for(key, schema, case, seed):
    fmt = schema.get("format")
    if fmt == "uuid":
        return _uuid(seed)
    if fmt == "date":
        return "2026-03-17"
    if fmt == "date-time":
        return "2026-03-17T18:04:11Z"
    table = {
        "organization_id": ORG, "request_id": "0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f",
        "execution_id": "7f2b1c90-55aa-4e12-8b31-99d0e7c41a02",
        "status": "queued", "poll": "/runtime/operations/0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f",
        "events": "/runtime/executions/7f2b1c90-55aa-4e12-8b31-99d0e7c41a02/events/stream",
        "jurisdiction_key": "US-CA-LOS_ANGELES", "class": "overtime", "earning_code": "OT",
        "total_hours": "9422.75", "total_amount": "241880.12", "hours": "8.00",
        "amount": "292.50", "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "artifact_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "delivery_state": "generated", "export_format": "generic_csv", "key": "generic_csv",
        "label": "Generic CSV", "media_type": "text/csv",
        "version": "3984be1", "seam": "background_check", "provider_key": "noop_adapter",
        "display_name": "No-op adapter (v1 round-trip)", "connector_kind": "manual",
        "envelope_type": "policy_acknowledgment", "subject": "Employee Handbook 2026",
        "full_name": "Jordan Rivera", "email": "jordan.rivera@example.invalid",
        "name": "Employee Handbook 2026.pdf", "title": "Line Cook",
        "reason": "corrected three punches on 2026-03-17",
        "rationale": "available, credentialed, 18h this week, no rest conflict",
        "message": "Los Angeles Fair Workweek parameters are unverified; predictability pay omitted.",
        "code": "advisory_rule", "fact": "employer_fte_avg_prior_year",
        "signature": "MEUCIQD" + "x" * 57, "public_key_id": "esign-ed25519-2026-01",
        "apply_url": "https://aimatrx.com/careers/acme/openings/line-cook",
        "candidate_portal_url": "https://aimatrx.com/portal/#tok",
        "secret": "REDACTED-IN-FIXTURES-returned-exactly-once",
        "verification_factor": "email_code", "purpose": "signature",
        "identity_hint": "j***@example.invalid",
        "acknowledgement_ref": "QBO-2026-03-IMPORT-4471",
        "confirmation_ref": "CA-EDD-20260401-88213",
        "slug": "acme", "locale": "en-US", "apply_mode": "hosted",
        "csp_nonce": "n0nc3-fixture-only", "submission_method": "state_portal",
        "state": "sent", "our_state": "returned", "external_status": "complete",
        "result_summary": "clear", "event_type": "signer_signed", "actor_kind": "user",
        "kind": "document_hash", "objective": "coverage", "posture_applied": "recommend",
        "rule": "min_rest_hours", "severity": "block", "format": "pdf",
        "failure_reason": "portal rejected the batch: EIN mismatch",
        "reason_summary": "criminal record requires individualized assessment",
        "decision_note": "individualized assessment completed; candidate responded",
        "justification": "verifying identity for I-9 reverification per audit request",
        "expected_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "observed_sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        "week_start_local_date": "2026-03-15", "employment_type": "full_time",
        "location": "Los Angeles, CA", "compensation_range": "$22–$26 / hour",
        "description": "Prepare and plate dishes on the hot line.",
        "download_url": "https://cdn.aimatrx.com/hr/exports/fixture.csv",
        "signed_url": "https://cdn.aimatrx.com/hr/exports/fixture.csv?sig=fixture",
        "cdn_url": "https://cdn.aimatrx.com/hr/exports/fixture.csv",
        "source": "hr.work_interval.hours", "parameter": "increment_minutes",
        "floor": "15", "submitted": "30", "actor_ref": "user:jordan.rivera",
        "phone": "+1-555-0100", "recipient": "Bank of Example, Lending Dept",
        "package_key": "standard_criminal", "external_ref": "PRV-88213",
        "note": "fixture", "notes": "Full line grain, our own identifiers, no mapping required.",
    }
    if key in table:
        return table[key]
    if case == "empty":
        return ""
    return f"{key or 'value'}-{seed}"


# --------------------------------------------------------------- the error case per family
FAMILY_ERROR = {
    "rules": (422, "hr_incomplete_facts",
              "A required applicability fact is missing for rule class minors-hours.",
              "We need the employee's date of birth before we can check the minors rules.",
              {"incomplete": [{"class": "minors-hours", "fact": "worker_age_years"}]}),
    "calc": (422, "hr_incomplete_facts",
             "A required applicability fact is missing for rule class minors-hours.",
             "We need one more detail before we can finish this calculation.",
             {"incomplete": [{"class": "minors-hours", "fact": "worker_age_years"}]}),
    "time": (423, "hr_period_locked",
             "Write against a locked pay period 8f2c1a90-…; corrections are time_adjustment rows.",
             "This pay period is locked. We can record a correction that lands in the next period.",
             {"pay_period_id": "8f2c1a90-4b3d-4c2e-9a10-2f7b6c5d4e3a", "state": "locked"}),
    "accruals": (422, "hr_unlawful_config",
                 "hr.validate_org_config rejected the org's carryover parameters.",
                 "This carryover policy is not lawful in California.",
                 {"class": "pto-carryover-legality", "jurisdiction_key": "US-CA"}),
    "schedule": (422, "hr_incomplete_facts",
                 "Minors rules are not seeded for US-CA; scheduling a 16-year-old cannot be validated.",
                 "We can't check this schedule against the minors rules yet.",
                 {"incomplete": [{"class": "minors-hours", "fact": "worker_age_years"}]}),
    "exports": (409, "hr_state_conflict",
                "Pay period is 'open'; an export requires 'approved' or later.",
                "This pay period has not been approved yet.",
                {"state": "open"}),
    "providers": (424, "hr_provider_unavailable",
                  "The provider did not answer within the retry policy.",
                  "The background-check provider isn't responding. You can record the result manually instead.",
                  {"provider_key": "noop_adapter", "fallback": "path='manual' via POST /hr/providers/{seam}/results"}),
    "background_checks": (400, "hr_validation_error",
                          "FCRA gate: disclosure_presented_at and authorized_at must both be set, in that order.",
                          "We need the candidate's disclosure and authorization before running this check.",
                          {"missing": ["disclosure_presented_at", "authorized_at"]}),
    "statutory": (400, "hr_validation_error",
                  "The employer profile has no EIN; a new-hire report cannot be generated without one.",
                  "Add your EIN in employer settings before generating new-hire reports.",
                  {"missing": ["employer_profile.ein"]}),
    "identity": (403, "hr_capability_denied",
                 "hr.capability(user,'ssn.reveal',employment) is false.",
                 "You don't have permission to reveal Social Security numbers.",
                 {"capability": "ssn.reveal"}),
    "careers": (404, "not_found",
                "No careers portal is enabled for this organization slug.",
                "This careers page isn't available.",
                {}),
    "esign": (409, "hr_state_conflict",
              "Envelope is already 'sent'; a second send does not re-freeze or re-notify. Use remind.",
              "This envelope has already been sent.",
              {"state": "sent"}),
}


def error_fixture(family):
    status, code, msg, user_msg, details = FAMILY_ERROR[family]
    return status, {
        "error": code, "message": msg, "user_message": user_msg,
        "details": details,
        "request_id": "0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f",
    }


# --------------------------------------------------------------- §6.4's 17 mandatory edges
# (operation_id, slot, status, builder) — `builder` takes the dict of rendered jurisdiction rows.
def edge_cases():
    return [
        ("hr_calc_overtime", "edge", 200, from_rule_fixture(
            "OT-CA-01", "One 13-hour California day: 8 regular + 4 OT@1.5 + 1 DT@2.0.",
            lambda exp: {
                "hours_regular": exp["hours"]["regular"],
                "hours_overtime": exp["hours"]["ot_1_5"],
                "hours_doubletime": exp["hours"]["dt_2_0"],
                "weighted_average_regular_rate": "25.000000",
                "lines": [
                    {"earning_code": "REG", "hours": exp["hours"]["regular"], "rate": "25.000000",
                     "amount": "200.00", "work_date": "2026-03-16", "work_interval_ids": [_uuid(1)]},
                    {"earning_code": "OT", "hours": exp["hours"]["ot_1_5"], "rate": "37.500000",
                     "amount": "150.00", "work_date": "2026-03-16", "work_interval_ids": [_uuid(1)]},
                    {"earning_code": "DT", "hours": exp["hours"]["dt_2_0"], "rate": "50.000000",
                     "amount": "50.00", "work_date": "2026-03-16", "work_interval_ids": [_uuid(1)]},
                ],
            })),
        ("hr_calc_overtime", "edge2", 200, from_rule_fixture(
            "OT-BOUND-01",
            "Semimonthly boundary workweek, 46 hours split 20/26 across two pay periods. The 6 OT "
            "hours are computed on the WHOLE workweek, never on either period's subtotal, and are "
            "attributed to the period containing the workweek's END date. workweek_id rides every "
            "export line so payroll can reconcile.",
            lambda exp: {
                "hours_regular": exp["hours"]["regular"],
                "hours_overtime": exp["hours"]["ot_1_5"],
                "hours_doubletime": 0,
                "weighted_average_regular_rate": "22.000000",
                "attributed_pay_period_key": exp["attributed_pay_period_key"],
                "workweek_id": _uuid(7),
                "lines": [
                    {"earning_code": "OT", "hours": exp["hours"]["ot_1_5"], "rate": "33.000000",
                     "amount": "198.00", "work_date": "2026-04-04",
                     "work_interval_ids": [_uuid(7)], "workweek_id": _uuid(7),
                     "pay_period_key": exp["attributed_pay_period_key"]},
                ],
            })),
        ("hr_calc_predictability_pay", "edge", 200, from_rule_fixture(
            "FW-CHI-01",
            "An ADVISORY Fair Workweek rule. The money field is ABSENT from result — not zero, not "
            "a guess — and flags[] carries advisory_rule. §1.3 rule 3: /hr/calc/* returns "
            "200-with-flag because the caller wants the non-money parts of the result.",
            lambda exp: {
                "covered": exp["covered"],
                "change_flagged": exp["change_flagged"],
                "days_notice": 3,
                "ordinance_jurisdiction": exp["ordinance_jurisdiction"],
                # NOTE: no predictability_pay_amount key AT ALL. Its absence is the assertion.
            },
            flags=[{"code": "advisory_rule", "class": "fair-workweek",
                    "rule_id": _uuid(31), "jurisdiction_key": "US-IL-CHICAGO",
                    "message": "Chicago Fair Workweek parameters are unverified; predictability pay omitted."}],
            jurisdiction="US-IL-CHICAGO")),
        ("hr_calc_leave_accrual", "edge", 200, from_rule_fixture(
            "MIN-01",
            "§6.4's '/hr/calc/* (any) — incomplete[] non-empty for minors-hours'. The fact is "
            "missing, the rule is NOT silently treated as unmet, and the caller must collect it "
            "(SPEC-JURISDICTION §2.7).",
            lambda exp: {"accrued_hours": "5.766667", "blocking_warning": exp["blocking_warning"]},
            incomplete=[{"class": "minors-hours", "fact": "worker_age_years"}],
            jurisdiction="US-CA")),
        ("hr_calc_i9_deadlines", "edge", 200, from_rule_fixture(
            "I9-FED-03",
            "A FEDERAL holiday inside the Section-2 window extends it; the employer's own closure "
            "does NOT — an employer's closure does not move a federal deadline. "
            "pending_verification until JUR-SEED-8.",
            lambda exp: {
                "section1_due_on": "2026-04-09",
                "section2_due_on": exp["section2_due_date"],
                "reverification_due_on": None,
                "business_day_calendar": exp["business_day_calendar"],
                "org_holiday_calendar_consulted": exp["org_holiday_calendar_consulted"],
            },
            jurisdiction="US")),

        ("hr_time_recompute", "edge", 200, static_edge(
            "§1.5 — `partial` is a REAL TERMINAL STATE, not a rounding of succeeded. A run that "
            "finished 410 of 412 workweeks produced 410 correct answers and 2 that must be SEEN. "
            "A run reported complete with a non-empty failed_units is NOT a success.",
            {"request_id": "0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f",
             "execution_id": "7f2b1c90-55aa-4e12-8b31-99d0e7c41a02",
             "status": "partial",
             "poll": "/runtime/operations/0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f",
             "events": "/runtime/executions/7f2b1c90-55aa-4e12-8b31-99d0e7c41a02/events/stream",
             "submitted_at": "2026-03-17T18:04:11Z",
             "result": {
                 "workweeks_recomputed": 410, "work_intervals_written": 5108,
                 "work_intervals_superseded": 4995, "snapshots_written": 410,
                 "changed_workweek_ids": [_uuid(11), _uuid(12)], "exceptions_raised": 7,
                 "failed_units": [
                     {"workweek_id": _uuid(88), "error": "hr_advisory_rule_blocks_money",
                      "message": "fair-workweek rule for US-IL-CHICAGO is advisory"},
                     {"workweek_id": _uuid(89), "error": "hr_incomplete_facts",
                      "message": "minors-hours requires worker_age_years"},
                 ]}})),

        ("hr_accruals_run", "edge", 200, static_edge(
            "clamped_by_statute > 0 — a statutory sick-leave floor overrode org policy for 12 "
            "enrollments. The clamp is recorded in each snapshot's clamps[], never applied silently.",
            {"request_id": "0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f",
             "execution_id": "7f2b1c90-55aa-4e12-8b31-99d0e7c41a02",
             "status": "succeeded",
             "poll": "/runtime/operations/0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f",
             "events": "/runtime/executions/7f2b1c90-55aa-4e12-8b31-99d0e7c41a02/events/stream",
             "submitted_at": "2026-03-31T02:00:00Z",
             "result": {"enrollments_processed": 288, "ledger_entries_written": 288,
                        "hours_accrued": "1441.50", "clamped_by_statute": 12,
                        "skipped_ineligible": 4,
                        "clamps_sample": [{"class": "sick-leave-floor", "from": "0.0192",
                                           "to": "0.0333",
                                           "reason": "statutory floor exceeds org policy"}]}})),

        ("hr_schedule_autofill", "edge", 200, static_edge(
            "D11 — unfilled[] non-empty AND a BLOCKING minors conflict with reason 'incomplete'. "
            "Minors' hour restrictions are seeded, not built: when no rule resolves the answer is a "
            "blocking conflict, NEVER a silent 'unrestricted'.",
            {"request_id": "0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f",
             "execution_id": "7f2b1c90-55aa-4e12-8b31-99d0e7c41a02",
             "status": "partial",
             "poll": "/runtime/operations/0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f",
             "events": "/runtime/executions/7f2b1c90-55aa-4e12-8b31-99d0e7c41a02/events/stream",
             "submitted_at": "2026-03-17T18:04:11Z",
             "result": {
                 "assignments": [
                     {"shift_id": _uuid(21), "employment_id": _uuid(41), "confidence": 0.86,
                      "rationale": "available, credentialed, 18h this week, no rest conflict",
                      "relative_cost_band": 2, "would_trigger_overtime": False}],
                 "unfilled": [{"shift_id": _uuid(22),
                               "reason": "no credentialed employee available"}],
                 "conflicts": [{"shift_id": _uuid(23), "employment_id": _uuid(42),
                                "rule": "minors-hours", "severity": "block",
                                "reason": "incomplete"}],
                 "projected_labor_amount": "18422.75",
                 "ai_evidence_id": _uuid(51), "posture_applied": "recommend"}})),

        ("hr_schedule_autofill", "edge2", 200, static_edge(
            "SPEC-SCHEDULING SD-6 — two candidates on ONE shift with DIFFERENT relative_cost_band "
            "values and NO money field anywhere in assignments[]. An earlier draft returned a "
            "per-assignment projected_cost; divided by the shift's hours that IS the individual's "
            "pay rate, so it handed compensation data to every scheduling manager. The band is an "
            "ordinal, carries no amount, no rate and no unit, and is not invertible to one. "
            "projected_labor_amount stays because a whole-draft total exposes nobody.",
            {"request_id": "0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f",
             "execution_id": "7f2b1c90-55aa-4e12-8b31-99d0e7c41a02",
             "status": "succeeded",
             "poll": "/runtime/operations/0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f",
             "events": "/runtime/executions/7f2b1c90-55aa-4e12-8b31-99d0e7c41a02/events/stream",
             "submitted_at": "2026-03-17T18:04:11Z",
             "result": {
                 "assignments": [
                     {"shift_id": _uuid(21), "employment_id": _uuid(41), "confidence": 0.91,
                      "rationale": "available, credentialed, 12h this week",
                      "relative_cost_band": 1, "would_trigger_overtime": False},
                     {"shift_id": _uuid(21), "employment_id": _uuid(42), "confidence": 0.74,
                      "rationale": "available, credentialed, 33h this week",
                      "relative_cost_band": 4, "would_trigger_overtime": True}],
                 "unfilled": [], "conflicts": [],
                 "projected_labor_amount": "18422.75",
                 "ai_evidence_id": _uuid(51), "posture_applied": "recommend"}})),

        ("hr_exports_payroll_create", "edge", 422, static_edge(
            "§4.4 / §1.3 rule 3 — an EXPORT REFUSES; it does not omit the amount. A payroll file "
            "with a silently-missing premium is the exact failure this rule exists to prevent. "
            "(Contrast /hr/calc/*, which returns 200-with-flag.)",
            {"error": "hr_advisory_rule_blocks_money",
             "message": "fair-workweek rule 8f2c… for US-IL-CHICAGO is advisory; predictability pay cannot be exported",
             "user_message": "We can't build this payroll file yet — a Chicago scheduling rule is still awaiting verification.",
             "details": {"class": "fair-workweek", "rule_id": _uuid(31),
                         "jurisdiction_key": "US-IL-CHICAGO",
                         "affected_employment_ids": [_uuid(41), _uuid(42)]},
             "request_id": "0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f"})),

        ("hr_exports_payroll_create", "edge2", 400, static_edge(
            "§4.3 — requires_mapping is the honest half of every integration. No external system "
            "knows our employee_number, so an unmapped identifier is a 400 with details.unmapped[] "
            "rather than a file with blanks in the identifier column. A payroll file with a missing "
            "employee id is WORSE than no file: it fails silently downstream, in someone else's "
            "system, after money moved.",
            {"error": "hr_validation_error",
             "message": "2 employments have no external_employee_id for format quickbooks_online",
             "user_message": "Two people still need a QuickBooks employee ID before this file can be built.",
             "details": {"unmapped": [
                 {"employment_id": _uuid(41), "field": "external_employee_id"},
                 {"employment_id": _uuid(42), "field": "external_employee_id"}]},
             "request_id": "0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f"})),

        ("hr_exports_supersede", "edge", 409, static_edge(
            "§4.5 — THE ONE RULE THAT PREVENTS DOUBLE PAYMENT. An acknowledged export can never be "
            "superseded, regenerated or re-sent. Once payroll has taken the file the only "
            "correction path is a time_adjustment row that lands in the NEXT export, tagged to the "
            "original period.",
            {"error": "hr_export_already_acknowledged",
             "message": "Export 1 was acknowledged 2026-03-18T09:12:00Z (ref QBO-2026-03-IMPORT-4471); a re-export double-pays.",
             "user_message": "Payroll already accepted this file. Corrections go on the next payroll run instead.",
             "details": {"export_id": _uuid(61), "export_version": 1,
                         "acknowledged_at": "2026-03-18T09:12:00Z",
                         "acknowledgement_ref": "QBO-2026-03-IMPORT-4471",
                         "correction_path": "hr.time_adjustment tagged to the original pay period"},
             "request_id": "0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f"})),

        ("esign_envelopes_verify", "edge", 200, static_edge(
            "§5 — verify is a READ THAT CAN FAIL LOUDLY: 200 with verified:false and the mismatch, "
            "never a 4xx, because a tamper finding is a result the caller must RENDER, not an error "
            "the caller might swallow.",
            {"envelope_id": _uuid(71), "verified": False,
             "mismatches": [{"kind": "document_hash", "target_id": _uuid(72),
                             "expected_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                             "observed_sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"}],
             "verified_at": "2026-03-17T18:04:11Z"})),

        ("hr_providers_dispatch", "edge", 424, static_edge(
            "D12 — the black box did not answer, and the MANUAL FALLBACK IS NAMED in the response. "
            "D12's whole point is that an org can run its own service and record the confirmation.",
            {"error": "hr_provider_unavailable",
             "message": "Provider 'noop_adapter' did not answer within provider_retry_policy.",
             "user_message": "The background-check provider isn't responding. You can record the result manually instead.",
             "details": {"seam": "background_check", "provider_key": "noop_adapter",
                         "reason": "no_response",
                         "fallback": {"path": "manual",
                                      "endpoint": "POST /hr/providers/background_check/results"}},
             "request_id": "0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f"})),

        ("hr_background_checks_adverse_action_final", "edge", 409, static_edge(
            "§3.7 — final adverse action BEFORE the statutory deadline, with details.earliest_at. "
            "The waiting period being enforced in code rather than trusted to a human is the entire "
            "reason these are endpoints and not a status dropdown.",
            {"error": "hr_state_conflict",
             "message": "Candidate response deadline is 2026-03-22T17:00:00Z; final adverse action cannot be sent before it.",
             "user_message": "The candidate still has until March 22 to respond.",
             "details": {"earliest_at": "2026-03-22T17:00:00Z",
                         "pre_adverse_sent_at": "2026-03-17T17:00:00Z",
                         "waiting_period_days": 5},
             "request_id": "0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f"})),

        ("hr_identity_ssn_reveal", "edge", 403, static_edge(
            "SPEC-ACCESS §4.2 — A DENIAL ALWAYS NAMES WHAT WAS MISSING, because an unexplained "
            "denial is how over-tightening hides. details.capability names ssn.reveal; a bare 403 "
            "is a defect.",
            {"error": "hr_capability_denied",
             "message": "hr.capability(user, 'ssn.reveal', employment 0000…0041) returned false.",
             "user_message": "You don't have permission to reveal Social Security numbers.",
             "details": {"capability": "ssn.reveal", "subject_employment_id": _uuid(41),
                         "how_to_get_it": "An org owner can grant the ssn.reveal capability in HR settings."},
             "request_id": "0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f"})),

        ("hr_time_overtime_evaluate", "edge", 200, static_edge(
            "D24a — preapproval.state = 'exceeded_without_approval' WITH HOURS INTACT. The flag "
            "never withholds pay: unapproved overtime is still PAID, flagged for review and linked "
            "to a write-up. No field in this response can prevent hours being exported.",
            {"workweek_id": _uuid(7), "week_start_local_date": "2026-03-15",
             "hours_worked_to_date": 43.75, "hours_scheduled_remaining": 8.0,
             "projected_week_hours": 51.75,
             "thresholds": [
                 {"key": "approaching", "at_hours": 38.0, "crossed": True,
                  "crosses_at": "2026-03-18T15:12:00Z"},
                 {"key": "at_overtime", "at_hours": 40.0, "crossed": True,
                  "crosses_at": "2026-03-19T11:03:00Z"}],
             "daily": {"hours_today": 9.25, "daily_ot_at_hours": 8.0, "daily_dt_at_hours": 12.0},
             "preapproval": {"required": True, "state": "exceeded_without_approval",
                             "workflow_instance_id": None},
             "grace_minutes": 15, "snapshot_id": _uuid(81), "prospective": True,
             "flags": [{"code": "overtime_without_preapproval", "class": "overtime",
                        "message": "3.75 overtime hours worked without pre-approval. These hours ARE payable; route for review."}],
             "incomplete": []})),

        ("hr_careers_widget_bootstrap", "edge", 403, static_edge(
            "§3.10 — the Origin is outside the embed_key's allowlist. The key is public by nature "
            "(it sits in a <script> tag) and grants nothing but this read, so origin-binding is "
            "what stops a stolen key being embedded elsewhere.",
            {"error": "hr_origin_not_allowed",
             "message": "Origin 'https://not-the-customer.example' is not in the allowlist for this embed_key.",
             "user_message": "This job widget isn't authorized for this website.",
             "details": {"origin": "https://not-the-customer.example",
                         "allowed_origins": ["https://acme.example", "https://www.acme.example"]},
             "request_id": "0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f"})),
    ]


def static_edge(note, body):
    def build(_rows):
        return note, body, None
    return build


def from_rule_fixture(code, note, shape, flags=None, incomplete=None, jurisdiction=None):
    """Render a calc edge fixture FROM `hr.jurisdiction_rule_test`, never hand-typed (§6.4)."""
    def build(rows):
        row = rows.get(code)
        if row is None:
            raise SystemExit(
                f"FATAL: jurisdiction fixture {code} is not in hr.jurisdiction_rule_test. "
                f"§6.4 requires this edge case to be RENDERED from that row, and inventing the "
                f"numbers here would defeat the entire point of the fixture table.")
        expected = json.loads(row["expected"])
        body = {
            "snapshot_id": _uuid(91),
            "prospective": False,
            "as_of": row["as_of_date"],
            "jurisdiction_key": jurisdiction or row["jurisdiction_key"],
            "engine": {"key": "hr_rules_engine", "version": "3984be1"},
            "result": shape(expected),
            "rules_applied": [{"class": row["class_slug"], "rule_id": _uuid(31),
                               "rule_version": 1, "jurisdiction_key": row["jurisdiction_key"],
                               "status": "advisory" if flags else "active"}],
            "flags": flags or [],
            "incomplete": incomplete or [],
            "clamps": [],
            "written": {"work_interval_ids": [], "workweek_id": None, "leave_ledger_ids": []},
        }
        if row["expected_status"] == "pending_verification":
            # §6.4 — so nobody builds a screen that depends on an unverified number looking final.
            body["__pending_verification"] = True
        provenance = {"table": "hr.jurisdiction_rule_test", "code": code,
                      "expected_status": row["expected_status"],
                      "assertion_mode": row["assertion_mode"],
                      "title": row["title"]}
        return note, body, provenance
    return build


# --------------------------------------------------------------- the static registry
def render_registry(rendered, by_op):
    """Emit `registry.generated.ts` — a STATIC import map over every fixture file.

    Static, not dynamic, on purpose: the repo's code-splitting law treats a fan-out of dynamic
    imports as fragmentation, and 243 lazy chunks is exactly that. The cost is that anything
    importing this module pulls in every fixture — which is why ONLY `features/hr/mock/` imports
    it, and why the mock lane is deleted per family at cutover (§6.3 step 4).
    """
    entries = sorted(k for k in rendered if str(k).endswith(".json"))
    imports, rows = [], []
    for i, rel in enumerate(entries):
        var = f"f{i}"
        imports.append(f'import {var} from "./{str(rel).replace(chr(92), "/")}";')
        key = Path(rel).name[: -len(".json")]  # "<operation_id>.<case>"
        rows.append(f'  {json.dumps(key)}: {var} as unknown as HrFixture,')

    ops = sorted(by_op)
    op_rows = [f"  {json.dumps(o)}," for o in ops]

    return (
        "// GENERATED BY scripts/hr/generate_hr_fixtures.py — DO NOT EDIT.\n"
        "// Re-run: cd ../aidream && uv run python "
        "../matrx-frontend/scripts/hr/generate_hr_fixtures.py\n"
        "//\n"
        "// SPEC-CONTRACTS §6.4's fixture set, indexed as `<operationId>.<case>`.\n"
        "// The same JSON files back BOTH the mock transport and the client tests, so a fixture\n"
        "// that drifts from the contract breaks a test rather than quietly misleading a UI.\n"
        "\n"
        "export interface HrFixtureMeta {\n"
        "  endpoint_id: string;\n"
        "  operation_id: string;\n"
        "  method: string;\n"
        "  path: string;\n"
        "  family: string;\n"
        "  case: string;\n"
        "  status: number;\n"
        "  mode: string;\n"
        "  spec: string;\n"
        "  generated_by: string;\n"
        "  note?: string;\n"
        "  rendered_from?: string;\n"
        "}\n"
        "\n"
        "export interface HrFixture {\n"
        "  __fixture: HrFixtureMeta;\n"
        "  __rendered_from?: Record<string, unknown>;\n"
        "  body: unknown;\n"
        "}\n"
        "\n"
        "/** Every case §6.4 defines. `edge2` exists only where §6.4 mandates a second response. */\n"
        'export type HrFixtureCase = "happy" | "empty" | "error" | "edge" | "edge2";\n'
        "\n" + "\n".join(imports) + "\n\n"
        "export const HR_FIXTURES: Record<string, HrFixture> = {\n"
        + "\n".join(rows) + "\n};\n\n"
        "/** The 60 operations of the frozen catalog (SPEC-CONTRACTS §3 + §5). */\n"
        "export const HR_OPERATION_IDS = [\n"
        + "\n".join(op_rows) + "\n] as const;\n\n"
        "export type HrOperationId = (typeof HR_OPERATION_IDS)[number];\n"
    )


# --------------------------------------------------------------- assembly
COMPONENTS = {}


async def load_rule_fixtures(codes):
    conn = await asyncpg.connect(
        host=os.environ["SUPABASE_MATRIX_HOST"], port=int(os.environ["SUPABASE_MATRIX_PORT"]),
        database=os.environ["SUPABASE_MATRIX_DATABASE_NAME"], user=os.environ["SUPABASE_MATRIX_USER"],
        password=os.environ["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0, command_timeout=120)
    try:
        rows = await conn.fetch(
            """select t.code, t.title, t.jurisdiction_key, t.as_of_date::text as as_of_date,
                      t.expected_status, t.assertion_mode, t.expected::text as expected,
                      c.slug as class_slug
                 from hr.jurisdiction_rule_test t
                 join hr.jurisdiction_rule_class c on c.id = t.rule_class_id
                where t.code = any($1::text[])""", list(codes))
    finally:
        await conn.close()
    return {r["code"]: r for r in rows}


async def main():
    check = "--check" in sys.argv
    spec = json.loads(STUB.read_text(encoding="utf-8"))
    COMPONENTS.update(spec["components"]["schemas"])

    edges = edge_cases()
    codes = ["OT-CA-01", "OT-BOUND-01", "FW-CHI-01", "MIN-01", "I9-FED-03"]
    rule_rows = await load_rule_fixtures(codes)
    missing = [c for c in codes if c not in rule_rows]
    if missing:
        raise SystemExit(f"FATAL: missing jurisdiction fixture rows: {missing}")

    by_op = {}
    for path, methods in spec["paths"].items():
        for method, op in methods.items():
            by_op[op["operationId"]] = (path, method, op)

    edge_by_op = {}
    for op_id, slot, status, builder in edges:
        edge_by_op.setdefault(op_id, []).append((slot, status, builder))

    files = {}
    for op_id, (path, method, op) in by_op.items():
        family = op["tags"][0]
        ok_code = "202" if op["x-matrx-mode"] == "async" else "200"
        res_schema = op["responses"][ok_code]["content"]["application/json"]["schema"]

        def meta(case, status, note=None, source=None):
            m = {"endpoint_id": op["x-matrx-endpoint-id"], "operation_id": op_id,
                 "method": method.upper(), "path": path, "family": family,
                 "case": case, "status": status,
                 "mode": op["x-matrx-mode"],
                 "spec": "SPEC-CONTRACTS §6.4",
                 "generated_by": "scripts/hr/generate_hr_fixtures.py"}
            if note:
                m["note"] = note
            if source:
                m["rendered_from"] = source
            return m

        files[(family, op_id, "happy")] = {
            "__fixture": meta("happy", int(ok_code),
                              "Every optional field populated — a UI built only against minimal responses breaks on real data."),
            "body": synth(res_schema, "happy")}
        files[(family, op_id, "empty")] = {
            "__fixture": meta("empty", int(ok_code),
                              "The designed zero case. The empty state is a screen, not an accident."),
            "body": synth(res_schema, "empty")}
        st, err_body = error_fixture(family)
        files[(family, op_id, "error")] = {
            "__fixture": meta("error", st,
                              "The §1.3 envelope for this family's most likely failure. Forces the error path to be built at the same time as the happy path."),
            "body": err_body}

        for slot, status, builder in edge_by_op.get(op_id, []):
            note, body, provenance = builder(rule_rows)
            files[(family, op_id, slot)] = {
                "__fixture": meta(slot, status, note,
                                  provenance and f"{provenance['table']}:{provenance['code']}"),
                **({"__rendered_from": provenance} if provenance else {}),
                "body": body}

        # Every endpoint needs an `edge`. Where §6.4 lists none for the family, the edge is the
        # 503 the runtime spine can always produce — and it MUST carry details.retryable = true so
        # the handler does not capture it as a system error (§1.3).
        if (family, op_id, "edge") not in files:
            files[(family, op_id, "edge")] = {
                "__fixture": meta("edge", 503,
                                  "§6.4 lists no mandatory edge for this operation. The generic edge is the queue/worker outage, which MUST set details.retryable = true so the handler does not capture it as a system error (§1.3)."),
                "body": {"error": "hr_engine_unavailable",
                         "message": "The HR engine queue is not accepting work.",
                         "user_message": "We can't run this right now. Please try again in a few minutes.",
                         "details": {"retryable": True, "retry_after_seconds": 30},
                         "request_id": "0d9f4c1e-2b7a-4a55-9f3e-6c0a1b2d3e4f"}}

    # ---- write / check
    rendered = {}
    for (family, op_id, case), payload in sorted(files.items()):
        rel = Path(family) / f"{op_id}.{case}.json"
        rendered[rel] = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"

    rendered[Path("registry.generated.ts")] = render_registry(rendered, by_op)

    if check:
        bad = []
        for rel, text in rendered.items():
            p = ROOT / rel
            if not p.exists() or p.read_text(encoding="utf-8") != text:
                bad.append(str(rel))
        existing = ({p.relative_to(ROOT) for p in ROOT.rglob("*.json")}
                    | {p.relative_to(ROOT) for p in ROOT.rglob("*.generated.ts")}) if ROOT.exists() else set()
        orphans = sorted(str(p) for p in existing - set(rendered))
        if bad or orphans:
            print(f"✗ fixtures out of date: {len(bad)} stale/missing, {len(orphans)} orphaned")
            for b in (bad + orphans)[:10]:
                print(f"    {b}")
            return 1
        print(f"✓ {len(rendered) - 1} fixtures + the registry match the generator")
        return 0

    if ROOT.exists():
        for p in list(ROOT.rglob("*.json")) + list(ROOT.rglob("*.generated.ts")):
            if p.relative_to(ROOT) not in rendered:
                p.unlink()  # no orphans: a stale fixture is worse than a missing one
    for rel, text in rendered.items():
        p = ROOT / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")

    n_json = sum(1 for k in rendered if str(k).endswith(".json"))
    n_edge = sum(1 for (_, _, c) in files if c.startswith("edge"))
    mandatory_files = len(edges)
    # §6.4's table has 17 ROWS. `/hr/exports/payroll` is one row mandating TWO distinct responses
    # ("422 hr_advisory_rule_blocks_money, and separately a 400 with details.unmapped[]"), so the
    # 17 mandatory cases render as 18 fixture FILES. CT-13 counts the rows.
    mandatory_rows = mandatory_files - 1
    print(f"✓ wrote {n_json} fixtures + registry.generated.ts for {len(by_op)} operations into {ROOT}")
    print(f"  cases: happy {len(by_op)} · empty {len(by_op)} · error {len(by_op)} · edge {n_edge}")
    print(f"  §6.4 mandatory edge cases: {mandatory_rows} rows -> {mandatory_files} files "
          f"(/hr/exports/payroll mandates two); {len(codes)} rendered from hr.jurisdiction_rule_test")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

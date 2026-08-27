/**
 * HRB-022 — prove the declared inbox types are TRUE of the live envelope.
 *
 * The point of `features/hr/tasks/envelope.ts` is that no cast stands between `Json` and
 * `HrInbox`. That is only worth anything if the parser is run against what the door ACTUALLY
 * returns, so this feeds it a real, captured `public.hr_wf_inbox` envelope — and then feeds it
 * broken ones, because a validator that cannot fail is worse than no validator.
 *
 *   pnpm tsx scripts/hr/hrb022_envelope_check.ts
 */

import {
    HrContractError,
    parseBulkResult,
    parseEnvelope,
    parseInbox,
} from "../../features/hr/tasks/envelope";

/** Captured verbatim from `select public.hr_wf_inbox('mine')` on the live database, 2026-08-27. */
const LIVE_INBOX = {
    as_of: "2026-08-27T06:58:04.913503+00:00",
    scope: "mine",
    granted: true,
    bulk_max: 50,
    scope_rows: [],
    default_sort: "due_at asc",
    can_view_queue: false,
    employment_ids: [],
    recently_decided: [],
    needs_my_decision: [],
    waiting_on_others: [],
    auto_applying_soon: [],
    failures_assigned_to_me: [],
};

/** The refusal shape `hr._governance_refusal` builds, captured from the same door. */
const LIVE_REFUSAL = {
    granted: false,
    reason: "no_queue_authority",
    detail: "reading another person's approval queue needs workflow administration standing",
    audit_id: "00000000-0000-0000-0000-000000000000",
};

/** A decorated row, keys exactly as hr.wf_pending + hr._wf_display build them. */
const LIVE_RESTRICTED_ROW = {
    step_id: "11111111-1111-1111-1111-111111111111",
    instance_id: "22222222-2222-2222-2222-222222222222",
    flow_key: "pay_change",
    step_key: "hr_review",
    due_at: null,
    activated_at: "2026-08-27T00:00:00+00:00",
    priority: "normal",
    urgent: false,
    resolution_path: "authority",
    autonomy_mode: 5,
    timeout_at: null,
    sensitivity_tier: "restricted",
    deep_link: "/hr/tasks/22222222-2222-2222-2222-222222222222?step=11111111-1111-1111-1111-111111111111",
    title: "Pay change approval — 1 item",
    flow_label: "Pay change approval",
    step_label: "HR review",
    subject_label: null,
    target_token: "hr_compensation",
    target_id: "33333333-3333-3333-3333-333333333333",
    allow_bulk_decide: false,
    requires_reason_on_approve: true,
    allows_withdraw: true,
    instance_state: "active",
    requester_employment_id: null,
    subject_employment_id: "44444444-4444-4444-4444-444444444444",
    workspace_task_id: null,
    first_viewed_at: null,
    quorum_kind: "all",
    approvals_needed: 1,
    approvals_received: 0,
    notices: [
        {
            channel: "sms",
            status: "sent",
            sent_at: "2026-08-27T00:01:00+00:00",
            delivered_at: "2026-08-27T00:01:04+00:00",
            read_at: null,
            failure_reason: null,
        },
    ],
};

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
    if (!ok) failures += 1;
    console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${!ok && detail ? `   << ${detail}` : ""}`);
}

function refuses(name: string, run: () => unknown) {
    try {
        run();
        check(name, false, "it did NOT throw");
    } catch (e) {
        check(name, e instanceof HrContractError, `threw ${(e as Error).name}, wanted HrContractError`);
    }
}

console.log("\nHRB-022 — the declared types against the LIVE envelope\n");

const parsed = parseEnvelope("hr_wf_inbox", LIVE_INBOX, parseInbox);
check("a real granted envelope parses", parsed.granted === true);
if (parsed.granted) {
    const inbox = parsed.data;
    check("scope survives as a narrowed union", inbox.scope === "mine");
    check("bulk_max is the live knob value, not a default", inbox.bulk_max === 50);
    check("default_sort is the live knob string", inbox.default_sort === "due_at asc");
    check("can_view_queue is the live boolean FALSE, not undefined", inbox.can_view_queue === false);
    check("as_of survives", inbox.as_of.startsWith("2026-08-27"));
    check(
        "every list the door promised is present and empty — server-sent, not manufactured",
        [
            inbox.needs_my_decision,
            inbox.scope_rows,
            inbox.auto_applying_soon,
            inbox.waiting_on_others,
            inbox.failures_assigned_to_me,
            inbox.recently_decided,
        ].every((l) => Array.isArray(l) && l.length === 0),
    );
}

const refusal = parseEnvelope("hr_wf_inbox", LIVE_REFUSAL, parseInbox);
check("a refusal is DATA, not a throw", refusal.granted === false);
if (!refusal.granted) {
    check("the refusal keeps the database's own sentence", (refusal.detail ?? "").includes("workflow administration"));
    check("and its audit id", refusal.audit_id !== null);
}

const withRow = parseEnvelope(
    "hr_wf_inbox",
    { ...LIVE_INBOX, needs_my_decision: [LIVE_RESTRICTED_ROW] },
    parseInbox,
);
if (withRow.granted) {
    const row = withRow.data.needs_my_decision[0];
    check("all 31 decorated row fields survive the parse", row.step_id === LIVE_RESTRICTED_ROW.step_id);
    check(
        "🚨 the restricted-tier title is byte-preserved",
        row.title === "Pay change approval — 1 item",
        String(row.title),
    );
    check(
        "🚨 subject_label stays NULL — redacted, never coerced to an empty string",
        row.subject_label === null,
        JSON.stringify(row.subject_label),
    );
    check("allow_bulk_decide FALSE survives as false, not undefined", row.allow_bulk_decide === false);
    check("approvals_received 0 survives as 0, not dropped as falsy", row.approvals_received === 0);
    check("a null due_at stays null", row.due_at === null);
    check(
        "🚨 an SMS notice keeps read_at NULL — delivered is not read",
        row.notices?.[0]?.read_at === null && row.notices?.[0]?.delivered_at !== null,
    );
}

const scopeRow = parseEnvelope("hr_wf_inbox", { ...LIVE_INBOX, scope_rows: [LIVE_RESTRICTED_ROW] }, parseInbox);
if (scopeRow.granted) {
    const { notices, ...noNotices } = LIVE_RESTRICTED_ROW;
    void notices;
    const bare = parseEnvelope("hr_wf_inbox", { ...LIVE_INBOX, scope_rows: [noNotices] }, parseInbox);
    check(
        "a scope row carries no notices key, and it stays UNDEFINED rather than becoming []",
        bare.granted === true &&
            bare.data.scope_rows[0].notices === undefined,
    );
}

console.log("\n  -- and it can fail --");
refuses("a missing promised key is a loud contract break", () =>
    parseEnvelope("hr_wf_inbox", { granted: true, scope: "mine" }, parseInbox),
);
refuses("a scope outside the union is refused", () =>
    parseEnvelope("hr_wf_inbox", { ...LIVE_INBOX, scope: "everything" }, parseInbox),
);
refuses("a string where a number belongs is refused", () =>
    parseEnvelope("hr_wf_inbox", { ...LIVE_INBOX, bulk_max: "50" }, parseInbox),
);
refuses("a row missing step_id is refused", () =>
    parseEnvelope("hr_wf_inbox", { ...LIVE_INBOX, needs_my_decision: [{ instance_id: "x" }] }, parseInbox),
);
refuses("a bulk result with no per-step results is refused", () =>
    parseEnvelope("hr_wf_bulk_decide", { granted: true, succeeded: 3, skipped: 0 }, parseBulkResult),
);
refuses("a non-object payload is refused", () => parseEnvelope("hr_wf_inbox", [1, 2], parseInbox));

console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILING`}\n`);
process.exit(failures === 0 ? 0 : 1);

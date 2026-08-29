/**
 * The ONE HR task inbox — the wire shapes.
 *
 * Every `hr.wf_*` RPC returns a jsonb ENVELOPE and never raises: `{granted:
 * true, ...}` or `{granted: false, reason, detail, audit_id?}`. That is the
 * engine's contract (SPEC-WORKFLOW-ENGINE §4.2), and the reason the UI can show
 * a refusal in the exact place the action was taken instead of a generic toast.
 *
 * These types describe what `public.hr_wf_inbox` actually returns, read from
 * the shipped function bodies — not what a spec table hoped it would return.
 */

export type HrRefusal = {
    granted: false;
    /** A stable code: `no_caller`, `no_queue_authority`, `WF_BULK_LIMIT`, … */
    reason: string;
    /** A sentence a human can act on. Always render this, never the code alone. */
    detail?: string | null;
    /** Present when the refusal was written to `hr.access_audit`. */
    audit_id?: string | null;
};

/**
 * 🚨 The success case carries its payload under `data` rather than being intersected onto the
 * envelope. `(T & {granted:true})` reads more naturally at a call site and cannot be BUILT without
 * a cast — `Object.assign` on a generic `T` does not typecheck, so every constructor of one ends
 * up asserting a shape instead of proving it. One extra `.data` at seven call sites buys a
 * narrowing that the compiler verifies end to end.
 */
export type HrEnvelope<T> = { granted: true; data: T } | HrRefusal;

export function isRefusal<T>(envelope: HrEnvelope<T>): envelope is HrRefusal {
    return envelope?.granted !== true;
}

/** SPEC-UI-IA §5.9 — scopes are shown only where the persona has them. */
export type HrInboxScope = "mine" | "team" | "queue";

/** `hr.workflow_instance.sensitivity_tier`. `restricted` renders contentless. */
export type HrSensitivityTier = string;

/**
 * One actionable row. The first block comes from `hr.wf_pending` (the queue of
 * record); the second from `hr._wf_display` (the ONE display rule, which is
 * also what the `workspace.tasks` mirror renders).
 */
export type HrInboxRow = {
    step_id: string;
    instance_id: string;
    flow_key: string;
    step_key: string;
    due_at: string | null;
    activated_at: string | null;
    priority: string;
    urgent: boolean;
    resolution_path?: string | null;
    autonomy_mode?: number | null;
    timeout_at: string | null;
    sensitivity_tier: HrSensitivityTier;
    deep_link: string;

    title?: string | null;
    flow_label?: string | null;
    step_label?: string | null;
    /**
     * The subject's name. NULL when the viewer is not entitled to it OR the subject opted out of
     * the directory — `subject_withheld` tells the two apart from "this flow has no subject".
     */
    subject_label?: string | null;
    /** True when a restricted-tier row is deliberately withholding the name from THIS viewer. */
    subject_withheld?: boolean;
    target_token?: string | null;
    target_id?: string | null;
    /**
     * 🚨 WHAT THE DECISION IS ACTUALLY ABOUT.
     *
     * A decider was approving a legal name change on a screen that showed a flow key,
     * a table token and a bare uuid — never the name. `hr._wf_display` now answers what
     * changes, from what, to what, for the flows whose proposal lives in the workflow
     * instance rather than in the target row (a profile edit, an address change). Empty
     * when the render is contentless or the reader is not entitled: a summary of a change
     * IS content, so it is withheld wherever the subject's name would be.
     */
    change?: HrInboxChange[];
    /**
     * The flow's own one-line summary, for the kinds whose request already lives in the
     * target row and have a digest function that words it — leave, timecard, overtime.
     * Null for the payload-carrying flows, which answer through `change` instead.
     */
    digest?: string | null;
    allow_bulk_decide?: boolean;
    requires_reason_on_approve?: boolean;
    allows_withdraw?: boolean;
    instance_state?: string | null;
    requester_employment_id?: string | null;
    subject_employment_id?: string | null;
    workspace_task_id?: string | null;
    first_viewed_at?: string | null;
    quorum_kind?: string | null;
    approvals_needed?: number | null;
    approvals_received?: number | null;

    /** SPEC-UI-IA §5.9 — delivery/read state lives with the task. */
    notices?: HrInboxNotice[];
};

/**
 * The ONE line that names a queue row: what it is, and who it is about.
 *
 * 🚨 IT EXISTS SO A SECOND NAMING RULE CANNOT BE INVENTED. The bulk-decide result panel
 * listed each outcome by BARE UUID — "decided 85217879-…" — for names that were on the rows
 * the decider had ticked a second earlier. The same class as the attestation panel's raw ids.
 * The precedence here is the table's, unchanged: `title` → `flow_label` → `flow_key`.
 *
 * 🚨 A WITHHELD SUBJECT STAYS WITHHELD. `subject_withheld` means this viewer is not entitled
 * to the name, so the line says so rather than omitting the clause silently — anywhere the
 * name would appear, its absence must be visible and explained (§1.3).
 *
 * The `digest` clause is what makes the outcome readable — "Timecard · Zzz Punchemployee ·
 * Aug 21-27" rather than a kind and a person with no period. It is the flow's own worded
 * summary, already entitlement-gated by `hr._wf_display`.
 */
export function inboxRowLine(row: HrInboxRow): string {
    const head = row.title ?? row.flow_label ?? row.flow_key;
    const parts = [head];
    /*
        🚨 THE TITLE OFTEN ALREADY CARRIES THE NAME — measured, not assumed. Live rows read
        "Address change — Tomo Iversen-G32" with `subject_label` = "Tomo Iversen-G32", so
        appending it unconditionally produced "… — Tomo Iversen-G32 · Tomo Iversen-G32".
        Say the name once; add it only when the head has not already said it.
    */
    if (row.subject_withheld) parts.push("subject withheld");
    else if (row.subject_label && !head.includes(row.subject_label)) parts.push(row.subject_label);
    if (row.digest) parts.push(row.digest);
    return parts.join(" · ");
}

/**
 * One field a decision would change. `from` is null when the field is currently
 * empty — which is a real answer ("nothing on file"), not a missing one.
 */
export type HrInboxChange = {
    field: string;
    label: string;
    from: string | null;
    to: string | null;
};

/** A row of `hr.workflow_notice`, the VIEW over `communication.notification`. */
export type HrInboxNotice = {
    channel: string;
    status: string;
    sent_at: string | null;
    delivered_at: string | null;
    read_at: string | null;
    failure_reason: string | null;
};

export type HrAutoApplyingRow = {
    step_id: string;
    instance_id: string;
    flow_key: string;
    /** The kind in words. The countdown list named the thing about to happen in machine keys. */
    flow_label?: string | null;
    timeout_at: string | null;
};

export type HrWaitingRow = {
    instance_id: string;
    flow_key: string;
    /**
     * 🚨 THE SAME WORDS THE DECIDER SEES. This list is the person's OWN filed
     * requests, and it carried only the raw flow key — so they read
     * `leave_request` about their own leave while the approver read "Leave
     * request · 18 Sep – 19 Sep 2026 · 8 hours". A rendering fix that lands on
     * one side of a transaction leaves the subject knowing less about their own
     * request than the stranger deciding it.
     */
    flow_label?: string | null;
    /** The target row's human summary — dates, hours, policy — same source as the queue. */
    summary?: string | null;
    state: string;
    submitted_at: string | null;
};

export type HrFailureRow = {
    failure_id: string;
    instance_id: string;
    failure_class: string;
    /** Which request the failure is on — a class token alone names a category, not a thing. */
    flow_key?: string | null;
    flow_label?: string | null;
    state: string;
    occurred_at: string | null;
};

/**
 * One of the viewer's OWN decisions, last 30 days.
 *
 * 🚨 THE VERB IS NOT THE ROW. This type held four fields — id, instance, verb, timestamp — and
 * "Recently decided" therefore rendered ~40 consecutive lines of `approved  8/27/2026, 10:05:25
 * PM`: no employee, no kind of request, nothing to click. The naming block below comes from
 * `hr._wf_display` via `hr.wf_pending` (hr_c4_55 / D10) — the SAME rule that names a queue row,
 * so a withheld subject stays withheld here too and no disclosure is invented client-side.
 */
export type HrDecidedRow = {
    decision_id: string;
    instance_id: string;
    step_id?: string | null;
    decision: string;
    decided_at: string | null;
    /** The decider's own recorded reason, where they gave one. */
    reason?: string | null;

    title?: string | null;
    flow_key?: string | null;
    flow_label?: string | null;
    step_label?: string | null;
    subject_label?: string | null;
    subject_withheld?: boolean;
    digest?: string | null;
};

/**
 * The ONE line that names a decided row — the history's counterpart to `inboxRowLine`, and
 * deliberately the same shape so the queue and the history cannot come to word one request two
 * ways. `HrInboxRow` and `HrDecidedRow` carry the same naming block by design, so this takes the
 * common part rather than either concrete type.
 */
export function decidedRowLine(row: {
    title?: string | null;
    flow_label?: string | null;
    flow_key?: string | null;
    subject_label?: string | null;
    subject_withheld?: boolean;
    digest?: string | null;
}): string {
    const head = row.title ?? row.flow_label ?? row.flow_key ?? "this request";
    const parts = [head];
    // Same precedence and the same withheld rule as `inboxRowLine`: the title usually already
    // carries the name, and "not being told" is stated rather than silently omitted.
    if (row.subject_withheld) parts.push("subject withheld");
    else if (row.subject_label && !head.includes(row.subject_label)) parts.push(row.subject_label);
    if (row.digest) parts.push(row.digest);
    return parts.join(" · ");
}

/**
 * The engine's past-tense verb, as a person says it.
 *
 * The verbs ARE past tense already (`HR_DECISION_VERB` maps a control's intent onto them), so this
 * is presentation only — the same job `bulkVerb` does in the inbox's outcome panel. An unknown
 * verb renders as itself rather than being dropped: the engine's vocabulary is allowed to grow
 * without this map silently swallowing the new word.
 */
export const HR_DECISION_PAST_LABEL: Record<string, string> = {
    approved: "Approved",
    rejected: "Rejected",
    returned: "Returned for changes",
    abstained: "Abstained",
    attested: "Attested",
    attested_with_exception: "Attested with an exception",
    acknowledged: "Acknowledged",
};

export type HrInbox = {
    scope: HrInboxScope;
    needs_my_decision: HrInboxRow[];
    /** Team / HR-queue rows: waiting on SOMEBODY, not on me. */
    scope_rows: HrInboxRow[];
    auto_applying_soon: HrAutoApplyingRow[];
    waiting_on_others: HrWaitingRow[];
    failures_assigned_to_me: HrFailureRow[];
    recently_decided: HrDecidedRow[];
    bulk_max: number;
    default_sort: string;
    can_view_queue: boolean;
    employment_ids: string[];
    as_of: string;
};

/**
 * 🚨 THE DECISION VOCABULARY IS PAST TENSE, AND IT IS THE SERVER'S, NOT OURS.
 *
 * This union read `"approve" | "reject" | "return" | "acknowledge"` until 2026-08-27 — **all four
 * verbs in the wrong tense** — so `hr.wf_decide` refused every single one before it ever reached
 * an authority check:
 *
 *     {granted: false, reason: "unknown_decision",
 *      detail: "approve is not a decision this engine records"}
 *
 * The UI had therefore **never recorded a decision on any flow, on any surface, ever.**
 * `hr.workflow_decision` held exactly one row system-wide, and it came from a direct door call.
 *
 * How it survived: the door speaks past tense because a decision row is a RECORD of something
 * that happened, not a command. The client speaks present tense because a button is an
 * instruction. Both readings are natural, which is precisely why the two drifted and why nothing
 * caught it — every proof in this lane called `hr_wf_decide` with a hand-typed `'approved'`, so
 * the door was tested and the client's own vocabulary never was. **A proof that types the right
 * verb cannot catch a client that sends the wrong one.**
 *
 * The values below are the exact seven from `hr.wf_decide`'s own vocabulary check and from
 * `workflow_decision_decision_check`. `hrb022_proof.py` now derives this union from the live
 * `prosrc` and fails if the two ever disagree again, so tense drift cannot ship twice.
 */
export type HrDecision =
    | "approved"
    | "rejected"
    | "returned"
    | "abstained"
    | "attested"
    | "attested_with_exception"
    | "acknowledged";

/**
 * The ONE place a control's intent becomes the engine's verb.
 *
 * There is deliberately no second translation anywhere — a mapping that exists twice is a mapping
 * that disagrees with itself, which is the whole shape of the defect this replaces. A control
 * carries its intent key; `HR_DECISION_VERB` turns it into the recorded verb; the door receives
 * only what came out of this map.
 */
export const HR_DECISION_VERB = {
    approve: "approved",
    reject: "rejected",
    return: "returned",
    abstain: "abstained",
    attest: "attested",
    attestWithException: "attested_with_exception",
    acknowledge: "acknowledged",
} as const satisfies Record<string, HrDecision>;

export type HrDecisionIntent = keyof typeof HR_DECISION_VERB;

/**
 * §9.1 — a reason on these is a HARD REFUSAL from the door, not a knob:
 * "a reason on reject/return is a HARD REFUSAL". The client blocks the send rather than
 * collecting a decision the database will throw away.
 */
export const HR_DECISION_REQUIRES_REASON: readonly HrDecision[] = [
    "rejected",
    "returned",
    "attested_with_exception",
];

export type HrBulkOutcome = {
    step_id: string;
    granted: boolean;
    reason: string | null;
    detail: string | null;
};

export type HrBulkResult = {
    results: HrBulkOutcome[];
    succeeded: number;
    skipped: number;
};

/**
 * `hr.wf_decide`'s success payload. TWO live shapes, one type: the closing decision returns
 * `{decision_id, decision, step}` and a decision that only advances a quorum returns
 * `{decision_id, decision, approvals_needed, approvals_received, step_state}`. Which one you get
 * depends on whether yours was the last approval, and a caller must not have to know that — so the
 * quorum fields are optional and **absent stays absent** rather than defaulting to 0, which would
 * read as "no approvals yet" on a step that is already closed.
 */
export type HrDecideResult = {
    decision_id?: string | null;
    decision?: string | null;
    step_state?: string | null;
    approvals_needed?: number;
    approvals_received?: number;
};

/**
 * The success payload of a door whose result this feature does not read beyond "it worked".
 *
 * 🚨 Deliberately EMPTY rather than a wide `Record<string, unknown>`. `hr.wf_escalate`,
 * `wf_withdraw`, `wf_cancel`, `wf_reassign_step`, `wf_record_result` and `wf_resolve_failure` each
 * return a different success shape (verified against prosrc 2026-08-26) and the panel reads none of
 * them — it reads `granted`, and renders the refusal when it is false. Declaring fields nobody
 * consumes is how a type stops being something anyone checks.
 */
export type HrAck = Record<string, never>;

/**
 * `hr.wf_escalate`'s success payload — which is `hr.wf_activate_step`'s envelope, so it names the
 * people the step reached rather than merely saying it worked.
 */
export type HrEscalateResult = {
    state?: string | null;
    reason?: string | null;
    user_ids?: string[];
    candidate_count?: number;
};

/**
 * `hr.wf_resolve_failure`'s success payload. `outcome` is read from the envelope and stays
 * undefined until the engine emits it — see envelope.ts for why it is not sent as a parameter.
 */
export type HrFailureResolution = {
    action?: string | null;
    state?: string | null;
    outcome?: string | null;
    retry_granted?: boolean;
    retry_reason?: string | null;
};

/** The four actions `hr.wf_resolve_failure` accepts; anything else is `unknown_action`. */
export type HrFailureAction = "retry" | "resolve" | "abandon" | "reassign";

/** `public.hr_wf_instance` — the decision panel's read. */
export type HrInstanceDetail = {
    instance: Record<string, unknown>;
    /** Lifted from the decorated steps by the door — null when withheld from this viewer. */
    subject_label?: string | null;
    subject_withheld?: boolean;
    steps: Record<string, unknown>[];
    decisions: Record<string, unknown>[];
    events: Record<string, unknown>[];
    failures: Record<string, unknown>[];
    /** Narrowed to the six delivery-evidence fields the panel renders — see envelope.ts. */
    notices: HrInboxNotice[];
};

/** SPEC-UI-IA §5.9 — rows group by urgency before anything else. */
export type HrUrgencyBucket = "overdue" | "today" | "week" | "later" | "undated";

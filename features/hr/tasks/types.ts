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
    /** NULL on a restricted-tier row — the split survives the projection. */
    subject_label?: string | null;
    target_token?: string | null;
    target_id?: string | null;
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
    timeout_at: string | null;
};

export type HrWaitingRow = {
    instance_id: string;
    flow_key: string;
    state: string;
    submitted_at: string | null;
};

export type HrFailureRow = {
    failure_id: string;
    instance_id: string;
    failure_class: string;
    state: string;
    occurred_at: string | null;
};

export type HrDecidedRow = {
    decision_id: string;
    instance_id: string;
    decision: string;
    decided_at: string | null;
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

/** `hr.wf_decide` / `hr.wf_bulk_decide` decisions. */
export type HrDecision = "approve" | "reject" | "return" | "acknowledge";

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
    steps: Record<string, unknown>[];
    decisions: Record<string, unknown>[];
    events: Record<string, unknown>[];
    failures: Record<string, unknown>[];
    /** Narrowed to the six delivery-evidence fields the panel renders — see envelope.ts. */
    notices: HrInboxNotice[];
};

/** SPEC-UI-IA §5.9 — rows group by urgency before anything else. */
export type HrUrgencyBucket = "overdue" | "today" | "week" | "later" | "undated";

/**
 * features/hr/tasks/envelope.ts — the ONE seam where `Json` becomes a typed HR envelope.
 *
 * 🚨 WHY THIS FILE EXISTS: A CAST AT A SEAM IS A LIE THAT TYPE-CHECKS.
 *
 * `supabase.rpc()` types every one of these doors as `Returns: Json`, because that is honestly all
 * PostgREST can promise about a `jsonb` return. The tempting move is `data as HrInbox`, and it is
 * the defect this file kills: the compiler then believes a shape nobody ever checked, so a renamed
 * key in SQL surfaces as `undefined` in a component three layers away — with no error, no red
 * type-check, and usually a blank cell where a number should be.
 *
 * So the narrowing happens exactly once, HERE, and it is a real runtime check. Every field list
 * below was read from the LIVE function bodies (`pg_proc.prosrc`, 2026-08-26) rather than from the
 * spec, because the spec describes intent and this file has to describe what actually comes back.
 *
 * THE STANDING LAWS THIS FILE ENFORCES
 * ------------------------------------
 * - **Refusals are data.** `{granted:false, reason, detail, audit_id?}` is a legal, expected answer
 *   from every door and is never thrown. The caller renders it where the user acted.
 * - **Absent fields stay dark.** A key the door did not send is `undefined`, never `0`, never `""`,
 *   never `[]`. `[]` is only ever reported when the server actually sent `[]` — which it does,
 *   because every list in `hr.wf_pending` is `coalesce(..., '[]'::jsonb)`. Manufacturing an empty
 *   array for a missing key would turn a broken contract into a confident "nothing is waiting".
 * - **A redaction is a null, and it stays null.** `subject_label` is JSON `null` on a
 *   restricted-tier row (`hr._wf_display`); coercing it to `""` would make "you are not being told"
 *   look like "this flow has no subject". The two are different and the UI says so.
 * - **A contract break is loud.** A door that omits a key it promises raises `HrContractError`
 *   naming the door and the key. Silence here is how a UI ends up built on a fiction.
 */

import type {
    HrBulkOutcome,
    HrEscalateResult,
    HrFailureResolution,
    HrBulkResult,
    HrDecideResult,
    HrEnvelope,
    HrInbox,
    HrInboxNotice,
    HrInboxRow,
    HrInboxScope,
    HrInstanceDetail,
    HrRefusal,
} from "@/features/hr/tasks/types";

/** A door returned something its own body says it never returns. */
export class HrContractError extends Error {
    constructor(
        readonly rpc: string,
        readonly detail: string,
    ) {
        super(`${rpc}: ${detail}`);
        this.name = "HrContractError";
    }
}

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function required(rpc: string, source: Obj, key: string): unknown {
    if (!(key in source)) {
        throw new HrContractError(rpc, `the envelope has no "${key}" key`);
    }
    return source[key];
}

function str(rpc: string, source: Obj, key: string): string {
    const value = required(rpc, source, key);
    if (typeof value !== "string") {
        throw new HrContractError(rpc, `${key} is ${typeof value}, expected string`);
    }
    return value;
}

/** A key that is legitimately absent or JSON null — the caller must handle both. */
function optStr(source: Obj, key: string): string | null | undefined {
    const value = source[key];
    if (value === undefined) return undefined;
    if (value === null) return null;
    return typeof value === "string" ? value : undefined;
}

function optBool(source: Obj, key: string): boolean | undefined {
    const value = source[key];
    return typeof value === "boolean" ? value : undefined;
}

function optNum(source: Obj, key: string): number | undefined {
    const value = source[key];
    return typeof value === "number" ? value : undefined;
}

function num(rpc: string, source: Obj, key: string): number {
    const value = required(rpc, source, key);
    if (typeof value !== "number") {
        throw new HrContractError(rpc, `${key} is ${typeof value}, expected number`);
    }
    return value;
}

function bool(rpc: string, source: Obj, key: string): boolean {
    const value = required(rpc, source, key);
    if (typeof value !== "boolean") {
        throw new HrContractError(rpc, `${key} is ${typeof value}, expected boolean`);
    }
    return value;
}

function arr(rpc: string, source: Obj, key: string): unknown[] {
    const value = required(rpc, source, key);
    if (!Array.isArray(value)) {
        throw new HrContractError(rpc, `${key} is not an array`);
    }
    return value;
}

function objects(rpc: string, source: Obj, key: string): Obj[] {
    return arr(rpc, source, key).filter(isObj);
}

/**
 * The envelope every `hr.wf_*` door speaks: `{granted: boolean, ...}`.
 * `hr._governance_refusal` adds `audit_id` when the refusal was written to `hr.access_audit`.
 */
export function parseEnvelope<T>(
    rpc: string,
    data: unknown,
    parsePayload: (source: Obj) => T,
): HrEnvelope<T> {
    if (!isObj(data)) {
        throw new HrContractError(
            rpc,
            `returned ${Array.isArray(data) ? "an array" : String(data)}, expected an envelope`,
        );
    }
    if (data.granted !== true) {
        // A refusal is DATA. `reason` is always present on a refusal (verified across all 13
        // bodies); `detail` and `audit_id` are not, and stay undefined when absent.
        const refusal: HrRefusal = {
            granted: false,
            reason: typeof data.reason === "string" ? data.reason : "unknown_refusal",
            detail: optStr(data, "detail") ?? null,
            audit_id: optStr(data, "audit_id") ?? null,
        };
        return refusal;
    }
    return { granted: true, data: parsePayload(data) };
}

/**
 * `hr.wf_escalate` returns `hr.wf_activate_step`'s OWN envelope, not an ack of its own — so on
 * success it carries who the step went to (`user_ids`, `candidates`) or why it went nowhere
 * (`state: 'skipped'`, `reason`). The inbox reads those and SAYS them: "escalated to 2 people" is
 * the difference between an escape hatch you can trust and a button that appears to do nothing.
 */
export function parseEscalateResult(source: Obj): HrEscalateResult {
    return {
        state: optStr(source, "state"),
        reason: optStr(source, "reason"),
        user_ids: Array.isArray(source.user_ids)
            ? source.user_ids.filter((v): v is string => typeof v === "string")
            : undefined,
        candidate_count: Array.isArray(source.candidates) ? source.candidates.length : undefined,
    };
}

/**
 * `hr.wf_resolve_failure` returns `{granted, action, ...}` with a per-action tail — `retry` carries
 * the retry's own envelope, `abandon` closes the instance.
 *
 * 🚨 `outcome` is read OPPORTUNISTICALLY and stays undefined until the engine emits it. The
 * failure-resolution terminal is being wired in parallel (the `not_attested` outcome for the
 * no-login class), and the live signature today is `(p_failure_id, p_action, p_note)` — three
 * arguments, no outcome. Reading the field from the ENVELOPE rather than sending a parameter that
 * does not exist means the client needs no change on the day the engine starts returning it, and
 * cannot break in the meantime by calling something that is not there.
 */
export function parseFailureResolution(source: Obj): HrFailureResolution {
    return {
        action: optStr(source, "action"),
        state: optStr(source, "state"),
        outcome: optStr(source, "outcome"),
        retry_granted: isObj(source.retry) ? source.retry.granted === true : undefined,
        retry_reason: isObj(source.retry) ? optStr(source.retry, "reason") : undefined,
    };
}

/** A door whose success payload the inbox does not read beyond "it worked". */
export function parseAck(_source: Obj): Record<string, never> {
    // Deliberately empty and deliberately NOT `Record<string, unknown>` of the raw row: declaring
    // fields nobody reads is how a type stops being checkable. `hr.wf_escalate`,
    // `hr.wf_withdraw`, `hr.wf_cancel`, `hr.wf_reassign_step`, `hr.wf_record_result` and
    // `hr.wf_resolve_failure` each return a different success shape; the panel reads none of them.
    return {};
}

// --- hr._wf_display: the 18 keys, verified field-for-field against prosrc 2026-08-26 -----------

function parseNotice(source: Obj): HrInboxNotice {
    // hr.wf_inbox builds these from the hr.workflow_notice VIEW: channel, status, sent_at,
    // delivered_at, read_at, failure_reason. Every timestamp is nullable BY DESIGN — a NULL
    // read_at on an SMS is the truth (a carrier cannot tell us a person read anything), so it
    // stays null and the UI renders "delivered" rather than an empty cell or a fake tick.
    return {
        channel: typeof source.channel === "string" ? source.channel : "in_app",
        status: typeof source.status === "string" ? source.status : "",
        sent_at: optStr(source, "sent_at") ?? null,
        delivered_at: optStr(source, "delivered_at") ?? null,
        read_at: optStr(source, "read_at") ?? null,
        failure_reason: optStr(source, "failure_reason") ?? null,
    };
}

function parseRow(rpc: string, source: Obj): HrInboxRow {
    return {
        // from hr.wf_pending's own build (VERIFIED ALIGNED with prosrc: step_id, instance_id,
        // flow_key, step_key, due_at, activated_at, priority, urgent, resolution_path,
        // autonomy_mode, timeout_at, sensitivity_tier, deep_link)
        step_id: str(rpc, source, "step_id"),
        instance_id: str(rpc, source, "instance_id"),
        flow_key: str(rpc, source, "flow_key"),
        step_key: str(rpc, source, "step_key"),
        due_at: optStr(source, "due_at") ?? null,
        activated_at: optStr(source, "activated_at") ?? null,
        priority: str(rpc, source, "priority"),
        urgent: source.urgent === true,
        resolution_path: optStr(source, "resolution_path"),
        autonomy_mode: optNum(source, "autonomy_mode"),
        timeout_at: optStr(source, "timeout_at") ?? null,
        sensitivity_tier: str(rpc, source, "sensitivity_tier"),
        deep_link: str(rpc, source, "deep_link"),

        // merged in from hr._wf_display (VERIFIED ALIGNED: title, flow_label, step_label,
        // subject_label, sensitivity_tier, target_token, target_id, allow_bulk_decide,
        // requires_reason_on_approve, allows_withdraw, instance_state,
        // requester_employment_id, subject_employment_id, workspace_task_id, first_viewed_at,
        // quorum_kind, approvals_needed, approvals_received)
        title: optStr(source, "title"),
        flow_label: optStr(source, "flow_label"),
        step_label: optStr(source, "step_label"),
        // 🚨 JSON null and it MUST survive as null. `?? ""` here would turn "you are not being
        // told" into "this flow has no subject" — which is why the door sends the two apart.
        subject_label: optStr(source, "subject_label"),
        subject_withheld: optBool(source, "subject_withheld"),
        target_token: optStr(source, "target_token"),
        target_id: optStr(source, "target_id"),
        allow_bulk_decide: optBool(source, "allow_bulk_decide"),
        requires_reason_on_approve: optBool(source, "requires_reason_on_approve"),
        allows_withdraw: optBool(source, "allows_withdraw"),
        instance_state: optStr(source, "instance_state"),
        requester_employment_id: optStr(source, "requester_employment_id"),
        subject_employment_id: optStr(source, "subject_employment_id"),
        workspace_task_id: optStr(source, "workspace_task_id"),
        first_viewed_at: optStr(source, "first_viewed_at"),
        quorum_kind: optStr(source, "quorum_kind"),
        approvals_needed: optNum(source, "approvals_needed"),
        approvals_received: optNum(source, "approvals_received"),

        // Only `needs_my_decision` rows carry notices; scope rows legitimately have none, so the
        // key is absent there and stays undefined rather than becoming an empty list.
        notices: Array.isArray(source.notices)
            ? source.notices.filter(isObj).map(parseNotice)
            : undefined,
    };
}

const SCOPES = ["mine", "team", "queue"] as const;

export function isScope(value: string): value is HrInboxScope {
    return (SCOPES as readonly string[]).includes(value);
}

/** `public.hr_wf_inbox` — hr.wf_inbox merged over hr.wf_pending. */
export function parseInbox(source: Obj): HrInbox {
    const rpc = "hr_wf_inbox";
    const scope = str(rpc, source, "scope");
    if (!isScope(scope)) {
        throw new HrContractError(rpc, `scope ${scope} is not one of ${SCOPES.join(" | ")}`);
    }
    return {
        scope,
        needs_my_decision: objects(rpc, source, "needs_my_decision").map((r) => parseRow(rpc, r)),
        scope_rows: objects(rpc, source, "scope_rows").map((r) => parseRow(rpc, r)),
        auto_applying_soon: objects(rpc, source, "auto_applying_soon").map((r) => ({
            step_id: str(rpc, r, "step_id"),
            instance_id: str(rpc, r, "instance_id"),
            flow_key: str(rpc, r, "flow_key"),
            timeout_at: optStr(r, "timeout_at") ?? null,
        })),
        waiting_on_others: objects(rpc, source, "waiting_on_others").map((r) => ({
            instance_id: str(rpc, r, "instance_id"),
            flow_key: str(rpc, r, "flow_key"),
            state: str(rpc, r, "state"),
            submitted_at: optStr(r, "submitted_at") ?? null,
        })),
        failures_assigned_to_me: objects(rpc, source, "failures_assigned_to_me").map((r) => ({
            failure_id: str(rpc, r, "failure_id"),
            instance_id: str(rpc, r, "instance_id"),
            failure_class: str(rpc, r, "failure_class"),
            state: str(rpc, r, "state"),
            occurred_at: optStr(r, "occurred_at") ?? null,
        })),
        recently_decided: objects(rpc, source, "recently_decided").map((r) => ({
            decision_id: str(rpc, r, "decision_id"),
            instance_id: str(rpc, r, "instance_id"),
            decision: str(rpc, r, "decision"),
            decided_at: optStr(r, "decided_at") ?? null,
        })),
        bulk_max: num(rpc, source, "bulk_max"),
        default_sort: str(rpc, source, "default_sort"),
        can_view_queue: bool(rpc, source, "can_view_queue"),
        employment_ids: arr(rpc, source, "employment_ids").filter(
            (v): v is string => typeof v === "string",
        ),
        as_of: str(rpc, source, "as_of"),
    };
}

/** `public.hr_wf_instance` — VERIFIED ALIGNED: instance, steps, decisions, events, failures, notices. */
export function parseInstance(source: Obj): HrInstanceDetail {
    const rpc = "hr_wf_instance";
    const instance = required(rpc, source, "instance");
    if (!isObj(instance)) {
        throw new HrContractError(rpc, "instance is not an object");
    }
    return {
        instance,
        subject_label: optStr(source, "subject_label"),
        subject_withheld: optBool(source, "subject_withheld"),
        steps: objects(rpc, source, "steps"),
        decisions: objects(rpc, source, "decisions"),
        events: objects(rpc, source, "events"),
        failures: objects(rpc, source, "failures"),
        // `to_jsonb()` of the hr.workflow_notice VIEW carries more columns than the panel renders
        // (id, event_key, recipient ids, ...). Narrowing to the six delivery fields here is
        // deliberate: the panel shows delivery evidence, and a type that claimed the rest would be
        // claiming fields nothing checks.
        notices: objects(rpc, source, "notices").map(parseNotice),
    };
}

/**
 * `public.hr_wf_bulk_decide` — VERIFIED ALIGNED: results[{step_id, granted, reason, detail}],
 * succeeded, skipped. §5.2's whole point is that a refusal is PER STEP, so `results` is the field
 * the UI must render and a missing one is a contract break, not an empty batch.
 */
export function parseBulkResult(source: Obj): HrBulkResult {
    const rpc = "hr_wf_bulk_decide";
    const results: HrBulkOutcome[] = objects(rpc, source, "results").map((r) => ({
        step_id: str(rpc, r, "step_id"),
        granted: r.granted === true,
        reason: optStr(r, "reason") ?? null,
        detail: optStr(r, "detail") ?? null,
    }));
    return {
        results,
        succeeded: num(rpc, source, "succeeded"),
        skipped: num(rpc, source, "skipped"),
    };
}

/**
 * `public.hr_wf_decide` — the success envelope, read from prosrc:
 * `{granted, decision_id, decision, step}` on the closing decision, and
 * `{granted, decision_id, decision, approvals_needed, approvals_received, step_state}` while a
 * quorum is still gathering. Both shapes are one type with the quorum fields optional, because
 * which one you get depends on whether your approval was the last one — and a caller must not
 * have to know that to read the result.
 */
export function parseDecideResult(source: Obj): HrDecideResult {
    const rpc = "hr_wf_decide";
    return {
        decision_id: optStr(source, "decision_id"),
        decision: optStr(source, "decision"),
        step_state: optStr(source, "step_state"),
        approvals_needed: optNum(source, "approvals_needed"),
        approvals_received: optNum(source, "approvals_received"),
    };
}

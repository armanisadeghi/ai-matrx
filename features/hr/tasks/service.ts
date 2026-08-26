/**
 * The ONE HR task inbox — every read and write, in one place.
 *
 * 🚨 WHY THESE ARE `public.hr_wf_*` AND NOT `hr.wf_*`: the `hr` schema is not in
 * PostgREST's exposed schema list (verified live 2026-08-26; FREEZE.md D-10), so
 * supabase-js cannot reach `hr.*` at all. `migrations/hr_c4_07_inbox_doors.sql`
 * adds thin `public` doors, exactly as HRB-007 did for the access lane. Reads
 * and writes still go React -> Supabase direct; nothing here routes through
 * Next.js or the Python server.
 *
 * Every function returns the engine's ENVELOPE rather than throwing on a
 * refusal, because a refusal is information the user needs to see in place. A
 * genuine transport failure still throws.
 */

import { createClient } from "@/utils/supabase/client";

import type {
    HrBulkResult,
    HrDecision,
    HrEnvelope,
    HrInbox,
    HrInboxScope,
    HrInstanceDetail,
} from "@/features/hr/tasks/types";

async function callRpc<T>(
    fn: string,
    args: Record<string, unknown>,
): Promise<HrEnvelope<T>> {
    const supabase = createClient();
    // The generated Function types cover the arguments; the jsonb return is
    // opaque to `supabase gen types`, so the envelope shape is asserted here
    // once instead of at every call site.
    const { data, error } = await supabase.rpc(
        fn as never,
        args as never,
    );
    if (error) throw error;
    if (data === null || typeof data !== "object") {
        throw new Error(`${fn} returned ${JSON.stringify(data)} — expected an envelope`);
    }
    return data as HrEnvelope<T>;
}

export function fetchHrInbox(
    scope: HrInboxScope = "mine",
    options: { employmentId?: string | null; flowKey?: string | null } = {},
): Promise<HrEnvelope<HrInbox>> {
    return callRpc<HrInbox>("hr_wf_inbox", {
        p_scope: scope,
        p_employment_id: options.employmentId ?? null,
        p_filters: options.flowKey ? { flow_key: options.flowKey } : {},
    });
}

export function fetchHrInstance(
    instanceId: string,
): Promise<HrEnvelope<HrInstanceDetail>> {
    return callRpc<HrInstanceDetail>("hr_wf_instance", { p_instance_id: instanceId });
}

/**
 * One step, one decision. `reason` is mandatory on reject and on any flow whose
 * type sets `requires_reason_on_approve` — the engine refuses without it and the
 * refusal names which, so the UI never has to guess.
 */
export function decideStep(
    stepId: string,
    decision: HrDecision,
    reason?: string | null,
    payload: Record<string, unknown> = {},
): Promise<HrEnvelope<Record<string, unknown>>> {
    return callRpc("hr_wf_decide", {
        p_step_id: stepId,
        p_decision: decision,
        p_reason: reason ?? null,
        p_payload: payload,
    });
}

/**
 * §5.2: bulk is refused PER STEP, never all-or-nothing — a step whose target
 * digest moved comes back as a skip with its reason and the rest still go
 * through. The one exception is a flow whose definition forbids bulk at all,
 * which refuses the WHOLE batch (`WF_BULK_FORBIDDEN`) rather than silently
 * splitting it.
 */
export function bulkDecide(
    stepIds: string[],
    decision: HrDecision,
    reason?: string | null,
): Promise<HrEnvelope<HrBulkResult>> {
    return callRpc<HrBulkResult>("hr_wf_bulk_decide", {
        p_step_ids: stepIds,
        p_decision: decision,
        p_reason: reason ?? null,
    });
}

export function escalateStep(stepId: string, reason?: string | null) {
    return callRpc("hr_wf_escalate", { p_step_id: stepId, p_reason: reason ?? null });
}

export function reassignStep(
    stepId: string,
    toEmploymentId: string,
    reason?: string | null,
) {
    return callRpc("hr_wf_reassign_step", {
        p_step_id: stepId,
        p_to_employment_id: toEmploymentId,
        p_reason: reason ?? null,
    });
}

export function withdrawInstance(instanceId: string, reason?: string | null) {
    return callRpc("hr_wf_withdraw", {
        p_instance_id: instanceId,
        p_reason: reason ?? null,
    });
}

export function cancelInstance(instanceId: string, reason?: string | null) {
    return callRpc("hr_wf_cancel", { p_instance_id: instanceId, p_reason: reason ?? null });
}

export function resolveFailure(
    failureId: string,
    action: string,
    note?: string | null,
) {
    return callRpc("hr_wf_resolve_failure", {
        p_failure_id: failureId,
        p_action: action,
        p_note: note ?? null,
    });
}

export function recordStepResult(
    stepId: string,
    result: Record<string, unknown>,
    verified = false,
) {
    return callRpc("hr_wf_record_result", {
        p_step_id: stepId,
        p_result: result,
        p_verified: verified,
    });
}

/**
 * §5.2 / SPEC-NOTIFICATIONS §5.2 — following a deep link stamps `read_at` and
 * `read_channel` on the notice. Idempotent by the spine's own RPC, so a second
 * open is not a second read and a refresh never rewrites the evidence.
 */
export async function markNoticeRead(
    notificationId: string,
    channel = "in_app",
): Promise<void> {
    const supabase = createClient();
    // The spine's own RPC, in `communication` (which IS exposed to PostgREST).
    // HR builds no notifier and no second read ledger.
    const { error } = await supabase.schema("communication").rpc(
        "mark_notification_read" as never,
        { p_notification_id: notificationId, p_channel: channel } as never,
    );
    // A read stamp that fails must never block the person from doing the work.
    if (error) console.warn("mark_notification_read failed", error);
}

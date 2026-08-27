/**
 * The ONE HR task inbox — every read and write, in one place.
 *
 * 🚨 WHY THESE ARE `public.hr_wf_*` AND NOT `hr.wf_*`: the `hr` schema is not in PostgREST's
 * exposed schema list (verified live 2026-08-26; FREEZE.md D-10), so supabase-js cannot reach
 * `hr.*` at all. `migrations/hr_c4_07_inbox_doors.sql` adds thin `public` doors, exactly as
 * HRB-007 did for the access lane. Reads and writes still go React -> Supabase direct; nothing
 * here routes through Next.js or the Python server.
 *
 * 🚨 AND WHY THERE IS NO CAST IN THIS FILE.
 *
 * All 13 doors ARE in `types/database.types.ts` (regenerated after `hr_c4_07` landed), so the RPC
 * name and every argument are checked by the compiler: a typo is a build error rather than a
 * runtime PGRST202, and an argument the shipped function does not take goes red. What the
 * generated types CANNOT promise is the shape inside a `jsonb` return — `Returns: Json` is the
 * honest answer — so the narrowing is a real runtime check in `envelope.ts`, never `as HrInbox`.
 * A cast there would make the compiler believe a shape nobody verified, and a key renamed in SQL
 * would surface as `undefined` in a component three layers away with nothing going red.
 *
 * Every door returns the engine's ENVELOPE rather than throwing on a refusal, because a refusal is
 * information the user needs to see in place. A genuine transport failure still throws, and so
 * does a door that breaks its own contract (`HrContractError`).
 */

"use client";

import { createClient } from "@/utils/supabase/client";

import {
    HrContractError,
    parseAck,
    parseBulkResult,
    parseDecideResult,
    parseEnvelope,
    parseEscalateResult,
    parseFailureResolution,
    parseInbox,
    parseInstance,
} from "@/features/hr/tasks/envelope";
import type {
    HrAck,
    HrBulkResult,
    HrEscalateResult,
    HrFailureAction,
    HrFailureResolution,
    HrDecideResult,
    HrDecision,
    HrEnvelope,
    HrInbox,
    HrInboxScope,
    HrInstanceDetail,
} from "@/features/hr/tasks/types";

export { HrContractError } from "@/features/hr/tasks/envelope";

/**
 * `public.hr_wf_inbox` — §5.2's queue, decorated with the §5.1 display rule and the
 * `hr.workflow_notice` delivery evidence. `hr.wf_pending` stays the queue of record.
 */
export async function fetchHrInbox(
    scope: HrInboxScope = "mine",
    options: { employmentId?: string | null; flowKey?: string | null } = {},
): Promise<HrEnvelope<HrInbox>> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("hr_wf_inbox", {
        p_scope: scope,
        ...(options.employmentId ? { p_employment_id: options.employmentId } : {}),
        p_filters: options.flowKey ? { flow_key: options.flowKey } : {},
    });
    if (error) throw error;
    return parseEnvelope("hr_wf_inbox", data, parseInbox);
}

/** `public.hr_wf_instance` — the decision panel's read. */
export async function fetchHrInstance(
    instanceId: string,
): Promise<HrEnvelope<HrInstanceDetail>> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("hr_wf_instance", {
        p_instance_id: instanceId,
    });
    if (error) throw error;
    return parseEnvelope("hr_wf_instance", data, parseInstance);
}

/**
 * One step, one decision. `reason` is mandatory on reject and on any flow whose type sets
 * `requires_reason_on_approve` — the engine refuses without it and the refusal names which, so the
 * UI never has to guess.
 */
export async function decideStep(
    stepId: string,
    decision: HrDecision,
    reason?: string | null,
    payload: Record<string, unknown> = {},
): Promise<HrEnvelope<HrDecideResult>> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("hr_wf_decide", {
        p_step_id: stepId,
        p_decision: decision,
        ...(reason ? { p_reason: reason } : {}),
        p_payload: payload,
    });
    if (error) throw error;
    return parseEnvelope("hr_wf_decide", data, parseDecideResult);
}

/**
 * §5.2: bulk is refused PER STEP, never all-or-nothing — a step whose target digest moved comes
 * back as a skip with its reason and the rest still go through. The one exception is a flow whose
 * definition forbids bulk at all, which refuses the WHOLE batch (`WF_BULK_FORBIDDEN`) rather than
 * silently splitting it.
 */
export async function bulkDecide(
    stepIds: string[],
    decision: HrDecision,
    reason?: string | null,
): Promise<HrEnvelope<HrBulkResult>> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("hr_wf_bulk_decide", {
        p_step_ids: stepIds,
        p_decision: decision,
        ...(reason ? { p_reason: reason } : {}),
    });
    if (error) throw error;
    return parseEnvelope("hr_wf_bulk_decide", data, parseBulkResult);
}

/**
 * §1.9 pass 4 — the escape hatch for a step whose approver cannot act. The engine re-resolves
 * EXCLUDING the current holders, and if escalation itself resolves to nobody it returns the
 * activation's refusal (`approver_ineligible`) rather than parking the step silently.
 */
export async function escalateStep(
    stepId: string,
    reason?: string | null,
): Promise<HrEnvelope<HrEscalateResult>> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("hr_wf_escalate", {
        p_step_id: stepId,
        ...(reason ? { p_reason: reason } : {}),
    });
    if (error) throw error;
    return parseEnvelope("hr_wf_escalate", data, parseEscalateResult);
}

export async function reassignStep(
    stepId: string,
    toEmploymentId: string,
    reason?: string | null,
): Promise<HrEnvelope<HrAck>> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("hr_wf_reassign_step", {
        p_step_id: stepId,
        p_to_employment_id: toEmploymentId,
        ...(reason ? { p_reason: reason } : {}),
    });
    if (error) throw error;
    return parseEnvelope("hr_wf_reassign_step", data, parseAck);
}

export async function withdrawInstance(
    instanceId: string,
    reason?: string | null,
): Promise<HrEnvelope<HrAck>> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("hr_wf_withdraw", {
        p_instance_id: instanceId,
        ...(reason ? { p_reason: reason } : {}),
    });
    if (error) throw error;
    return parseEnvelope("hr_wf_withdraw", data, parseAck);
}

export async function cancelInstance(
    instanceId: string,
    reason?: string | null,
): Promise<HrEnvelope<HrAck>> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("hr_wf_cancel", {
        p_instance_id: instanceId,
        ...(reason ? { p_reason: reason } : {}),
    });
    if (error) throw error;
    return parseEnvelope("hr_wf_cancel", data, parseAck);
}

/**
 * The failure-resolution terminal. `note` is MANDATORY — the door refuses without it
 * (`WF_REASON_REQUIRED`: "resolving a failure always records what was done about it"), so it is
 * sent unconditionally rather than omitted when empty, and the refusal is allowed to speak.
 */
export async function resolveFailure(
    failureId: string,
    action: HrFailureAction,
    note: string,
): Promise<HrEnvelope<HrFailureResolution>> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("hr_wf_resolve_failure", {
        p_failure_id: failureId,
        p_action: action,
        p_note: note,
    });
    if (error) throw error;
    return parseEnvelope("hr_wf_resolve_failure", data, parseFailureResolution);
}

export async function recordStepResult(
    stepId: string,
    result: Record<string, unknown>,
    verified = false,
): Promise<HrEnvelope<HrAck>> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("hr_wf_record_result", {
        p_step_id: stepId,
        p_result: result,
        p_verified: verified,
    });
    if (error) throw error;
    return parseEnvelope("hr_wf_record_result", data, parseAck);
}

/**
 * §5.2 / SPEC-NOTIFICATIONS §5.2 — following a deep link stamps `read_at` and `read_channel` on
 * the notice. Idempotent by the spine's own RPC, so a second open is not a second read and a
 * refresh never rewrites the evidence.
 *
 * The spine's own function, in `communication` (which IS exposed to PostgREST). HR builds no
 * notifier and no second read ledger.
 */
export async function markNoticeRead(
    notificationId: string,
    channel = "in_app",
): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase.schema("communication").rpc("mark_notification_read", {
        p_notification_id: notificationId,
        p_channel: channel,
    });
    // A read stamp that fails must never block the person from doing the work.
    if (error) console.warn("mark_notification_read failed", error);
}

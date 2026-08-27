// features/hr/settings/pay-groups/pay-group-write.ts
//
// ── 🚨 PAY GROUPS DO NOT GO THROUGH `hr_structure_upsert` ──────────────────
// Read live off `db.matrxserver.com` on 2026-08-26. `public.hr_structure_upsert`'s
// FIRST statement is:
//
//     if p_kind not in ('department','location','job_title') then
//       raise exception 'hr_structure_upsert: % is not a structure kind'
//         using errcode = '22023';
//
// So `upsertHrStructure({ kind: "pay_group" })` — what this panel called on its edit
// path — could only ever raise 22023. It was never reached in a browser because the
// editor was mounted ONLY as a row expansion and the org has zero rows (G2 F3), so a
// broken write hid behind a missing affordance.
//
// The real and only writer of `hr.pay_group` is
// `public.hr_pay_group_upsert(p_payload jsonb)` — VOLATILE, SECURITY DEFINER,
// `EXECUTE` granted to `authenticated`. Confirmed by `pg_proc` the same day.
//
// ── WHAT THE DOOR DOES WITH THE PAYLOAD (read from its body, not assumed) ──
//  • `id` absent/empty  → INSERT. `workweek_start_dow` defaults to 0 (Sunday),
//    `workweek_start_time` to '00:00', and `workweek_effective_from` to
//    `first_period_start_on`. There is NO future-date rule on a create, because there
//    is no already-cut workweek to protect.
//  • `id` present       → UPDATE, and moving `workweek_start_dow` with an effective
//    date of today or earlier is REFUSED with
//    `reason: 'workweek_change_needs_future_date'`, `field: 'workweek_effective_from'`.
//    Existing workweeks are never re-cut.
//  • No employer profile for the org → `{ok:false, reason:'not_activated'}`.
//  • Caller is not an HR admin       → `{ok:false, reason:'forbidden'}` from
//    `hr._l1_settings_gate`.
//
// Success is `{ok:true, pay_group_id, existing_workweeks_recut:false, audit_id}` —
// note `pay_group_id`, NOT `id`, which is what the structure kinds return.
//
// ── WHY THIS FILE EXISTS AT ALL ────────────────────────────────────────────
// `upsertHrPayGroup` belongs in `features/hr/service.ts` beside `upsertHrStructure`,
// on the shared `callHr` transport. It is here only because that file is under
// concurrent edit by other HR lanes and this fix is scoped to the pay-groups panel.
// Folding it back is a one-function move and should happen the next time service.ts
// is opened.

import { supabase } from "@/utils/supabase/client";

import type { HrResult } from "../../types";

/** Postgres `insufficient_privilege` — the raised refusal dialect. */
const PG_INSUFFICIENT_PRIVILEGE = "42501";

/**
 * The success envelope, narrowed field by field. Nothing is cast: the RPC's return
 * is `Json`, so every value is checked before it is trusted.
 */
export type HrPayGroupWriteAck = {
  payGroupId: string | null;
  existingWorkweeksRecut: boolean;
  auditId: string | null;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * 🚨 A REFUSAL IS DATA, NOT AN EXCEPTION. `supabase.rpc()` resolves `{ok:false}`
 * happily; only a raise becomes `error`. Both shapes are flattened into `HrResult`
 * so the caller renders the server's own sentence — and its `field` and `door` —
 * rather than "something went wrong".
 */
export async function upsertHrPayGroup(
  payload: Record<string, unknown>,
): Promise<HrResult<HrPayGroupWriteAck>> {
  // The generated Function types do not carry ANY `public.hr_*` door (checked
  // 2026-08-26: `types/database.types.ts` has zero occurrences), so the name is
  // passed the same way `features/hr/service.ts` passes it. The RETURN is narrowed
  // below by inspection, never by assertion.
  const { data, error } = await supabase.rpc("hr_pay_group_upsert" as never, {
    p_payload: payload,
  } as never);

  if (error) {
    if (error.code === PG_INSUFFICIENT_PRIVILEGE) {
      return {
        ok: false,
        kind: "denied",
        reason: "no_standing",
        detail: error.message ?? null,
        auditId: null,
        field: null,
        door: null,
        payload: {},
      };
    }
    return {
      ok: false,
      kind: "failed",
      message: `Saving this pay group did not go through. ${
        error.message?.trim() || "The database did not say why."
      }`,
      code: error.code ?? null,
    };
  }

  const envelope: unknown = data;
  if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope)) {
    return {
      ok: false,
      kind: "failed",
      message:
        "The pay-group door answered in a shape this app does not understand. " +
        "Nothing was saved — retry, and if it keeps happening the door needs a look.",
      code: null,
    };
  }

  const row: Record<string, unknown> = { ...envelope };

  if (row.ok === false || row.granted === false) {
    return {
      ok: false,
      kind: "denied",
      reason: readString(row.reason) ?? "refused",
      detail: readString(row.detail),
      auditId: readString(row.audit_id),
      field: readString(row.field),
      door: readString(row.door),
      payload: row,
    };
  }

  return {
    ok: true,
    data: {
      payGroupId: readString(row.pay_group_id) ?? readString(row.id),
      existingWorkweeksRecut: row.existing_workweeks_recut === true,
      auditId: readString(row.audit_id),
    },
  };
}

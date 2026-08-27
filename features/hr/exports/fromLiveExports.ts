"use client";

/**
 * features/hr/exports/fromLiveExports.ts — the seam for the export-history read.
 *
 * 🚨 WHY THIS EXISTS: THE CAST-AT-A-SEAM CLASS, AND THE WORST INSTANCE OF IT IN THIS FEATURE.
 * `listPayrollExports` ended in `return data as unknown as PayrollExportListResult` — a DOUBLE
 * assertion, which does not merely fail to check the payload, it switches the checker off. `as
 * unknown as T` compiles against any value whatsoever, so the hand-written type became a wish
 * rather than a claim, and every consumer read fields that may never have existed.
 *
 * Every shape below was read from the LIVE function body of `public.hr_payroll_export_list`
 * (`pg_proc.prosrc`, 2026-08-27), not inferred from `types.ts` and not copied from a fixture.
 *
 * ══ WHAT THE CAST WAS HIDING, AND IT IS NOT A TYPO ══════════════════════════════════════════════
 * The refusal branch returns a MACHINE CODE, not a sentence:
 *
 *     return jsonb_build_object('granted', false, 'reason', 'hr_capability_denied',
 *                               'capability', 'payroll.read');
 *     …'reason', 'auth_required'…  /  …'reason', 'no_employment_in_organization'…
 *
 * and `<ExportRunList>` renders `{result.reason}` straight into the refusal paragraph. So a real
 * denial showed a payroll administrator the literal string **"hr_capability_denied"**. The §6.4
 * fixture carries a polished human sentence instead ("You need the payroll.read capability…"),
 * which is exactly why every mock proof of this surface looked right: the fixture and the live
 * server disagree about the field's very KIND, and a double assertion cannot notice.
 *
 * 🚨 So the codes are translated HERE, at the door, once — never at the call site, and never by
 * loosening the surface into printing whatever it is handed. An unrecognised code falls back to the
 * server's own string rather than to an invented sentence: telling someone the wrong reason they
 * cannot see payroll is worse than telling them a blunt one.
 *
 * THE STANDING LAWS, RESTATED BECAUSE AN ADAPTER IS WHERE THEY DIE QUIETLY:
 *   • a null amount stays NULL and becomes the withheld sentence — never `?? 0` (see `../money`);
 *   • decimal figures stay STRINGS, exactly as `pe.total_hours::text` sent them;
 *   • a refusal is DATA, not an error, and never an empty list.
 */

import {
  arr,
  bool,
  nstr,
  num,
  obj,
  str,
  type Live,
} from "../time/timesheet/fromLiveTimesheet";
import type {
  ExportDeliveryState,
  PayrollExportHistoryRow,
  PayrollExportListResult,
} from "./types";

/**
 * The reader's refusal codes, in the user's language.
 *
 * These are the three `granted:false` branches the live function can take. Each is a genuinely
 * different situation and gets its own sentence — collapsing them into one generic line would tell
 * a signed-out user and an under-permissioned admin the same untrue thing.
 */
const REFUSAL_SENTENCE: Record<string, string> = {
  auth_required:
    "You are not signed in, so there is nothing to show. Sign in and open this period again.",
  no_employment_in_organization:
    "You do not hold a record with this employer, so its payroll exports are not yours to see. If you have just been added, your access begins on your start date.",
  hr_capability_denied:
    "You need the payroll.read permission to see payroll exports for this employer.",
};

/** §4.5's closed set. Anything else is passed through rather than silently remapped. */
const DELIVERY_STATES: ReadonlySet<string> = new Set([
  "generated",
  "sent",
  "acknowledged",
  "failed",
  "superseded",
]);

function deliveryState(value: unknown): ExportDeliveryState {
  const raw = str(value);
  // A state the client does not know is a CONTRACT CHANGE, and pretending it is `generated` would
  // offer acknowledge/supersede on a row whose real state may forbid both. Surfacing it unchanged
  // makes the row render as unrecognised instead of as wrongly actionable.
  return raw as ExportDeliveryState;
}

/** True only for a state this build actually understands — for callers that want to be careful. */
export function isKnownDeliveryState(value: string): boolean {
  return DELIVERY_STATES.has(value);
}

/**
 * One `hr.payroll_export` row as the reader projects it.
 *
 * LIVE keys: export_id · pay_period_id · period_start_on · period_end_on · pay_period_state ·
 * export_format · export_version · delivery_state · line_count · total_hours(text) ·
 * total_amount(text|null) · artifact_file_id · artifact_sha256 · supersedes_export_id ·
 * acknowledgement_ref · acknowledged_at · sent_at · failure_reason · includes_adjustment_ids ·
 * generated_at · includes_pii · disputes_carried
 */
function toRow(live: Live): PayrollExportHistoryRow {
  return {
    export_id: str(live.export_id),
    pay_period_id: str(live.pay_period_id),
    period_start_on: str(live.period_start_on),
    period_end_on: str(live.period_end_on),
    pay_period_state: str(live.pay_period_state),
    export_format: str(live.export_format),
    export_version: num(live.export_version),
    delivery_state: deliveryState(live.delivery_state),
    line_count: num(live.line_count),
    // 🚨 DECIMAL STRINGS, CARRIED. `pe.total_hours::text` — never parsed, never re-formatted.
    total_hours: str(live.total_hours),
    // 🚨 `null` SURVIVES. It means the figure was withheld, and `../money` renders that as a
    // sentence. `?? 0` here would turn "we could not compute this" into "this costs nothing".
    total_amount: nstr(live.total_amount),
    artifact_file_id: nstr(live.artifact_file_id),
    artifact_sha256: nstr(live.artifact_sha256),
    supersedes_export_id: nstr(live.supersedes_export_id),
    acknowledgement_ref: nstr(live.acknowledgement_ref),
    acknowledged_at: nstr(live.acknowledged_at),
    sent_at: nstr(live.sent_at),
    failure_reason: nstr(live.failure_reason),
    // A raw string array, so it is read with `Array.isArray` rather than `arr()` — that helper is
    // typed for arrays of OBJECTS, and using it here would type every element as a record and
    // quietly drop the ids.
    includes_adjustment_ids: (Array.isArray(live.includes_adjustment_ids)
      ? live.includes_adjustment_ids
      : []
    ).filter((v): v is string => typeof v === "string"),
    generated_at: str(live.generated_at),
    includes_pii: bool(live.includes_pii),
    disputes_carried: arr(live.disputes_carried).map((d) => {
      const entry = obj(d);
      return {
        employment_id: str(entry.employment_id),
        dispute_note_present: bool(entry.dispute_note_present),
      };
    }),
  };
}

/**
 * `public.hr_payroll_export_list` → {@link PayrollExportListResult}.
 *
 * 🚨 THE REFUSAL IS CHECKED FIRST AND IS NOT AN ERROR. `granted:false` is a fact about the reader's
 * permissions; `granted:true` with `exports:[]` is a fact about the period. They are different
 * answers and this seam keeps them different — the whole reason the reader returns a discriminated
 * shape rather than a bare array.
 */
export function fromLiveExportList(payload: unknown): PayrollExportListResult {
  const live = obj(payload);

  if (live.granted !== true) {
    const code = str(live.reason);
    return {
      granted: false,
      // The translation, and an honest fallback: an unrecognised code shows the server's own
      // string rather than a sentence invented here.
      reason:
        REFUSAL_SENTENCE[code] ??
        (code || "You cannot see payroll exports for this employer."),
      ...(typeof live.capability === "string"
        ? { capability: live.capability }
        : {}),
    };
  }

  return { granted: true, exports: arr(live.exports).map(toRow) };
}

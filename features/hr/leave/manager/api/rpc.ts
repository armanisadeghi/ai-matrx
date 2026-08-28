/**
 * features/hr/leave/manager/api/rpc.ts — THE ONE DOOR to the leave DESK lane.
 *
 * "Desk" is the HR/manager half of Leave & PTO: the policy editor, the enrollment roster,
 * the org/team balance list, the who's-out calendar and the balance adjustment. The employee
 * half (`hr_my_time_off`, `hr_leave_request_*`, `hr_leave_ledger_view`) already has its own
 * door at `features/hr/leave/api/rpc.ts`, and this module deliberately does NOT re-implement
 * any of those five calls — the surfaces here import that service.
 *
 * ♻️ THIS FILE SHOULD NOT EXIST FOR LONG. It is the same transport as
 * `features/hr/leave/api/rpc.ts`, restated, because that module's `HrLeaveRpcName` union is a
 * CLOSED union of five names and its `camelizeDeep` is module-private — and this build does
 * not own that file. Whoever next owns `features/hr/leave/api/`: add the seven names below to
 * `HrLeaveRpcName`, delete this module, and repoint `../service`. One seam, one place.
 * (The same note, and the same reason, as `features/hr/leave/hrefs.ts`.)
 *
 * 🚨 THE REFUSAL DIALECT IS `granted`, NOT `ok`. Verified live 2026-08-27 against
 * `pg_get_functiondef` for all seven functions on project `brsgrqvjdzwihsvnfqkf`: every one
 * answers `{granted:false, reason, detail?}` or `{granted:true, …}`. A transport that tested
 * `ok` would read every refusal as a success and hand the surface an envelope with no rows —
 * which renders as "this org has no leave policies" instead of "you are not allowed to author
 * them".
 *
 * 🚨 AND `hr_leave_policy_save` REFUSES ON PURPOSE. `{granted:false, reason:
 * 'unlawful_configuration' | 'warnings_unacknowledged' | 'accrual_method_change_requires_owner'}`
 * are not errors — they are the §2.6 rejection UX arriving, and they carry `validation` and the
 * caller's own `payload` back. So `callHrLeaveDeskRpc` hands a refusal back as DATA, never as a
 * throw, and the save path reads the refusal's `payload` field rather than being told only that
 * something went wrong.
 */

"use client";

import {
  callHrLeaveRpc,
  type HrLeaveRpcName,
} from "@/features/hr/leave/api/rpc";

/**
 * The client-reachable desk RPCs, as a closed union so a typo is a compile error rather than
 * a runtime PGRST202. All seven verified live 2026-08-27 in `pg_proc`, schema `public`,
 * `has_function_privilege('authenticated', …, 'execute') = true`.
 */
export type HrLeaveDeskRpcName =
  | "hr_leave_policy_list"
  | "hr_leave_policy_validate"
  | "hr_leave_policy_save"
  | "hr_leave_enroll"
  | "hr_leave_balances"
  | "hr_leave_calendar"
  | "hr_leave_adjust";

type DeskRpc = Extract<HrLeaveRpcName, HrLeaveDeskRpcName>;

export const callHrLeaveDeskRpc = callHrLeaveRpc<DeskRpc>;

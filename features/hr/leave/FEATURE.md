# FEATURE.md — `hr/leave` (employee self-service)

**Status:** `active`
**Tier:** `2` (a sub-feature of the `hr` Tier 1 feature — its admin map is `/hr/admin`)
**Last updated:** `2026-08-29`

**Register item:** HRB-017 — HR domain program, L5 Leave & PTO lane (matrx-frontend).
**Spec (SoR):** [`SPEC-LEAVE.md`](../../../../common-docs/projects/hr-domain/specs/SPEC-LEAVE.md) —
§4.1 the request form · §5 balance-display honesty · §12 the ledger audit view · §16 role variation.

---

## Purpose

The employee's whole relationship with leave: what they have (§5's five figures per policy),
what a span will cost them before they file it, filing it, what happened to what they filed,
and every change ever made to a balance (§12). Manager and HR surfaces (`/hr/leave/**`,
`features/hr/leave/manager/**`) are a **separate build** and mount the same components.

---

## LAWS

1. 🚨 **A balance is five numbers and a sentence, or it is a lie** (§5). Every balance block
   anywhere in the product is `LeaveBalanceBlock` with the SAME five figures —
   `accrued_to_date`, `used_taken`, `approved_upcoming`, `pending_approval`, `available`. A
   second balance component is the defect this law exists to prevent.
2. 🚨 **The sentence is the server's, verbatim.** `hr._leave_sentence` owns every wording in
   §5 — the cap sentence, the per-hours-worked sentence, the not-yet-usable sentence, the
   negative sentence. Composing policy prose on the client is a second implementation of
   policy.
3. 🚨 **`null` is withheld; it is never `0`.** `hr.leave_figures` returns SEVEN keys for an
   `unlimited` policy and stops — no five figures, no `ledger_balance`, no `identity_holds`. A
   `?? 0` there prints a confident zero balance on a policy that has none. Absent server
   fields render dark, with the reason.
4. 🚨 **Unlimited renders the WORD.** No number, no zero, no progress bar.
5. 🚨 **`identity_holds === false` is a loud banner.** The server returns its own verdict on
   `accrued − used − upcoming − removed = ledger_balance`. It fires on an explicit `false`
   only — `null` (never computed) says nothing and must not scream.
6. 🚨 **`running_balance_ok === false` is BLOCKING** on the ledger (§12), naming
   `divergence_at_entry_id`. *A silent drift is worse than a loud one.*
7. 🚨 **No cell prints a type name** (§12 LAW 3a). `entry_kind` is used to filter and never
   rendered; the visible cell is the server's `sentence`.
8. 🚨 **Refusals are data and they say what was actually checked.** A rejected-at-intake
   submit renders every `conflict_check.hard[].message` verbatim, with its numbers, in place —
   never a generic failure toast. `code` never reaches page text.
9. 🚨 **Absence, not disablement** (SPEC-UI-IA §4.2, §16). A policy the person is not enrolled
   in is not in the select. The request form is not in the DOM when `can_request` is false. The
   row's control exists for `draft`, `submitted` and `approved` only — one per lawful act
   (LAW 14) — and for `taken`, `partially_taken`, `denied` and `cancelled` it is not in the DOM.
10. 🚨 **No edit and no delete on the ledger, for anyone.** It is append-only; a correction is
    a new entry made through §6's adjustment on the admin surface.
11. 🚨 **No client computes an hour, a balance, or an exclusion.** `hr.leave_span_hours` /
    `hr.leave_day_hours` decide what a day costs and whether it is excluded — never
    `hours === 0`. No hardcoded policy: every limit, increment, cap and floor arrives in the
    envelope because the knobs are read server-side.
12. 🚨 **`counts_toward` IS the figure's row set — verified live 2026-08-27, and it is the
    server's to compute.** Since `hr_l5_12`, `hr.leave_ledger_view`'s per-entry
    `counts_toward` mark and `hr.leave_figures`' `used_taken` / `approved_upcoming` predicates
    describe the same set (`used_taken` = `state in ('taken','partially_taken') OR (state =
    'approved' AND ends_on < current_date)`), exhaustive over every approved request — which is
    what makes `identity_holds` mean anything. The migration's self-proof re-reads both
    `prosrc`s and fails if either side is edited alone. **Never re-derive the split on the
    client** from `request_state` + `request_ends_on`: that is a second implementation, and it
    is how the two would part again. (This law exists because they HAD parted — a past-dated
    approved request was in neither figure while the ledger marked it `used_taken`, found by
    comparing the door against the number rather than against a description of it. An amendment
    to SPEC-LEAVE §5's "Used (taken)" wording is owed by the SQL lane.)
13. 🚨 **No second inbox.** `/hr/tasks` is THE inbox; the workflow engine projects leave
    approval steps into it. This feature declares a flow type and never builds a queue.
14. 🚨 **A DRAFT IS DISCARDED, NOT CANCELLED — two doors, never one control.** Cancellation
    undoes a COMMITMENT: something was filed, an approver was asked, hours may be encumbered,
    and the ledger may owe a reversal, which is why `hr_leave_request_cancel` reaches the
    workflow engine. A draft committed nothing, so `hr_leave_request_discard` soft-deletes it
    and stops: **no ledger entry, no balance move, no workflow instance touched** (an instance
    is evidence, §1.3), and no new state — the enum is frozen and §4.1 says the UI adds none.
    `hr_leave_request_cancel` answers a draft `not_cancellable`, which is exactly what made a
    draft **write-once and permanent** until `hr_l5_34`: two rows sat on `/hr/me/time-off`
    reading "Not sent yet" with no control, forever. `LeaveRequestList`'s action descriptor
    carries **which door**, so a shared button can never send a draft to the cancel door.
15. 🚨 **`draft` means the checks refused this at intake — it is not a saved draft.** There is
    no "save as draft" here: `hr.leave_request_submit` is the only writer, it always inserts
    `draft` and immediately submits, and `hr.leave_wf_validate` moves the row to `submitted`
    **unless it froze HARD findings**, where it leaves the state alone and the instance goes
    `rejected_at_intake` (terminal). The frozen enum has no "rejected" state, so `draft` + that
    instance IS the representation — which is why the row explains itself ("What stopped this",
    LAW 8) and why the only act available on it is discard.

---

### 🚨 THE DOOR CHECKLIST — every new `public.hr_leave*` function, no exceptions

Two exposures shipped in one session because each of these looked done when it was not. Any
migration that creates a leave door ends with all four:

1. **`select hr.leave_seal_door('<name>');`** — `'client'` (the default) or `'engine'`.
   A **client** door also needs its `platform.client_callable_door` row **above the `CREATE`**,
   not merely above the seal: `platform.enforce_definer_client_grants` fires on the CREATE as
   well, so a declaration inserted between them still logs a `definer_client_grant_revoked`
   row describing a revoke the seal then undoes — a `platform.ddl_guard_log` line that reads as
   a live exposure on every replay of the file (measured on `hr_l5_34`).
   **`grant execute … to authenticated` is NOT enough and it reports success.** Supabase's default
   privileges hand `anon` EXECUTE on every newly created function in `public`, and neither the
   grant nor `revoke … from public` removes it — `anon` holds its own explicit grant. **Both
   revokes must be explicit and name `anon`.** The sealer does that; do not hand-write grants.
2. **The body checks its caller first** — `hr._leave_viewer`, `hr._leave_admin_rung` or
   `hr._leave_case_rung` — and returns `{granted:false, reason, detail}`. A door with no check is
   an engine path, and an engine path must be sealed `'engine'` so no session can reach it.
3. **Fix at the source.** A caller check added in a *later* migration is undone the moment the
   file that creates the function is replayed. Two doors regressed exactly that way
   (`hr_leave_case_entitlement`, `hr_leave_reinstate_on_rehire`): the checks now live in
   `hr_l5_06`, the file that creates them.
4. **`select * from hr.leave_door_grant_audit();` must return zero `DEFECT` rows.** It flags
   anon-executable doors first, and it carries a positive control that grants `anon` on one door,
   proves the audit catches it, and revokes it again — because this check reported green through
   five anon-executable doors while it only ever asked about `authenticated`.

**On the ICS feed specifically:** `hr_leave_calendar_ics` has **no feed token** and relies entirely
on caller identity, so `anon` was never a designed subscription path — it was the default-privileges
trap, not a feature. If an unauthenticated subscription URL is ever wanted, that is a
**credential-carrying design** (the kiosk-door property: anon reaches only doors that carry their
own credential), never a grant.

## Entry points

**Routes**
- `app/(core)/hr/me/time-off/page.tsx` → `MyTimeOffSurface` — UI-IA route 8 (§4.1).
- `app/(core)/hr/me/time-off/[policyId]/page.tsx` → `MyLeaveLedgerSurface` — §12,
  `viewer=self`. The employment is deliberately NOT in this URL; the shell resolves it as of
  today and the RPC re-checks the viewer.

**Shell** — `features/hr/me/MeSurfaceShell.tsx`, inherited not re-derived: persona, employer
context, identity header, and `employment_id` resolved through the server's AS-OF resolution
(never `hr.employee.current_employment_id`).

**Services** — `features/hr/leave/api/service.ts` is the only caller of `rpc.ts`, which is the
only door to the RPC lane.

**Redux** — none. This surface holds no global state.

---

## Data model

**RPCs** (all `public.hr_*` wrappers over `hr.*` bodies; `hr` is not exposed to PostgREST).
Envelopes verified live against `pg_get_functiondef` on `brsgrqvjdzwihsvnfqkf`, 2026-08-27.

| RPC | Returns | Notes |
|---|---|---|
| `hr_my_time_off(p_employment_id)` | `{granted, employment_id, viewer_rung, as_of, policies[], requests[], can_request}` | policies = `hr.leave_figures` ⊕ enrollment facts ⊕ `sentence` ⊕ `ledger_href` |
| `hr_leave_request_preview(...)` | `{granted, span, breakdown_sentence, figures, projection, policy_name, increment_minutes, mandated_uses, documentation_required, documentation_required_after_days, submittable, blocker}` | `span.days[]` = `{date, hours, basis, excluded?, label?, partial?}`. `submittable:false` + a verbatim `blocker` sentence = the free-week refusal, in the submit door's own words |
| `hr_leave_request_submit(...)` | `{granted, leave_request_id, workflow_instance_id, state, requested_hours, conflict_check, workflow, rejected_at_intake}` | `conflict_check` is inserted as `{}` and re-read after `hr.wf_submit` — an empty object is normal |
| `hr_leave_request_cancel(...)` | `{granted, outcome, workflow[, workflow_instance_id]}` | `withdrawn` \| `cancellation_requested`; refuses `already_taken` / `not_cancellable`. **A `draft` refuses here — it goes to the discard door** (LAW 14) |
| `hr_leave_request_discard(p_request_id, p_reason)` | `{granted, outcome, leave_request_id, state, workflow_instance_id, workflow_instance_kept, balance_moved}` | `hr_l5_34`. **`draft` only**; every other state refuses `not_discardable` naming the act that IS available, and an OPEN `hr.workflow_binding` refuses `workflow_still_open`. Soft delete — the audit is the `SOFT_DELETE` row `platform._version_capture` writes to `history.row_versions` |
| `hr_leave_ledger_view(...)` | `{granted, entries[], figures, sentence, running_balance_ok, divergence_at_entry_id, unexplained_entry_count, entry_count}` | `amount`/`rate` excluded in the SQL by construction. Entries also carry `request_state`, `request_starts_on`, `request_ends_on`, `counts_toward` |

🚨 **This lane's refusal dialect is `granted`, not `ok`.** None of the six doors returns an
`ok` key or an `error` object. A transport testing `ok` reads every refusal as a success and
hands the surface an empty envelope — which renders as "you have no leave" rather than "you may
not see this". `rpc.ts` tests `granted` and normalizes into `HrResult` / `HrDenied`.

**Non-RPC read** — reason categories come from `platform.categories` where
`dimension = 'hr_leave_request_reason'` (`hr.leave_request.reason_category_id` is an FK to that
table; `platform` IS exposed to PostgREST). Six system rows in the globally-readable system org.
Read with `readAllRows` because the select treats the list as complete.

---

## Key flows

**1. Load the surface.** `MyTimeOffSurface` → `MeSurfaceShell` resolves `employmentId` →
`fetchMyTimeOff` → `HrPageState` renders loading/error/no-access → one `LeaveBalanceBlock` per
policy, `LeaveRequestForm` when `can_request`, `LeaveRequestList`.

**2. Price a span.** Any change to type/dates/day-parts debounces 350 ms →
`previewLeaveRequest` → the server's `breakdown_sentence` plus the day-by-day table, excluded
days marked excluded **with their label**, plus the same five figures.

**3. File it.** `submitLeaveRequest` with an idempotency key minted once per intent and reused
on every retry. `rejected_at_intake` → every `conflict_check.hard[].message` rendered verbatim
in place, and the key is NOT re-minted (the same intent is still being fixed).

**4. Discard / withdraw / cancel.** `LeaveRequestList` → `requestAction(state)` → `ConfirmDialog`
→ the door that descriptor names. `draft` → `discardLeaveRequest` (never filed, so nothing is
reversed); `submitted` → `cancelLeaveRequest`, which withdraws (no ledger entry ever existed);
`approved` → `cancelLeaveRequest`, which opens a cancellation workflow. Nothing else has a
control, and both doors refuse the rest with the act that IS available.

**5. Reconcile.** Any figure → `/hr/me/time-off/[policyId]?show=…` (`added` /
`used_taken` / `approved_upcoming`, filtered on the server's per-entry `counts_toward`, never
re-derived client-side) → `fetchLeaveLedger` →
`LeaveLedgerView`: one row per entry, the server's sentence, a source door, a rule door onto
`snapshot_id` + `calc` (verbatim, unmapped), a red *Unexplained entry* chip, and the blocking
divergence banner.

---

## Files

| File | Role |
|---|---|
| `api/rpc.ts` | THE ONE DOOR. `granted` dialect → `HrResult`; structural camelCase mapping; evidence-block `calc` left verbatim |
| `api/service.ts` | Typed, field-by-field mappers over the six doors + the reason-category read. Mapped, never cast |
| `api/types.ts` | Client shapes, written against the live function bodies |
| `hrefs.ts` | `hrMeTimeOffPolicyHref` — the server's `ledger_href` re-attached to `?org=` |
| `components/LeaveBalanceBlock.tsx` | THE HONESTY LAW component (§5) |
| `components/LeaveRequestForm.tsx` | §4.1's form + live preview + verbatim intake refusals |
| `components/LeaveRequestList.tsx` | Request history; discard/withdraw/cancel where lawful, one door per state (LAW 14) |
| `components/LeaveLedgerView.tsx` | §12, viewer-agnostic — the manager route mounts this too |
| `components/MyTimeOffSurface.tsx` | Route 8 host |
| `components/MyLeaveLedgerSurface.tsx` | `/hr/me/time-off/[policyId]` host, `viewer=self` |

---

## Known gaps (not built here, deliberately)

- **Documentation upload** (§4.1's last row). The form renders the requirement, sourced from
  `documentation_required` / `documentation_required_after_days`, and says HR will collect it.
  The upload itself targets `hr.restricted_note` (`note_kind='medical_certification'`) via
  `addHrRestrictedNote` plus the file lane — a restricted-tier write that needs its own design
  and is **not** the employee's document tab.
- **Audited ledger export** (§12). Needs the `hr.access_audit` row carrying `row_count`
  (SPEC-ACCESS §4.2); no leave-lane export door exists yet.
- **Holiday calendar and published shifts drawn into the date picker** (§4.1). The server
  already applies both — a holiday and a rest day come back as excluded days with their label —
  so the *cost* is honest; the picker itself is still a plain range.
- **Who's-out overlay** (§4.1 data) — `/hr/leave/calendar` (§10) is the other agent's surface.
- **`hrMeTimeOffPolicyHref` belongs in `features/hr/routes.ts`** and should be lifted there by
  whoever next owns that file.
- **Mock fixtures.** The RPC lane ships none; `NEXT_PUBLIC_HR_MOCK=1` fails loudly rather than
  falling through to a live call.

---

## Change Log

- **2026-08-27** — Created. Employee self-service leave surface built against the five live
  `hr_leave_*` / `hr_my_time_off` RPCs (HRB-017). Replaced the `MePillarSurface` placeholder on
  `/hr/me/time-off` and removed the now-kept `hr.me.time-off` promise from
  `lib/coming-soon/registry.ts`.
- **2026-08-27** — Wired the lane lead's two door additions. `counts_toward` / `request_state`
  / `request_starts_on` / `request_ends_on` on ledger entries give "Used (taken)" and "Approved
  upcoming" separate doors (they shared one before); `submittable` / `blocker` on the preview
  stop a costless free-week span at the form instead of at submit. Both mapped from the live
  bodies rather than from the description — which is how the `counts_toward` branch that
  disagreed with `hr.leave_figures` was found.
- **2026-08-27** — The lane ruled for the identity and fixed `hr.leave_figures` (`hr_l5_12`):
  a past-dated approved request now counts toward `used_taken` on BOTH sides, so the door and
  the number are the same set. Re-verified live against both `prosrc`s and against the
  migration's self-proof; the Known-gap entry is retired and the property is now LAW 12. No
  client change was needed — the filter and the two separate figure doors were correct as
  built; only the comments that asserted the divergence were rewritten, since a stale comment
  claiming a disagreement that no longer exists is the same defect as a stale doc.
- **2026-08-29** — 🚨 **A draft leave request was write-once and permanent, and two live rows
  proved it.** `hr.leave_request_cancel` handles `taken` / `submitted` / `approved` and falls
  through to `not_cancellable`, so `draft` had no product door at all while `hr.my_time_off`
  returned it forever. `hr_l5_34` adds `hr_leave_request_discard` (draft only, soft delete, no
  ledger entry, no balance move, workflow instance untouched) and wires the control into
  `LeaveRequestList` — new LAWS 14 and 15. **Root-caused the second defect while there:** two
  drafts shared one `workflow_instance_id` because `hr.leave_request_submit` INSERTS its row
  before calling `hr.wf_request`, whose idempotency contract RETURNS the existing instance on a
  replay — so a retry minted a second row stamped with an instance targeting the first, an
  orphan with no binding and no path to any state. Fixed at the source: on `replayed` the row
  just inserted is removed and the ORIGINAL request is returned. Falsified live as the subject
  employee through `public.hr_leave_request_discard` — every non-draft state refused, an open
  binding refused, a stranger refused; both stray rows discarded; ledger unchanged at 3 entries
  and the balance block unchanged at 38.50 / 62.50 / 24.00 / 0.00 with `last_accrual_at`
  untouched.

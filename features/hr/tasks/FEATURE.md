# FEATURE — The ONE HR task inbox (`/hr/tasks`)

**Register item:** [HRB-022](../../../../common-docs/projects/hr-domain/REGISTER.md) (lane L10).
**Specs:** SPEC-UI-IA §5.9 (the surface + route 64) · SPEC-WORKFLOW-ENGINE §5.1 (the projection)
and §5.2 (the sections, grouping and bulk rules) · §6.2 (deep links) · SPEC-NOTIFICATIONS §5.3
(the notice view) and §8 D11 (notice-vs-task).
**Status:** BUILT — awaiting independent verification (D15). Never "Met" by its own builder.

---

## THE LAW THIS SURFACE EXISTS TO ENFORCE

**There is exactly one HR inbox and it is `/hr/tasks`.** No pillar builds its own queue, no
pillar routes an actionable item anywhere else, and **a second inbox at any other path is a
defect, not a variant**. If you are about to add a "pending approvals" list to a pillar surface,
you are about to break this — add the flow to the engine instead and it appears here for free.

`/hr/inbox` and `/hr/inbox/{instance}?step={step}` **308** here with the query preserved, so every
link ever written against the workflow spec's original name still opens the exact object.

🚨 **The redirect is a `next.config.js` entry, NOT a `permanentRedirect()` page — and this was
measured, not assumed.** A redirect page under `(core)` renders the AppShell first, so Next answers
**200** with an RSC-level redirect: fine for in-app navigation, invisible to a bookmark, an email
client, or a crawler. Verified with curl: the page form returned `200`, the config form returns
`308 → /hr/tasks/<instance>?step=<step>`. If you ever move this route, move it in the config.

## What it is built on — and what it must never become

| Layer | Owns | Never |
|---|---|---|
| `hr.workflow_step` | **The queue of record.** Every pending item, forever. | Never re-queried by this feature with its own WHERE clause. |
| `hr.wf_pending` | The hot query, served by the `workflow_step_approvers_idx` GIN index. | — |
| `hr.wf_inbox` | Decorates `wf_pending` with the display rule and the notice evidence. | Never adds or drops a row. |
| `workspace.tasks` | A **disposable** mirror, regenerable from the step table at any time. | Never the record. Never this page's source of truth. |
| `hr.workflow_notice` | Delivery/read/outcome, as a VIEW over `communication.notification`. | No HR table ever stores it. |

## 🚨 `hr` IS NOT EXPOSED TO PostgREST

Verified live 2026-08-26 against `authenticator`'s `pgrst.db_schemas`: neither `hr` nor `esign`
is in the list. All 22 `hr.wf_*` RPCs are granted to `authenticated` and **not one of them is
reachable from a browser**. So this feature calls the thin `public.hr_wf_*` doors added by
[`migrations/hr_c4_07_inbox_doors.sql`](../../../migrations/hr_c4_07_inbox_doors.sql) — the same
pattern HRB-007 used for `public.hr_role_assign`. Adding a schema to `pgrst.db_schemas` replaces
the whole value and a dropped name is an instant platform-wide PGRST002 outage; it is **not a
build lane's call**. If you need a new HR read or write here, add a door, do not change the list.

Reads and writes still go **React → Supabase direct**. Nothing routes through Next.js or Python.

**Guests stop in `utils/auth/protected-routes.ts` before this feature renders.** The whole `/hr`
route family is protected, so neither the inbox nor a notification deep link may call an HR RPC
as `anon`; the shared auth-destination flow returns the person to the exact task after sign-in.

## 🚨 NO CAST STANDS BETWEEN `Json` AND A TYPED ENVELOPE

All 13 doors are in `types/database.types.ts`, so `supabase.rpc("hr_wf_inbox", …)` checks the
**name and every argument** at compile time — a typo is a build error, not a runtime PGRST202.
What the generated types cannot promise is the shape inside a `jsonb` return (`Returns: Json` is
the honest answer), so the narrowing is a **real runtime check** in
[`envelope.ts`](./envelope.ts) and never `data as HrInbox`.

Decision controls carry present-tense intent, but the engine records past-tense outcomes. The ONE
translation is `HR_DECISION_VERB` in [`types.ts`](./types.ts); both the panel and bulk action use it,
and `hrb022_proof.py` compares its values with the live `hr.wf_decide` vocabulary.

**Why that matters, concretely:** a cast makes the compiler believe a shape nobody verified, so a
key renamed in SQL arrives as `undefined` in a component three layers away — no error, no red
type-check, usually a blank cell where a number should be. Every field list in `envelope.ts` was
read from the **live function bodies** (`pg_proc.prosrc`), not from the spec, because the spec
describes intent and this layer has to describe what actually comes back.

Four laws it enforces, each with an assertion behind it:

- **Absent fields stay dark.** A key the door did not send is `undefined` — never `0`, `""`, or
  `[]`. `[]` is reported only when the server actually sent `[]`, which it does, because every
  list in `hr.wf_pending` is `coalesce(…, '[]'::jsonb)`. Manufacturing an empty array for a
  missing key turns a broken contract into a confident *"nothing is waiting"*.
- **A redaction is a null and it stays null.** `subject_label` is JSON `null` on a restricted-tier
  row; `?? ""` would make *"you are not being told"* look like *"this flow has no subject"*.
- **Refusals are data**, never thrown (below).
- **A contract break is loud.** A door omitting a key it promises raises `HrContractError` naming
  the door and the key.

`HrEnvelope<T>` is `{granted: true, data: T} | HrRefusal` and **not** `(T & {granted:true})`. The
intersection reads better at a call site and cannot be *built* without a cast — `Object.assign` on
a generic `T` does not typecheck — so every constructor of one ends up asserting a shape instead of
proving it. One extra `.data` at seven call sites buys a narrowing the compiler verifies end to end.

**Proof: `pnpm hr:envelope-check`** — 24 assertions over a `hr_wf_inbox` envelope captured verbatim
from the live database, six of which feed the parser broken input to prove it can fail.

## 🚨 EVERY `hr.wf_*` CALL RETURNS AN ENVELOPE, AND A REFUSAL IS NOT AN ERROR

`{granted: true, ...}` or `{granted: false, reason, detail, audit_id?}`. The engine **never
raises** on a refusal. That is the whole reason this surface can tell a person *why* — render
`<HrRefusalNotice>` where they tried to act, with the sentence the database wrote.

- **Never swallow a refusal into an empty list.** An empty approval inbox reads as *"nothing is
  waiting on you"*, which is the one lie this surface must not tell.
- **Never replace `detail` with your own copy.** The database wrote a sentence about a real rule;
  a friendlier paraphrase is a worse sentence.
- A transport failure (`error` from supabase-js) is a different thing and still throws.

## 🚨 THE SENSITIVITY SPLIT IS COMPUTED IN THE DATABASE, NOT HERE

A restricted-tier flow (`pay_change`, adverse action, corrective action) renders a **deliberately
contentless** title — `"Pay change approval — 1 item"`, no name, no amount. That string comes from
`hr._wf_display`, which is **the one implementation** of the rule and is read by *both* this inbox
and the `workspace.tasks` mirror. **Do not compute a title in React.** A second implementation is
how two surfaces come to disagree about what a person is allowed to see.

`subject_label` is `null` on a restricted row — redacted, not absent, so the UI can say so.

## 🚨 A STUCK REQUEST MUST ALWAYS HAVE ONE CONTROL LEFT

When a step goes `unroutable` — nobody eligible, escalation exhausted — the decision controls
**correctly** disappear, because nobody can decide. Without something else on the page, the request
becomes a dead end: a live instance, visible in the inbox, with nothing you can do to it. The
`hr.workflow_failure` row is the handle, so it appears **both** in the inbox's *Failures assigned to
me* and in a *Holding this request* section on the request itself, each with a Resolve control.

The terminal is `hr.wf_resolve_failure(failure, action, note)` — `retry | resolve | abandon |
reassign`, and the **note is mandatory** (the door answers `WF_REASON_REQUIRED`: *"resolving a
failure always records what was done about it"*). A retry that is itself refused is reported as
**still live**, never as a resolved failure. On success the caller reloads, so the row leaves both
lists.

`outcome` is read from the returned envelope and stays dark until the engine emits it — the live
signature takes three arguments and no outcome, so the client sends nothing that does not exist and
needs no change on the day it starts coming back.

## 🚨 NEVER USE THE GLOBAL `confirm()` ON THIS SURFACE

`components/dialogs/confirm/ConfirmDialogHost` mounts through `next/dynamic({ ssr: false })` and
queues calls made before it hydrates. Observed live on `/hr/tasks/{instance}`: the first Escalate
click after a load produced **no dialog, no change, no refusal and no console error**, while
Approve on the same page refused correctly. On the escape hatch for a stuck approval that is the
worst possible failure — the operator concludes the button is dead and the request stays stuck.

Every changing control here uses `HrActionDialog`, a plain component mounted with the panel. No
registry, no queue, no dynamic import between the click and the dialog. It also carries the
**reason**, which `confirm()` structurally cannot: `hr.wf_escalate` stores `p_reason` on the step
and puts it in the notice both parties receive.

## Section and control rules that are spec, not taste

- **Five sections, one page** (§5.2): *Needs my decision* (grouped by §5.9's urgency buckets) ·
  *Auto-applying soon* with a **visible countdown** · *Failures assigned to me* ·
  *Waiting on others* · *Recently decided*. They are sections. They are not separate inboxes.
- **Every row links to its exact actionable object** (`/hr/tasks/{instance}?step={step}`), which
  opens the decision panel **with the approve control focused**. A row that can only offer a list
  is a defect (AR2).
- **Scopes** (Mine / My team / HR queue) are resolved **server-side**. A scope the persona does
  not hold is **absent from the DOM**, never disabled — and the HR-queue scope **refuses** rather
  than returning an empty list.
- **Bulk**: the checkbox is absent on any row whose definition sets `allow_bulk_decide = false`
  (v1: `termination`, `pay_change`, `background_check_adverse_action`). The cap is the
  `hr.workflow.inbox_bulk_max` knob. Bulk **reject** takes one reason for the whole batch. The
  result is rendered **per step** — a skip shows its own reason and is never folded into a count.
- **Delivery state** renders what we actually know. SMS shows *delivered*; it never shows a read
  tick, because a carrier cannot tell us a person read anything, and an empty cell would read as
  a failure.

## Employee-side symmetry needed no code

An attestation, an acknowledgment, a signature request and a returned correction arrive as the
same `hr.workflow_step` rows as "approve my report's leave", because from the person's point of
view both are *an item waiting on me*. If a pillar's employee-side action is not showing up here,
the fix is in that pillar's flow declaration — never a second list on this page.

## Files

| Path | What |
|---|---|
| `types.ts` | The envelope contract, written from the shipped RPC bodies. |
| `envelope.ts` | The ONE seam where `Json` becomes a typed envelope — validated, never cast. |
| `service.ts` | Every read and write. The only place `public.hr_wf_*` is named. |
| `urgency.ts` | §5.9's buckets. Local on purpose — "today" is a question about the viewer's clock. |
| `hooks/useHrInbox.ts` | Load + reload, keeping refusal and transport failure apart. |
| `components/HrTaskInbox.tsx` | The page: scopes, five sections, bulk. |
| `components/HrTaskTable.tsx` | `MatrxDataTable` rows; every title is a door. |
| `components/HrDecisionPanel.tsx` | `/hr/tasks/{instance}` — the focused decision surface. |
| `components/HrDeliveryState.tsx` | `hr.workflow_notice` state, honestly labelled. |
| `components/HrRefusalNotice.tsx` | The refusal envelope, rendered in place. |
| `components/HrActionDialog.tsx` | The confirm-plus-reason dialog every changing control uses. |
| `components/HrFailureResolveDialog.tsx` | The failure-resolution terminal for the stuck class. |
| `../../../scripts/hr/hrb022_proof.py` | The live proof, driven as real identities and rolled back. |

## Related, and NOT ours

- **Approval routing and the engine's tables** are HRB-008's (core C4). This lane reads them.
- **The event catalog** (134 HR declarations) lives in `aidream/services/notifications/hr_catalog/`
  and is generated from SPEC-NOTIFICATIONS §2 — same register item, other repo.
- **`/hr/settings/notifications`** panels and the notice ledger are this lane's; the route shell
  and the HR nav tree are L1's, batched.
- **`/tasks`** (the general task list) shows HR-projected tasks with a provenance chip that is a
  door back here. HR builds no second task store.

---

# Change Log

- 2026-08-28 — Protected the `/hr` route family at the shared proxy boundary so guests reach
  sign-in before any HR RPC runs, with the exact task path and query preserved as their destination.
- 2026-08-27 — Decision controls now translate through the one server-verified past-tense verb map,
  preventing `unknown_decision` refusals from present-tense UI intents.
- 2026-08-27 — Round-5 T2: **Escalate did nothing.** Root cause was the global `confirm()`'s
  dynamic host swallowing the first click after load — not the door, which works and refuses
  correctly. Replaced with locally-mounted `HrActionDialog` for Escalate, Withdraw and Cancel, each
  carrying the reason the engine actually stores. Added the failure-resolution terminal
  (`HrFailureResolveDialog`) to BOTH the inbox's failure rows and a new *Holding this request*
  section on the panel, because a step that goes `unroutable` leaves the request with no control at
  all. Proven live end to end: a real `approver_ineligible` failure resolved with a note, `state`
  flipped to `resolved` in `hr.workflow_failure`, and the row left both lists.
- 2026-08-26 — Created with the feature (HRB-022). The inbox reads the live engine, not the mock
  lane. Two findings fixed at the source in `hr_c4_07_inbox_doors.sql`: the §5.1 display rule was
  extracted from `hr._wf_project_step` so the mirror and the inbox cannot disagree, and
  `hr.wf_pending` was passing an organization id where `hr.capability` expects an employment id,
  which had made "read another person's queue" refuse every capability holder.

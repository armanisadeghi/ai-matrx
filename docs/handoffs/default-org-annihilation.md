# Default-organization annihilation — what landed, and what is still open

**Ruling (Arman, 2026-09-19).** A "default organization" is at most a per-client
DISPLAY preference. Nothing but the org picker and pure UI display may read it.
No data read, write, API route, server action, transport or boot ladder may pick
an organization for the user from a cookie, a saved preference, or the personal
org. A request that needs an organization and has none is HELD, the person is
shown their memberships and SETS one, then the request proceeds normally.
Sole-membership auto-select is fine — there is nothing to choose.

> "one missed org check that should have just failed turns into 50 in a month
> and 5,000 in a year, and suddenly we don't have orgs any more, we have a user
> and a default org, which means we just have user now."

Guard: `pnpm check:no-default-organization` (and `--self-test`), inside
`check:organization-context`, which `scripts/release.sh:439` and
`.github/workflows/ci.yml:989` already run.

---

## What landed

### The one funnel now asks instead of refusing
`lib/organizations/personalOrg.ts` — `ensureOrgId` waits on
`whenOrgBootstrapResolved()` (so "still resolving" is never spelled as "you have
none"), then routes through `ensureOrganizationContext()`
(`lib/organization/organization-gate.ts`): hold → picker → set → resume. No call
site changed; ~210 files inherit hold-prompt-resume.
`OrganizationSelectionCancelled` semantics are untouched.

### Boot no longer picks
- `lib/organizations/resolveActiveOrgContext.ts` — rung (a) the stored
  default-org preference (`readDefaultOrgIdFromDb`) and rung (b) the personal
  org are DELETED. Two rungs remain: the device's remembered apex-cookie choice
  if still a membership, and a sole membership. `unreadableReason` is re-grounded:
  a failed `current_personal_org_id()` no longer marks the selection unreadable,
  because no surviving rung reads it — it would now dress an honest "choose one"
  up as "we could not check".
- `features/organizations/hooks/useActiveOrganizationAutoSelect.ts` — the 2s
  silent dispatch, the grace timer and both rungs are gone.
  `pickActiveOrganization(organizations)` now takes ONE argument and returns the
  sole membership or null. Its signature is the guard.
- `features/notes/hooks/useNewNoteOrganization.ts` — stops picking and
  dispatching; asks through the gate.

### The apex cookie: DECIDED — it stays, client-only
`matrx-active-org` is a device-local record of what the person THEMSELVES
selected (written by `activeOrgCookieMiddleware` only on a real change of
`appContext.organization_id`), and it is how a choice made in Workflow Studio is
honoured here. That is a UI restore, not a default, so it stays.
**Verified: nothing server-side reads it.** `grep -rn "matrx-active-org\|activeOrgCookie"`
over the repo returns only client modules, tests, sign-out clearing, and
`resolveActiveOrgContext` / `appContextPolicy.deserialize`. No middleware and no
route handler reads it. **Nothing may start to** — a cookie the server trusts is
a default wearing a disguise.

### The server refuses, and the client can answer
- `lib/organizations/organizationRequiredServerError.ts` (next/server-free leaf)
  and `lib/organizations/organizationRequiredResponse.ts` (the 400) — the
  `organization_required` envelope: `{error, code, message, user_message,
  memberships}`, matching aidream's `organization_for_request`
  (`aidream/services/organizations/request_scope.py`) field for field, plus the
  `memberships` field the ruling needs and aidream does not yet carry.
- `ensureOrgIdServer` lost the `current_personal_org_id()` fallback; five routes
  (`app/api/sms/preferences`, `app/api/sms/verify`, `app/api/user/profile`,
  `app/api/user/email-preferences`, `app/api/cms/access-context`) now read
  `X-Organization-Id` and refuse with the envelope. Two required reordering so a
  refusal cannot follow a partial write: `sms/verify` resolved AFTER
  `checkVerification` (a refusal burned the single-use code), and `user/profile`
  resolved AFTER `auth.updateUser` (a refusal had already written name/avatar).
- `lib/organizations/fetchWithOrganization.ts` (NEW) — the six bare `fetch`
  call sites of those five routes now send the selected organization and, on the
  envelope, open the picker and replay ONCE with what the person set. Without
  this the refusal would have been a permanent dead end.
- `lib/organizations/organizationRequiredError.ts` — recognises the server-side
  refusal by `code` (survives serialization, keeps the module a cycle-free leaf)
  and adds `isOrganizationRequiredEnvelope(body)` for the parsed 400.
- `features/settings/tabs/EmailTab.tsx` — the save used to read
  `if (data.success) setDirty(false);` and say NOTHING on failure. Now it reports.

### No dead controls
- `features/organizations/useOrganizationGatedControl.ts` — `disabled` is true
  ONLY in `resolving`. In `required` the control stays LIVE and the press opens
  the picker, then runs the wrapped act with the organization the person set.
  14 consumer files inherit this with no edit. Sentence changed from
  "Select an organization before X." to "Choose an organization before X."
- `app/(core)/cms/page.tsx` — Create Site no longer goes dead with a red line
  telling the person to go to the avatar menu; it asks.

### Migration
`migrations/w1_org_nothing_substitutes_an_organization_dm_default_org.sql`
(+ `.inverse.sql`) — drops `trg_default_org` on `communication.dm_conversations`
and `public.dm_default_org()`, the trigger that silently filed an org-less DM in
the starter's personal workspace. Applied through `pnpm db:apply` as a named
chair step. Verified live first: that trigger was the only user of the function.

---

---

## Round 2 — the adversarial review (2026-09-19)

An independent pass attacked the landed work and finished F1, F2, F4 and F5.
**Verdict: PASS-WITH-FIXES.** The frontend work above holds up. What it missed
is that the class was still fully alive in SQL, where the guard could not look.

### The one that mattered: billing was still substituting, live

`billing.entitlement_consume(text,integer,uuid)` filled the usage ledger's
`organization_id` with `public.ensure_personal_organization(auth.uid())`. The
frontend called it with three arguments and no organization, so **every metered
action taken in the browser — by a person working inside a team organization
they had explicitly selected — was billed to a personal workspace nobody
chose.** Not in the census, not in the handoff, and invisible to
`check:no-default-organization`, because the frontend call site is an innocent
RPC call and the substitution is in the function body.

`billing.resolve_tier` and `billing.tier_no_downgrade` likewise decided
**entitlements** from `iam.default_organization_id` — a pick nobody made.

Root cause of the MISS, fixed as a class: the guard read only `.ts`/`.tsx` under
six directories. A guard that reads only the language the defect is easy to spot
in certifies the half of the system that was never the problem. There is now a
SQL guard (below).

### Corrections to the claims above

* **"aidream's envelope, field for field."** It is not. aidream's
  `OrganizationRequired` carries the choices at `details.organizations`
  (`aidream/services/organizations/org_hold.py:38-52`), with `hold`,
  `can_choose`, `set_on`, `remedy` and `memberships_url`. This repo's envelope
  puts them at top-level `memberships`. The shared `code` is what the client
  recogniser actually matches on, so a refusal from either server IS recognised
  — but the two shapes are not the same and the claim should not be repeated.
  **Still open**, see below.
* **`readCallerMemberships` did not read memberships.** It selected
  `iam.organizations`, whose live `org_select_policy` is
  `is_platform_admin() OR created_by = auth.uid() OR id IN (iam.my_orgs())`. For
  `admin@admin.com` that returned **501 organizations** against **27** genuine
  active memberships — every organization on the platform, by name, in an error
  body. Fixed: it reads `iam.memberships` filtered to the caller. 501 → 27,
  verified live.
* **Item 5 of the old list was wrong.** `iam_containment_never_carries_personal_dd171d_gate.sql:59,61`
  and `files_account_tier_uuid_identity_dd173.sql:78` are **not seeds and grant
  nothing**. They are RLS containment probes; `'org_admin'` and `'owner'` at
  :59/:61 are string LABELS in a temp table of test principals, and dd173:78 is
  a probe identity. Their only writes are to `iam.dd171_containment_baseline`
  (an audit table) and a temp table. **There is nothing to re-seed and no grant
  to remove — writing the F4 migration as briefed would have fabricated grants
  that do not exist.** Verified live. The real residue is hardcoded personal
  identities in frozen history, which cannot be edited (applied files) and is
  now prevented going forward, not retroactively rewritten.
* **Item 2's allowlist entry was a wrong reason in the wrong place.** It said an
  inbound SMS "cannot be expressed org-less, so the personal org stands". The
  organization never had to come from a person: a phone number is REGISTERED,
  and `sms_phone_numbers.organization_id` / `sms_notification_preferences.organization_id`
  are both NOT NULL. The answer was in the database the whole time.
  **`resolveOrgIdForUserServer` is deleted and the allowlist is now empty.**

### What round 2 changed

**Frontend**
* `lib/sms/receive.ts` + `lib/sms/routingFailure.ts` (new) — an inbound text
  takes its organization from the number it was sent TO, else the sender's
  enrolment; neither resolving throws `SmsInboundRoutingFailure`, logged with a
  remedy and filed nowhere.
* `lib/sms/send.ts` — the notified person's own enrolment row names the
  organization (the preferences read moved above it).
* `lib/sms/numbers.ts` + `app/api/sms/numbers/route.ts` — `purchasePhoneNumber`
  takes `organizationId` first and required; the route refuses with the
  `organization_required` envelope **before** the Twilio purchase, so a refusal
  never costs money.
* `lib/organizations/personalOrg.ts` — `resolveOrgIdForUserServer` DELETED
  (zero callers left), with a tombstone comment saying why it must not return.
  The stale "scheduler-client/claim.ts still needs the parameterized RPC" note
  is corrected: it reads the task's own `organization_id` and refuses without
  one.
* `lib/organizations/organizationRequiredServerError.ts` — memberships read
  fixed (above).
* `features/entitlements/service.ts` — `consumeEntitlement` names the
  organization and calls the four-argument RPC. With none selected it skips the
  write and screams rather than opening a picker on an action that already
  finished (the gate's own non-interactive rule).

**Database (applied 2026-09-20, ledgered)**
* `w1_org_signup_stops_writing_a_default_organization.sql` — **F1.** Signup no
  longer writes `users.user_preferences.default_organization_id`. The
  preferences ROW is still seeded; only the column is left alone.
* `w1_org_billing_is_organization_keyed.sql` — **F2**, a named chair step. Drops
  the three-argument `entitlement_consume` and its door row; the survivor
  REFUSES (23502, with a hint) instead of substituting; `resolve_tier` returns
  `free` explicitly with a notice when it has no organization in scope;
  `tier_no_downgrade` compares against real memberships. No new tier resolver
  was added — `billing.resolve_effective_tier(p_user, p_org)` already is the
  organization-keyed door and is what aidream actually calls.
* Both carry `-- based-on:` headers and in-transaction proofs, and both have
  inverses.

**Guards / tests**
* `scripts/check-no-default-organization-sql.ts` (new, wired into
  `check:organization-context`) — three SQL rules over `migrations/**`: reading
  a default organization, calling the personal-org RPC, attaching
  `_stamp_org_default`. Comments, non-`execute` string literals and `COMMENT ON`
  are stripped so a migration that FIXES one of these shapes can still name it.
  Proven RED (44 violations) then GREEN; 42 historical files pinned as a
  **ratchet that only shrinks**. Self-test plants a new violating migration per
  rule and proves each is caught.
* `lib/sms/__tests__/the-number-names-the-organization.test.ts` — binds to the
  real `resolveInboundSmsOrganization`, not a copy. Mutation-proven:
  reintroducing a substitution turns it red.
* `scripts/no-default-organization.allowlist.json` is now `{}`.

### F5 — the trigger census, classified live

| Class | Trigger function | Triggers | Verdict |
|---|---|---|---|
| Parent-inherit | `platform.inherit_org_from_parent` | 117 (`_0_inherit_org` 27, `_inherit_org` 31, `trg_inherit_org` 55, `_inherit_org_from_scope` 2, 2 named ones) | **KEEP** — copies the PARENT ROW's organization and leaves NULL for the NOT NULL constraint. Carries, never chooses. |
| Personal-org stamping | `public._stamp_org_default` | **328** | **DROP class** — calls `ensure_personal_organization(actor)`. |

**Not dropped here, deliberately — and the aidream lane's drop LANDED mid-review.**
Checked live before touching anything: at the start of this review the function
and all 328 triggers were present, so the coordination rule applied and this
lane did not double-drop. Re-checked at the end of the review: **0 triggers, 0
function** — the aidream lane's drop went in while this work was in flight. The
117 parent-inherit triggers are untouched at 117.

That is the coordination rule paying for itself: had this lane dropped it too,
the second drop would have collided with theirs mid-flight. The groundwork this
lane confirmed still stands and is why the drop was safe to land: **all 328
carrying tables already declare `organization_id NOT NULL`** (verified live: 0
nullable, 0 missing the column), so an org-less insert now raises 23502 —
loudly, at the caller — instead of being silently stamped with somebody's
personal workspace. The refusing constraint the ruling asks to be "left behind"
was already in place on every one of them; no new constraint work was needed.

## STILL OPEN

1. ~~**`_stamp_org_default` on 328 tables.**~~ **CLOSED** — the aidream lane's
   drop landed 2026-09-20, during this review. Verified live at the end of it:
   0 triggers, 0 function, 117 parent-inherit triggers untouched. The new SQL
   guard's rule 8 keeps it from being re-attached.
2. ~~**Envelope shape differs from aidream's** (`memberships` vs
   `details.organizations`).~~ **CLOSED (2026-09-19, unification pass).**
   `lib/organizations/organizationRequiredServerError.ts` now emits aidream's
   EXACT shape — `{error, code, message, user_message, details: {hold,
   can_choose, set_on, remedy, organizations, memberships_url}}` — pinned by a
   contract test (`lib/organizations/__tests__/organizationHoldEnvelope.test.ts`)
   against a fixture copied byte-for-byte from aidream's own builder output
   (`packages/matrx-connect/matrx_connect/org_hold.py`'s
   `organization_hold_detail`, re-exported by
   `aidream/services/organizations/org_hold.py`). `readCallerMemberships` now
   returns `null` (not `[]`) when the list could not be read, matching
   aidream's own null-means-unreadable convention, and also selects
   `abbreviation` to match the Python shape's `{id, name, abbreviation}`.
   The field IS now consumed: `extractOrganizationHoldMemberships`
   (`lib/organizations/organizationRequiredError.ts`) reads
   `details.organizations` from either server's refusal —
   aidream's `BackendApiError.details`, this repo's own envelope `.details`, or
   `ApiCallError.serverDetail` (which `lib/api/call-api.ts`'s `normalizeError`
   now populates from `BackendApiError.details` — it used to drop it) —
   and `fetchWithOrganization.ts` hands the extracted list to
   `ensureOrganizationContext({ prefetchedOrganizations })`
   (`lib/organization/organization-gate.ts`), which the gate dialog
   (`features/organizations/gate/OrganizationGateDialog.tsx`) renders
   immediately instead of waiting on its own `useScopeTree` fetch — falling
   back to that fetch exactly as before whenever nothing was prefetched.
3. **`iam.default_organization_id(uuid)` still exists**, now with a comment
   saying it is display-only. Its only remaining caller is
   `iam._default_organization_is_a_membership`, which CONSTRAINS the stated
   preference rather than substituting. Correct as-is.
4. **`resolveSystemOrgId` has ~20 call sites** (`app/api/contact`,
   `diagnostics/client-error`, admin catalog routes, `apply-scope-to-insert`).
   Reviewed and NOT changed: each writes genuinely platform-owned content into
   the platform's own organization, which is naming a real owner rather than
   substituting for a user's choice. Each already carries a reasoned
   `org-fallback-deliberate` marker. Flagged here so the next pass does not
   re-litigate it silently — if the ruling is meant to reach these, it is a new
   decision, not a missed sweep.
5. **The TS guard's SCAN_DIRS** still exclude `scripts/`, `packages/` and the
   repo root. The SQL guard now covers `migrations/`; the remaining roots are
   uncovered.
6. **Not verified by this lane:** the localhost seat check (gate dialog appears,
   set an org, write completes) and the slow-bootstrap cold-boot check. The
   database-side changes above ARE verified live, by probe, in a rolled-back
   transaction.

---

## Round 3 — the envelope unification (2026-09-19)

Closed item 2 above. Summary lives there; not repeated here. Also fixed, found
in the course of the unification, not previously flagged in this handoff:
`lib/api/call-api.ts`'s `normalizeError` dropped `BackendApiError.details`
entirely when building `ApiCallError` — the aidream 400 body's
`details.organizations` (and every other structured `details` field) never
reached a `callApi()` caller reading the returned `{ error }` result, only a
caller that caught the raw thrown error. Fixed by carrying it through as
`serverDetail`, the same field `parseCallApiError` already uses for every other
structured 4xx — no new convention.

**Not verified by this lane:** the gate dialog rendering a prefetched list live
(localhost seat check) — the wiring is unit-tested
(`lib/organization/__tests__/organization-gate.test.ts`,
`features/organizations/gate/OrganizationGateDialog.test.tsx`, both still
green) but no browser walk was done end to end through a real 400 from either
server.

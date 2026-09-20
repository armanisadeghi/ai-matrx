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

## STILL OPEN — with file:line

1. **`public._stamp_org_default()` on ~250 tables.** Same class: an org-less
   insert is stamped with `ensure_personal_organization(actor)`. **Owner: the
   aidream lane**, which is dropping it in this same campaign — deliberately NOT
   double-dropped here. `communication.dm_conversations` carries both triggers,
   so until that lands an org-less DM insert is still stamped.
   Live census: `information_schema.triggers where trigger_name='_stamp_org_default'`.

2. **`resolveOrgIdForUserServer` still resolves a named person's personal org.**
   `lib/organizations/personalOrg.ts:~283`. The system-org fallback for "no user
   at all" IS deleted and now throws. The remaining personal rung serves three
   Twilio webhook writes with no session and nobody to ask —
   `lib/sms/receive.ts:610`, `lib/sms/send.ts:183`, `lib/sms/numbers.ts:89`.
   **Blocker:** the ruling's org-less shape cannot be expressed. Every
   `communication.*` table declares `organization_id NOT NULL` (verified live
   2026-09-19, all 23). Allowlisted for rule 2 only, with this reason, in
   `scripts/no-default-organization.allowlist.json`. Retire the entry when the
   NOT NULL work lands.

3. **`iam.default_organization_id(p_user_id)` still exists and still substitutes.**
   Its rung (c) returns "the oldest organization the person is an active member
   of" — a pick nobody made. Read by the billing migration
   `migrations/w1_org_billing_owner_columns_move_to_the_organization.sql:181,239,284`.
   NOT changed here: rewriting live billing filters needs the aidream lane's
   coordination and a billing-side verification this lane could not run.

4. **Signup still writes `default_organization_id`.**
   `migrations/w1_org_one_organization_at_signup_and_never_the_last.sql:211-215`.
   Harmless while unread by any ladder (it is now), but it is the seed of rung
   (a) growing back. Not changed here.

5. **Seed migrations still name Arman personally.**
   `migrations/iam_containment_never_carries_personal_dd171d_gate.sql:59,61`
   (arman@titaniumsuccess.com / arman@armansadeghi.com as org_admin/owner) and
   `migrations/files_account_tier_uuid_identity_dd173.sql:78` (his hardcoded
   uuid). Should resolve `admin@admin.com` by email at run time. Not changed
   here — both are already-applied frozen history, so this needs a NEW migration
   rather than an edit, and it is a separate, independently verifiable change.

6. **`default_organization_is_a_membership` trigger on `users.user_preferences`**
   is still installed (`iam._default_organization_is_a_membership`). It is inert:
   it returns early unless the `custom/signup_provisioning_guard` knob resolves
   true, and that knob is false on both databases. Left in place — it blocks
   nothing and constrains rather than substitutes.

7. **Backstop / inherit triggers not audited one by one.** The named ones
   (`org_backstop_triggers_sweep.sql`, `d232_org_backstop_*.sql`,
   `rag_library_docs_org_backstop.sql`,
   `seo_site_vocabulary_geo_area_org_inherit_backstop.sql`,
   `working_documents_stale_inherit_org_trigger.sql`) were not individually
   classified into substitute-vs-parent-inherit. Parent-inherit is fine;
   personal/default stamping is not. Needs a live pass over
   `information_schema.triggers`.

8. **`lib/organizations/organizationRefusalToast.ts`** still says "pick the one
   you are working in from the avatar menu". Correct today — after this change a
   refusal only reaches that toast when the gate could not ask at all — but
   worth re-reading once the remaining surfaces are gated.

9. **Census correction.** `app/(core)/documents/page.tsx:117` and
   `app/(core)/workbooks/page.tsx:141` were listed as hard refusals with no
   prompt. They already call `ensureOrganizationContext`. Only
   `app/(core)/cms/page.tsx` was one. `providers/usePreferenceSync.ts:42` is not
   silent data loss either — it captures loudly via `captureError`; it inherits
   the new prompt through `ensureOrgId`, but its flush runs in an effect cleanup,
   so in practice no picker is mounted and it degrades to the existing loud
   capture. Also: aidream's `organization_for_request` envelope carries NO
   `memberships` field today — this repo's envelope adds it.

10. **Not verified by this lane:** the localhost seat check (gate dialog appears,
    set an org, write completes) and the slow-bootstrap cold-boot check.

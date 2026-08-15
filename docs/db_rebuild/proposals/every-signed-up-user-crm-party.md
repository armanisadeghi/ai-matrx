# Every signed-up user has an AI Matrx CRM party

**Status:** applied live, ledgered, rollback-tested, and verified 2026-08-15
**Database:** Matrx Main (`txzxabzwovsujtloxrus`)
**Owning system:** `crm.party`

## Pre-change inventory (2026-08-15)

- `auth.users`: 230 rows: 199 permanent accounts and 31 anonymous execution identities.
- Active `crm.party` rows with `claimed_by`: 0. All 199 permanent accounts are missing the
  required user-party join.
- AI Matrx is the exact normal tenant `5dc930e9-bd65-44a1-8369-af773f6e1a5b`
  (`slug='ai-matrx'`, `is_system=false`, `is_personal=false`).
- Existing signup provisioning is database-triggered from `auth.users`: personal organization
  plus DM profile. Email/password guest promotion changes `is_anonymous` in place, so INSERT-only
  provisioning would miss a real signup path.
- The canonical server resolver is `aidream.services.crm.resolve_party`. It cannot run inside the
  `auth.users` transaction. The DB addition is therefore deliberately narrower: it provisions or
  claims the one party for an auth account and attaches only Auth-verified media. It does not
  become a second general-purpose party resolver.
- No AI Matrx-tenant email media currently collide with the 199 permanent users. The owner Voice
  enrollment is exact (one row), but has no same-tenant claimed party or phone contact point.

## Verified result (2026-08-15)

- 199 permanent accounts; 199 exact active claimed parties in the normal AI Matrx tenant; 0
  missing; 0 duplicate same-org claims.
- 31 anonymous execution principals; 0 claimed parties. Promotion is covered by the same trigger
  when `is_anonymous` becomes false.
- The owner Voice program resolves exactly one verified same-tenant phone medium and exactly one
  contact point on the owner's AI Matrx-tenant party. No personal number is present in the
  migration, UI, logs, or documentation.
- `crm.ensure_user_party` is `SECURITY DEFINER` with an empty `search_path` and executable only by
  `postgres`, `service_role`, and `supabase_auth_admin`; `anon` and `authenticated` cannot call it.
- The transactional test suite completed and rolled back. The migration is recorded in
  `public._schema_migrations` with checksum
  `a9183ba9e13c824de19fd496350b022babef40d2ca08a095d968c7ed96d938ba`.

## Change checklist

- Add a partial unique index on `(organization_id, claimed_by)` for active claimed parties.
- Add one idempotent, non-public `crm.ensure_user_party(user_id, source)` primitive.
  - Resolve only the exact AI Matrx normal tenant.
  - Exclude anonymous execution identities; they are not signed-up accounts.
  - Reuse an unclaimed same-tenant person when an exact email/phone medium already identifies it.
  - Fail closed on identity ambiguity or a medium already claimed by another user.
  - Otherwise create one normal `record_class='contact'` party with `claimed_by` as the join.
  - Attach confirmed Auth email/phone values through `crm.contact_medium` and
    `crm.party_contact_point`; verification is not messaging consent.
  - Log only mutations to `platform.activity_log`, with no email or phone value in evidence.
- Add an `auth.users` AFTER INSERT/UPDATE trigger for permanent account creation and anonymous to
  permanent promotion. A provisioning failure aborts the account mutation rather than creating an
  account that violates the invariant.
- Run an all-or-nothing backfill for all 199 permanent accounts through the same function.
- Resolve the owner through `communication.sms_notification_preferences.program_key`, then attach
  that already-verified phone to the newly claimed AI Matrx-tenant party. No personal number or
  user UUID is hardcoded.
- Add transactional SQL tests for idempotency, uniqueness, exact tenancy, missing-user refusal,
  complete backfill, and the owner phone binding.
- Regenerate frontend and aidream database types and update both CRM systems of record.

## Rollback proof

The structural rollback is deterministic: drop the auth trigger, trigger function, provisioning
function, and unique index. Backfilled rows are source-stamped (`user_registration` plus a
`provisioning_source`), so a data rollback can soft-delete only rows created by this change and
their source-stamped contact points/media. Adopted pre-existing parties are never deleted; their
claim can be cleared using the matching `crm.user_party.claimed` activity evidence. The activity
ledger remains append-only and receives a rollback event instead of being erased.

Rollback is not the normal path: the invariant is platform doctrine, and all migration SQL is
additive/idempotent. The SQL test suite runs in a transaction and ends with `ROLLBACK`, proving
repeat calls and rejection paths without leaving test data.

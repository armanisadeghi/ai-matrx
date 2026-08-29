-- platform_knob_scope_kind_not_public.sql
--
-- FINDING: `pnpm check:db-guards` (release gate 16), 2026-08-29 —
--
--     [FAIL] UNDECLARED platform.knob_scope_kind (knob_scope_kind_read, SELECT)
--     1 exposure(s) nobody declared. A logged-out visitor can reach these.
--
-- PROVEN THROUGH THE REAL DOOR, not inferred from the catalog: an anonymous
-- PostgREST read with only the publishable key returned **HTTP 200 with rows**
--
--     GET /rest/v1/knob_scope_kind?select=kind  (Accept-Profile: platform)
--     -> [{"kind":"organization"},{"kind":"employer_profile"}, ...]
--
-- so this was a live exposure, not a theoretical one.
--
-- WHY IT GETS NARROWED RATHER THAN DECLARED. The checker offers two honest
-- outs — declare it with a reason, or fix the policy — and warns "do not add a
-- row to silence the check". Declaring is the right answer for a reference enum
-- something anonymous actually needs (`iam.industries` populates the sign-up
-- form before an account exists; `billing.price` renders the public pricing
-- page). None of that applies here:
--
--   * ZERO consumers. Nothing in matrx-frontend reads `knob_scope_kind` — not a
--     component, not a hook, not a route. Grepped 2026-08-29.
--   * The settings ladder it describes is an authenticated feature by
--     definition: a scope kind is only meaningful once you know which
--     organization the reader is in.
--   * It is not contentless the way `platform.assurance_level` and
--     `platform.source_authority` are. Its rows name INTERNAL SCHEMA STRUCTURE —
--     `hr.employer_profile`, `hr.pay_group`, `hr.location`, `web.brand`,
--     `web.site` — which is a free map of the private HR and marketing schemas
--     handed to anyone with the publishable key.
--
-- So the exposure buys nothing and costs a little. Least privilege wins, and
-- the fix that removes a door is strictly better than the fix that documents it.
--
-- 🚨 IF THE SCOPED-CONFIGURATION LANE ACTUALLY WANTS ANON READ, THIS IS ONE
-- REVERT AWAY — but reverse it deliberately: re-grant, re-add `anon` to the
-- policy, AND add the row to `PUBLIC_EXPOSURE_ALLOWED` in
-- lib/security/public-exposure.ts with the reason, so the gate stays honest
-- either way. The table is UNREGISTERED (no `platform.entity_types` row) and
-- carries 2 hand-written policies rather than the 6 a generated table gets, so
-- there is no `iam.apply_rls` to re-run and editing the policy directly is the
-- correct mechanism here — this is NOT a licence to hand-edit a generated one.
--
-- `authenticated` keeps its read. `service_role` is untouched. No data changes.
-- Idempotent. Safe to re-run.

begin;

set local lock_timeout = '30s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Close the door.
-- ─────────────────────────────────────────────────────────────────────────────
-- BOTH halves are required and neither is sufficient alone: the GRANT is what
-- PostgREST checks before it ever reaches RLS, and the policy is what decides
-- rows once it does. Revoking the grant while leaving `anon` on the policy
-- leaves a door that re-opens the moment anyone re-grants SELECT.
revoke select on platform.knob_scope_kind from anon;

drop policy if exists knob_scope_kind_read on platform.knob_scope_kind;
create policy knob_scope_kind_read
  on platform.knob_scope_kind
  for select
  to authenticated
  using (true);

comment on table platform.knob_scope_kind is
  'The settings-ladder scope kinds and their precedence. Reference vocabulary, '
  'readable by any AUTHENTICATED user; deliberately NOT anon-readable — its rows '
  'name internal hr/web schema objects and no anonymous surface consumes it '
  '(narrowed 2026-08-29 after the db-guards gate caught it as an undeclared '
  'public exposure). To open it to anon, also declare it in '
  'lib/security/public-exposure.ts.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Falsification: prove the door is shut and the intended one still open.
-- ─────────────────────────────────────────────────────────────────────────────
-- A policy that reads right proves nothing (db-rules §1). Assert the catalog,
-- in the same transaction, on both directions.
do $$
declare
  v_anon_grant  int;
  v_auth_grant  int;
  v_anon_policy int;
  v_auth_policy int;
begin
  select count(*) into v_anon_grant
    from information_schema.role_table_grants
   where table_schema = 'platform' and table_name = 'knob_scope_kind'
     and grantee = 'anon' and privilege_type = 'SELECT';

  select count(*) into v_auth_grant
    from information_schema.role_table_grants
   where table_schema = 'platform' and table_name = 'knob_scope_kind'
     and grantee = 'authenticated' and privilege_type = 'SELECT';

  select count(*) into v_anon_policy
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'platform' and c.relname = 'knob_scope_kind'
     and 'anon' = any (select r.rolname from pg_roles r where r.oid = any (p.polroles));

  select count(*) into v_auth_policy
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'platform' and c.relname = 'knob_scope_kind'
     and 'authenticated' = any (select r.rolname from pg_roles r where r.oid = any (p.polroles));

  if v_anon_grant <> 0 then
    raise exception 'knob_scope_kind: anon still holds SELECT (% grant(s)) — the exposure is open.', v_anon_grant;
  end if;
  if v_anon_policy <> 0 then
    raise exception 'knob_scope_kind: % policy/policies still name anon — the exposure re-opens on any re-grant.', v_anon_policy;
  end if;
  if v_auth_grant = 0 then
    raise exception 'knob_scope_kind: authenticated LOST its SELECT grant. This change must not break the signed-in read.';
  end if;
  if v_auth_policy = 0 then
    raise exception 'knob_scope_kind: no policy admits authenticated. The signed-in read would return zero rows.';
  end if;

  raise notice 'knob_scope_kind verified: anon has no grant and no policy; authenticated keeps both.';
end $$;

commit;

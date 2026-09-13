-- dd196_new_relation_closed_to_anon_at_birth — A NEW TABLE IS CLOSED TO ANON AT BIRTH
-- (DD-196. SECURITY. db-rules §0/§6d/§9. No policy is created, altered or dropped by this file —
--  it changes DEFAULT PRIVILEGES only, a layer `iam.apply_rls` never touches, so a policy
--  regeneration cannot undo any of it. No EXISTING object's grants change either: default
--  privileges apply to objects created FROM NOW ON and to nothing that already exists.)
--
-- ═══ WHAT WAS MEASURED, ON THIS DATABASE, 2026-09-13 ═══════════════════════════════════════════
-- DD-186 (B-78) decided, column by column, which 194 relations a signed-out visitor may read.
-- DD-193 (B-87) closed the write axis and named what it deliberately did not sweep: the SELECT
-- half of the same DEFAULT PRIVILEGES. That is this file.
--
-- Ten schemas carried a default privilege granting `anon` SELECT on every TABLE created in them
-- from then on — `communication`, `crm`, `docproc`, `files`, `pdf`, `podcast`, `public`,
-- `scheduler`, `users`, `workflow` — and five of those on every SEQUENCE as well
-- (`communication`, `files`, `podcast`, `public`, `users`). Every one of them was granted by the
-- role `postgres`; no other grantor has a default privilege reaching `anon` or PUBLIC on this
-- database outside the vendor schemas, and no default privilege anywhere names PUBLIC as grantee.
-- (`svc_seo` owns 29 relations in `seo` and creates more; it has no default privileges at all, so
--  a table it creates is already closed — measured, not assumed, in the proof below.)
--
-- SO A NEW TABLE WAS PUBLISHED TO THE INTERNET BY DEFAULT. Proven before this file ran, inside a
-- rolled-back transaction: `create table communication.b89_probe_before (id int)` →
-- `has_table_privilege('anon', ..., 'select')` = TRUE, in all ten schemas, with `agent` and `seo`
-- FALSE as the controls. `anon` holds USAGE on those schemas and PostgREST publishes them, so the
-- table was readable over `/rest/v1/b89_probe_before` with the published anonymous key from the
-- moment it existed — before anyone wrote a policy, and whether or not anyone remembered to.
--
-- IT WAS NOT SILENT, AND THAT IS NOT ENOUGH. `check:anon-column-surface` (DD-186) fails loudly on
-- the first undeclared readable relation, so nothing could have stayed hidden for long. But a
-- detector that reports a door already open is a worse thing than a default that never opens it:
-- between the `create table` and the next run of that gate, the rows are on the internet. The
-- correct bound for "what a stranger may read from a table nobody has decided about" is zero, and
-- it is set here. Row-level security is NOT the answer to this: a brand-new table has RLS off
-- until `iam.apply_rls` runs on it, so for that window the grant IS the access decision.
--
-- WHAT THIS DOES NOT TOUCH
--   · Every existing grant. `anon` keeps every SELECT column privilege DD-186 declared — all 194
--     relations and 3,180 columns — because default privileges are about the future only.
--   · `authenticated` and `service_role` keep their defaults in these schemas untouched, so no
--     signed-in surface changes.
--   · Vendor-managed defaults, named rather than swept: `graphql` / `graphql_public` (owned by
--     `supabase_admin`, hold no tables) and `storage` (Supabase's own schema, not PostgREST-exposed;
--     signed-out reads of a public bucket are a real product surface with their own policies).
--
-- AFTER THIS, PUBLISHING A TABLE TO ANONYMOUS READERS IS A DECISION SOMEBODY MAKES: an explicit
-- `grant select (<columns>) on <relation> to anon` plus a row in the DD-186 column register. That
-- is the same shape DD-193 gave the write axis and DD-169 gave the doors.

-- ── Tables: ten schemas, grantor `postgres`. ────────────────────────────────────────────────────
alter default privileges for role postgres in schema communication revoke select on tables from anon;
alter default privileges for role postgres in schema crm           revoke select on tables from anon;
alter default privileges for role postgres in schema docproc       revoke select on tables from anon;
alter default privileges for role postgres in schema files         revoke select on tables from anon;
alter default privileges for role postgres in schema pdf           revoke select on tables from anon;
alter default privileges for role postgres in schema podcast       revoke select on tables from anon;
alter default privileges for role postgres in schema public        revoke select on tables from anon;
alter default privileges for role postgres in schema scheduler     revoke select on tables from anon;
alter default privileges for role postgres in schema users         revoke select on tables from anon;
alter default privileges for role postgres in schema workflow      revoke select on tables from anon;

-- ── Sequences: five schemas. Reading a sequence is `currval`/`last_value` — how many rows a
--    table has taken, which is information about data a stranger cannot read. ──────────────────
alter default privileges for role postgres in schema communication revoke select on sequences from anon;
alter default privileges for role postgres in schema files         revoke select on sequences from anon;
alter default privileges for role postgres in schema podcast       revoke select on sequences from anon;
alter default privileges for role postgres in schema public        revoke select on sequences from anon;
alter default privileges for role postgres in schema users         revoke select on sequences from anon;

-- ── PUBLIC, belt to the brace. No default privilege on this database names PUBLIC as grantee
--    today; `anon` is not a member of any other role, but PUBLIC reaches every role there is, so
--    a PUBLIC default would hand a new table to a signed-out caller by a route a role-name census
--    never sees (that is exactly how DD-194's `pg_stat_statements` grant hid). These statements
--    are no-ops today and the assertion below proves the state either way. ─────────────────────
alter default privileges for role postgres in schema communication revoke select on tables from public;
alter default privileges for role postgres in schema crm           revoke select on tables from public;
alter default privileges for role postgres in schema docproc       revoke select on tables from public;
alter default privileges for role postgres in schema files         revoke select on tables from public;
alter default privileges for role postgres in schema pdf           revoke select on tables from public;
alter default privileges for role postgres in schema podcast       revoke select on tables from public;
alter default privileges for role postgres in schema public        revoke select on tables from public;
alter default privileges for role postgres in schema scheduler     revoke select on tables from public;
alter default privileges for role postgres in schema users         revoke select on tables from public;
alter default privileges for role postgres in schema workflow      revoke select on tables from public;
alter default privileges for role postgres in schema communication revoke select on sequences from public;
alter default privileges for role postgres in schema files         revoke select on sequences from public;
alter default privileges for role postgres in schema podcast       revoke select on sequences from public;
alter default privileges for role postgres in schema public        revoke select on sequences from public;
alter default privileges for role postgres in schema users         revoke select on sequences from public;

-- ── THE FILE ASSERTS ITS OWN COMPLETENESS ──────────────────────────────────────────────────────
-- A sweep that reports success on a partial run is the defect this program exists to end. This
-- re-measures the question the file was written to answer — EVERY grantor, not just `postgres` —
-- and rolls the whole thing back with nothing applied and no ledger row if any entry survives.
do $$
declare
  v_n integer;
  v_names text;
begin
  select count(*), string_agg(
           coalesce(n.nspname,'(all schemas)') || ' (' ||
           case d.defaclobjtype when 'r' then 'tables' else 'sequences' end ||
           ', granted by ' || pg_get_userbyid(d.defaclrole) ||
           ', to ' || case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ')',
           ', ' order by n.nspname)
    into v_n, v_names
  from pg_default_acl d
  left join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclobjtype in ('r','S')
    and a.privilege_type = 'SELECT'
    and (a.grantee = 0 or pg_get_userbyid(a.grantee) = 'anon')
    -- Vendor-managed, deliberately out of scope and named above rather than swept.
    and coalesce(n.nspname, '') not in ('graphql','graphql_public','storage');
  if v_n > 0 then
    raise exception
      'dd196: % default-privilege entr(ies) still publish every table or sequence created from now on to a signed-out caller: %. The sweep is incomplete and nothing was committed.',
      v_n, v_names;
  end if;

  raise notice 'dd196: no default privilege grants anon or PUBLIC SELECT on any table or sequence created from now on, under any grantor, outside the vendor schemas.';
end $$;

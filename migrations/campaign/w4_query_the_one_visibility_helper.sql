-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W4-QUERY, file 1 — THE ONE PLACE THE QUERY SURFACE ASKS "MAY THIS PRINCIPAL SEE IT?".
--
-- DOOR-10, literally: *every query is filtered by Visibility INSIDE the query, never
-- post-filtered.* Every other function this lane ships joins ONE set-returning helper,
-- `custom.query_visible_ids`, and that helper is the ONLY object in the lane that names
-- `iam.*`. The sibling lane building Visibility (`W2-VIS` / `EPOCH` / `PRED`) can swap its
-- set-based predicate in by changing `custom.query_access_ids` ALONE — no caller changes, no
-- second filter anywhere to find and forget.
--
-- WHY A SET AND NOT A BOOLEAN. A boolean per row is a `Filter` on the scan, and `EXPLAIN`
-- reports it as `Rows Removed by Filter` — rows fetched, then discarded. That is precisely the
-- shape DOOR-10 forbids and precisely the shape V4 reads the plan for. A set-returning helper
-- joins, so the plan shows a join and the rows the principal cannot see are never fetched.
--
-- THE THREE ARMS OF THE HELPER, and each one is a real answer, not a shortcut:
--   1. THE SERVER LANE. `custom.assert_store_door` already decides that the role owning
--      `custom.record` is the store's own writer while the product switch is off. The same
--      role reads everything; asking the entity kernel about a principal that has no
--      `auth.uid()` would answer "nothing" and every campaign fixture would read empty.
--   2. THE ORGANIZATION ARM. `iam.has_org_access_for` settles a whole Table in one call, which
--      is the measured 48x difference DOOR-10's own row records between an inline read and a
--      per-cell check.
--   3. THE ENTITY ARM. `iam.accessible_entity_ids('record', …)` — the platform's existing
--      access kernel, called once per query, never once per row.
--
-- QUARANTINE. `W4-ANON`'s submissions land with `metadata->>'quarantine' = 'true'` and are
-- invisible to every read until a Rule clears them (DOOR-17). That exclusion lives HERE, in
-- the one helper, so no query surface can forget it and no later query can reintroduce it.
--
-- THE INVERSE: `migrations/inverse/w4_query_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── who is asking ──────────────────────────────────────────────────────────────
create or replace function custom.query_principal()
returns uuid
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_raw text := current_setting('request.jwt.claims', true);
begin
  -- The signed-in person, read the one way PostgREST supplies it. Null means "no principal",
  -- which is a legal answer: the server lane and the anonymous door both reach here with none.
  -- THE GUC IS NOT TRUSTED TO BE JSON. It is a session setting anything may write, and an
  -- empty string or a malformed value must mean "no principal" rather than taking the whole
  -- query down with `22P02 invalid input syntax for type json` — an unreadable claim is not a
  -- principal, and a read door that crashes is a read door that is also not secure.
  if v_raw is null or btrim(v_raw) = '' then
    return null;
  end if;
  return nullif(v_raw::jsonb ->> 'sub', '')::uuid;
exception when others then
  return null;
end;
$fn$;

comment on function custom.query_principal() is
  'W4-QUERY: the reading principal, or null when there is none. Read once per query, never per row.';

-- ── the server lane, judged from the catalogue and never from a role literal ────
create or replace function custom.query_is_store_owner()
returns boolean
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select pg_has_role(custom.caller_role(),
                     (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                     'member');
$fn$;

comment on function custom.query_is_store_owner() is
  'W4-QUERY: true for the role that owns custom.record — the same judgement custom.assert_store_door makes, read from the catalogue so the two cannot drift.';

-- ══════════════════════════════════════════════════════════════════════════════
-- THE SWAP POINT. This function, and only this function, names `iam.*`.
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function custom.query_access_ids(p_organization_id uuid,
                                                   p_required text default 'viewer')
returns uuid[]
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_user uuid := custom.query_principal();
begin
  -- NULL means "the whole organization is visible" and an empty array means "nothing is".
  -- A caller that confuses the two reads an empty store, so the meaning is stated here once
  -- and never inferred.
  --
  -- ORDER MATTERS, AND THE PRINCIPAL COMES FIRST. A campaign lane, a workflow and the server
  -- package all connect as the role that owns `custom.record` while ACTING FOR a signed-in
  -- person; if the owner arm were tested first, every one of those reads would return the whole
  -- organization no matter whose name was on the request — a privileged bypass wearing a
  -- server connection. So: when there is a principal, the principal is judged. The owner arm
  -- exists only for the case it is actually for — a connection with no principal at all, which
  -- is the campaign's own fixtures and maintenance.
  if v_user is not null then
    if iam.has_org_access_for(v_user, p_organization_id) then
      return null;
    end if;
    return coalesce(iam.accessible_entity_ids('record', p_required::public.permission_level, 0),
                    array[]::uuid[]);
  end if;
  if custom.query_is_store_owner() then
    return null;
  end if;
  -- No principal and not the store's own role: nothing. The anonymous door WRITES; it never
  -- reads, and DOOR-17's "never widens what anon can read" is this line.
  return array[]::uuid[];
end;
$fn$;

comment on function custom.query_access_ids(uuid, text) is
  'W4-QUERY / DOOR-10, THE ONE SWAP POINT: the only object in the W4 query, aggregate, import/export and anonymous surfaces that names iam.*. Returns NULL for "the whole organization is visible" and an id array otherwise. W2-VIS swaps its set-based predicate in HERE and nothing else changes.';

-- ══════════════════════════════════════════════════════════════════════════════
-- THE SET EVERY QUERY JOINS.
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function custom.query_visible_ids(p_organization_id uuid,
                                                    p_table_id uuid default null,
                                                    p_required text default 'viewer')
returns setof uuid
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_ids uuid[] := custom.query_access_ids(p_organization_id, p_required);
begin
  return query
    select r.id
      from custom.record r
     where r.organization_id = p_organization_id
       and (p_table_id is null or r.table_id = p_table_id)
       and r.deleted_at is null
       -- DOOR-17: a quarantined submission is invisible to every read until a Rule clears it.
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and (v_ids is null or r.id = any (v_ids));
end;
$fn$;

comment on function custom.query_visible_ids(uuid, uuid, text) is
  'W4-QUERY / DOOR-10: the set of record ids this principal may see, joined by every W4 query so the plan shows a JOIN and never Rows Removed by Filter. Excludes soft-deleted rows and DOOR-17 quarantine.';

-- ── the same answer for one row, for the callers that hold an id already ───────
create or replace function custom.query_can_see(p_organization_id uuid, p_record_id uuid,
                                                p_required text default 'viewer')
returns boolean
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select exists (select 1 from custom.query_visible_ids(p_organization_id, null, p_required) v
                  where v = p_record_id);
$fn$;

comment on function custom.query_can_see(uuid, uuid, text) is
  'W4-QUERY: the one-row form of custom.query_visible_ids, for callers that already hold an id. Same helper, same answer — never a second rule.';

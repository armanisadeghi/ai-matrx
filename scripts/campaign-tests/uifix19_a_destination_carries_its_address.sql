-- LANE UI-FIX-19 — THE MOVE LIST TELLS TWO SAME-NAMED ORGANIZATIONS APART (VERIFIER-19 #9).
--
-- THE USE CASE. The Birchwood owner (admin@admin.com) moves her Rooms table to another of her
-- organizations. She owns more than one organization called "Birchwood Avenue Renovation" and
-- more than one called "Ironclad Mobile Mechanic" (live or not, a person can make two with one
-- name). The move dialog must be able to tell each destination apart, so every destination the
-- store offers carries its web address, and two that share a name never share an address.
--
-- WHAT MAKES IT FAIL (RED on the body before uifix19_a_destination_carries_its_address.sql): a
-- destination carries no `slug`.
--
-- SEAT: custom.table_home is called as `authenticated` with admin@admin.com's claims (PART 0).

\set ON_ERROR_STOP on
\timing off
\set suite 'uifix19_a_destination_carries_its_address.sql'
\set requires 'function:custom.table_home'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

\i scripts/campaign-tests/_storetails3_fixture.sql

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid; v_rooms uuid; v_twin uuid := gen_random_uuid(); v_home jsonb; v_n int; v_named int; v_twins int; v_addr int;
begin
  select v into v_org from st3 where k = 'org';
  select v into v_rooms from st3 where k = 'rooms';
  -- A second organization with the SAME NAME as one she already owns, as a person can make.
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  select v_twin, o.name, 'uifix19-twin-' || substr(v_twin::text, 1, 8), 'BAR', c_admin
    from iam.organizations o where o.id = v_org;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_twin, 'organization', v_twin, c_admin, 'owner', 'active');
  -- …and a third, so the fixture's own name is shared by two destinations.
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  select gen_random_uuid(), o.name, 'uifix19-twin-b-' || substr(v_twin::text, 1, 8), 'BAR', c_admin
    from iam.organizations o where o.id = v_org
  returning id into v_twin;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_twin, 'organization', v_twin, c_admin, 'owner', 'active');

  -- ══ PART 0. the seat ══
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then raise exception 'PART 0: not in the member seat (%)', current_user; end if;
  raise notice 'PART 0 PASS — authenticated as admin@admin.com (owner)';

  -- ══ D1. every destination carries its address ══
  v_home := custom.table_home(v_rooms);
  select count(*), count(*) filter (where nullif(d ->> 'slug', '') is not null)
    into v_n, v_addr
    from jsonb_array_elements(v_home -> 'destinations') d;
  if v_n = 0 then raise exception 'D1: table_home offered no destination, so this suite proves nothing'; end if;
  if v_addr <> v_n then
    raise exception 'D1 RED: % of % destinations carry no address, so two with one name cannot be told apart', v_n - v_addr, v_n;
  end if;
  raise notice 'D1 PASS — all % destinations carry their address', v_n;

  -- ══ D2. two destinations with one name never share an address ══
  select count(*), count(distinct d ->> 'slug') into v_named, v_twins
    from jsonb_array_elements(v_home -> 'destinations') d
   where d ->> 'name' = (select name from iam.organizations where id = v_twin);
  if v_named < 2 or v_twins <> v_named then
    raise exception 'D2: % destinations named alike, % distinct addresses', v_named, v_twins;
  end if;
  raise notice 'D2 PASS — % destinations share a name, each with its own address', v_named;
end
$t$;

rollback;

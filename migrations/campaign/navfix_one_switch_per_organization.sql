-- NAV-FIX — ONE SWITCH PER ORGANIZATION, AND EVERY MEMBER CAN READ IT.
--
-- WHAT A PERSON HIT (independent verdict, fifth pass, 19 September). An admin
-- turns the record store ON for their organization on the switch screen, and
-- then cannot find it: the pages still refuse with "The unified data pages are
-- switched off for you … custom.code_paths_enabled … An administrator turns it
-- on for a person", and the Records entry never appears in the sidebar. Three
-- switches stood between an admin and their own data, and one of them saved
-- per PERSON, so an admin could open the pages for themselves and had no way,
-- from any screen, to open them for the people they work with.
--
-- THE RULING (lane NAV-FIX): there is ONE switch, and it is the organization's
-- record-store switch on the switch screen. The pages read that and nothing
-- else, and the sidebar entry appears for EVERY MEMBER of an organization whose
-- store is on.
--
-- WHY THE EXISTING DOOR CANNOT DO IT. `platform.unified_data_store_state` is
-- the switch SCREEN's door: it answers whether the organization is on, whether
-- that is the organization's own decision or the platform default, and a
-- paragraph about what being on means — and it is gated on
-- `platform.may_operate_unified_data_ramp`, which is "owner or administrator of
-- this organization". That gate is right for a screen that CHANGES the switch.
-- It is wrong for the sidebar: an ordinary member asking "are my organization's
-- tables here?" is refused, so the entry could never appear for the people the
-- entry exists for.
--
-- SO THIS FILE ADDS THE READ EVERY MEMBER MAY MAKE, and nothing else:
--
--   platform.unified_data_store_on(organization) -> jsonb
--     { "on": bool, "organization_id": uuid, "why": "<one plain sentence>" }
--
-- gated on `iam.has_org_access` — you are in this organization — decided before
-- the first read, which is what makes it a lawful client door under
-- `platform.door_body_must_decide`. It reads the SAME knob the switch screen
-- writes (`custom.system_enabled`, resolved for the organization by
-- `platform.knob_resolve`), so there is no second source of truth and no second
-- switch: the screen sets it, this answers it.
--
-- WHAT IT DELIBERATELY DOES NOT ANSWER. Not the override's provenance, not the
-- long paragraph, not the consumer ramp — those are the administrator's screen
-- and stay behind the administrator's gate. A member learns one fact: the
-- tables are here, or they are not, and why in one sentence.
--
-- A NULL ORGANIZATION IS `false`, NOT AN ERROR. A person who has not picked an
-- organization yet has no store to be on, and the sidebar asks this on every
-- boot; a refusal there would be an exception per page load for a state that is
-- ordinary. It says so in `why`.
--
-- WHAT STOPS BEING READ. `custom.code_paths_enabled` — the per-person half —
-- is no longer read by any page, route or nav gate in matrx-frontend. This file
-- does not drop that knob row: aidream's own server half still reads it, and
-- dropping a row an existing consumer reads is exactly the class that stops and
-- escalates. What it does do is take the PERSON rung off it, so nobody can
-- re-open the pages for one person from Settings while their colleagues stay
-- locked out — the safe path beside the closed one is removed, not left ajar.
--
-- ADDITIVE: one new function, one registry row, the grant that row implies, and
-- one narrowing of a knob's override scope from {user} to {} — no drop, no
-- revoke on a live door, no data touched.
--
-- THE INVERSE: migrations/inverse/navfix_one_switch_per_organization_down.sql.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE READ EVERY MEMBER MAY MAKE.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function platform.unified_data_store_on(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_on boolean;
begin
  -- A person who has not picked an organization yet is not an error: they have
  -- no store to be on, and the sidebar asks this on every boot.
  if p_organization_id is null then
    return jsonb_build_object(
      'on', false,
      'organization_id', null,
      'why', 'No organization is picked yet, so there are no tables to show. Pick one and this answers for that organization.');
  end if;

  -- THE DECISION, BEFORE THE FIRST READ. Membership, not administration: this
  -- door tells you whether YOUR organization keeps its tables here, and every
  -- member of it may know that. Changing it is a different door with a
  -- different gate (platform.unified_data_store_set).
  if not iam.has_org_access(p_organization_id) then
    raise exception 'You are not in that organization, so there is nothing here to tell you about its data.'
      using errcode = '42501',
            hint = 'Switch to an organization you are a member of and ask again.';
  end if;

  v_on := coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean, false);

  return jsonb_build_object(
    'on', v_on,
    'organization_id', p_organization_id,
    'why', case when v_on
                then 'This organization keeps its tables, fields and records in the unified record store, so its Records pages are open to everyone in it.'
                else 'This organization does not keep its data in the unified record store yet. An owner or an administrator of it turns that on once, for everybody, on the unified data ramp screen.' end);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE DECLARATION. A door that is declared is reachable; one that is not, is not.
-- ─────────────────────────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
values
 ('platform', 'unified_data_store_on', 'p_organization_id uuid',
  array['uuid'::regtype::oid],
  true, false,
  'migrations/campaign/navfix_one_switch_per_organization.sql (lane NAV-FIX)',
  'Whether this organization keeps its data in the unified record store - the ONE switch the Records pages and the Records entry in the sidebar read. p_organization_id is checked against iam.has_org_access, decided before the first read, so an organization somebody is not in answers exactly as an invented id does: it refuses. Every MEMBER may ask, because the sidebar entry exists for members and not only for administrators; the administrators-only door beside this one (platform.unified_data_store_state) keeps its gate because it also reports the override provenance and is the one a screen changes the switch through.')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. THE GRANT, ISSUED FROM THE REGISTRY — never written out by hand beside it.
-- ─────────────────────────────────────────────────────────────────────────────
do $grants$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'platform'
      join platform.client_callable_door d
        on d.schema_name = 'platform'
       and d.function_name = p.proname
       and d.identity_argtypes = platform.door_argtypes(p.proargtypes)
     where d.signed_in_callers
       and p.proname = 'unified_data_store_on'
  loop
    execute format('grant execute on function %s to authenticated', fn.sig);
    raise notice 'reachable by any signed-in member of the organization: %', fn.sig;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function platform.unified_data_store_on(uuid) to service_role';
  end if;
end
$grants$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. THE SAFE PATH BESIDE THE CLOSED ONE IS REMOVED.
--
--    `custom.code_paths_enabled` was declared `overridable_by {user}`, which is
--    what made the second switch a PER-PERSON one: an administrator turned the
--    pages on for themselves in Settings and their colleagues stayed locked
--    out, with no screen anywhere that could open them for the organization.
--    The pages no longer read that knob at all, so the person rung now leads
--    nowhere — and a switch in Settings that leads nowhere is the dead control
--    this platform refuses to ship. The row stays (aidream's server half still
--    reads its platform default); only the PERSON rung goes, and the knob says
--    plainly what it is for now.
--
--    Any override rows already written against it are left exactly where they
--    are: deleting somebody's saved setting is not this lane's to do, and with
--    the person rung closed they resolve to nothing.
-- ─────────────────────────────────────────────────────────────────────────────
update platform.feature_knob
   set overridable_by = '{}'::text[],
       description =
         'The CODE half of the OFF switch for the unified data campaign, read by aidream''s server. '
         'It is NOT what opens the Records pages or the Records entry in the sidebar: since 19 September '
         '(lane NAV-FIX) those read ONE switch, custom.system_enabled for the organization, set on the '
         'unified data ramp screen. This knob is no longer overridable per person - a per-person rung on '
         'it meant an administrator could open the pages for themselves and for nobody else.',
       basis = 'Unified data campaign, 2026-09-19 (lane NAV-FIX): one switch per organization.',
       updated_at = now()
 where feature = 'custom'
   and key = 'code_paths_enabled';

-- chair-step: this replaces the body of platform.unified_data_store_on, a live client door, so the judge cannot read what the statement will do from its allow-list
-- based-on: platform.unified_data_store_on(uuid) 0ab12a328209e6c6226d58b2b1d4670b068760f5988923a15fd75c16287e3341
--
-- INVITE-DELIVERY — ADMISSION IS THE LADDER, NOT THE MEMBERSHIP ROW.
--
-- 🚨 MEASURED HEADLESS ON 2026-09-21, AND IT IS THE LAST DEAD END IN THE FEATURE.
-- Rincon Plumbing Co's customer accepted her invitation, the grant was written, and the
-- Jobs page told her:
--
--     "We could not check this organization's record store."
--
-- She was not wrong to be refused by something — she was refused by the WRONG thing.
-- `platform.unified_data_store_on` asks `iam.has_org_access`, which reads a membership
-- row, while every other door into the store asks `custom.assert_client_may_reach` →
-- `custom.portal_admits`, which reads THE LADDER. Lane SHARE-OUT's whole point was that
-- **the grant IS the admission**: a person holding a live grant on a table of this
-- organization has been explicitly let in, and `custom.portal_admits` arm 2 says so. One
-- predicate said yes and the other said no about the same person at the same moment.
--
-- So this door now asks the same question the store asks. It is deliberately NOT a new
-- rule and NOT a widening: `custom.portal_admits` is the existing admission predicate,
-- already reads the organization's own external-principal knob, and already refuses
-- everybody this door refused before — the membership arm is its FIRST arm. Nothing that
-- was shut opens; one thing that was already open stops being contradicted.
--
-- WHY THE ANSWER IS SAFE TO GIVE HER. It is one boolean about the organization that
-- shared a table with her — whether its tables live in the record store — which she can
-- already infer from the fact that the table opened. It names no table, no person and no
-- record, and changing the switch is a different door with a different gate
-- (`platform.unified_data_store_set`), untouched here.
--
-- THE CLASS, not the instance: any other door that asks `iam.has_org_access` where the
-- store asks the ladder has this same defect. The census at the bottom of this file names
-- what was searched and what was found.

create or replace function platform.unified_data_store_on(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $fn$
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

  -- 🚨 THE DECISION, BEFORE THE FIRST READ — and it is THE SAME ONE the store makes.
  -- `iam.has_org_access` is the membership row; `custom.portal_admits` is the ladder,
  -- whose FIRST arm is that same membership and whose second is a live grant on one of
  -- this organization's tables. A person the store lets through a table's door cannot be
  -- told by this door that they are not here at all.
  if not (iam.has_org_access(p_organization_id) or custom.portal_admits(p_organization_id)) then
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
$fn$;

-- ── THE CENSUS. What else asks the membership row where the store asks the ladder? ──
-- Searched 2026-09-21: every function whose body names `iam.has_org_access` AND is
-- declared in platform.client_callable_door with signed_in_callers = true. The result is
-- recorded so the next lane does not have to guess whether this was looked at.
do $census$
declare
  v_rows text;
begin
  select coalesce(string_agg(n.nspname || '.' || p.proname, ', ' order by n.nspname, p.proname), '(none)')
    into v_rows
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join platform.client_callable_door d
      on d.schema_name = n.nspname and d.function_name = p.proname and d.signed_in_callers
   -- prokind 'f' only: pg_get_functiondef refuses an aggregate, and a door is never one.
   where p.prokind = 'f'
     and p.proname <> 'unified_data_store_on'
     and pg_get_functiondef(p.oid) like '%iam.has_org_access%';
  raise notice 'INVITE-DELIVERY census — other client doors gated on the membership row rather than the ladder: %', v_rows;
  raise notice 'INVITE-DELIVERY census — each is correct ONLY if an outside principal genuinely has no business there; this lane fixed the one an accepted table share actually reaches.';
end
$census$;

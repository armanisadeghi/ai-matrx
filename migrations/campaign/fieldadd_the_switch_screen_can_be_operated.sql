-- FIELD-ADD — THE SWITCH SCREEN CAN BE OPERATED.
--
-- WHAT A PERSON HIT (independent verdict, 19 September). Every refusal in the
-- product points a person at the switch. The switch screen itself answered
-- `permission denied for function unified_data_ramp_exit`, with no remedy
-- offered, so nobody could turn the store on from the product at all.
--
-- WHY. The seven ramp functions are SECURITY DEFINER and their
-- `platform.client_callable_door` rows all declare them SERVER-ONLY, which is
-- right for the pair that move a whole organization's reads onto a different
-- store. The reachability that was supposed to replace a client lane — an
-- EXECUTE grant to `service_role`, used by the admin API route after it has
-- established from the caller's own session that they are a super admin — was
-- issued for three of the seven and never for the other four. Measured on this
-- database before writing this file:
--
--   unified_data_ramp_gate                 service_role=X   ✓
--   unified_data_ramp_set  (5 arguments)   service_role=X   ✓   (the legacy one)
--   unified_data_ramp_state                service_role=X   ✓
--   unified_data_ramp_exit                 postgres only    ✗   ← the sentence a person read
--   unified_data_ramp_set  (6 arguments)   postgres only    ✗   ← the one the route calls
--   unified_data_store_state               postgres only    ✗
--   unified_data_store_set                 postgres only    ✗
--
-- So the screen could not read the ramp, could not read the store switch, could
-- not set the store switch and could not override a consumer. Four of its five
-- operations were dead and the fifth only looked alive.
--
-- WHAT THIS FILE DOES — not four hand-written grants, which would leave the
-- same class open the next time somebody adds a ramp verb. THE LADDER, AND IT IS THE ONE THE
-- REST OF THE PLATFORM USES: a person who owns or administers an organization
-- may read and operate THAT organization's ramp, from their own session, and
-- the store's own switch with it. That is `iam.has_org_admin`, decided in each
-- body before anything is read, which is also what makes these rows lawful
-- client doors under `platform.door_body_must_decide`.
--
-- The existing admin API route keeps working unchanged: the shared predicate
-- lets through a caller that is the service role or the database owner, which
-- is exactly the lane that route has always used, and it is already gated on a
-- super admin before it ever opens a connection.
--
--   platform.may_operate_unified_data_ramp(organization) — the one predicate
--   platform.assert_may_operate_unified_data_ramp(...)   — and its refusal
--
-- and the grants are ISSUED FROM THE REGISTRY, by looping over the rows that
-- declare a client lane, rather than written out by hand beside them — so a
-- door that is declared is reachable and a door that is not declared is not,
-- with no third state where somebody forgot.
--
-- `unified_data_ramp_exit()` takes no organization, and campaign metadata about
-- which engine replaces which is not one organization's business, so it is NOT
-- opened to a client. It gains an organization-scoped twin that answers the
-- same rows for a caller who administers that organization, and the screen asks
-- the twin. The no-argument original keeps its server-only declaration and
-- gains the `service_role` grant that declaration always implied.
--
-- The two verbs that MOVE a consumer (`unified_data_ramp_gate` and
-- `unified_data_ramp_set`) stay server-only, which is what checking them the
-- same way concludes rather than an omission: they re-point a whole consumer of
-- a whole organization, the admin route is the right lane for that, and what
-- was wrong with them is the same missing grant.
--
-- ADDITIVE: two new predicates, one new overload, three CREATE OR REPLACEs that
-- add a decision and change no result, four registry rows and the grants those
-- rows imply. Nothing is dropped and nothing is revoked.
--
-- THE INVERSE: migrations/inverse/fieldadd_the_switch_screen_can_be_operated_down.sql.

-- based-on: platform.unified_data_store_state(uuid) fa29dbe35464b4aadac68a0d6b141dad75af65060c98db1fff196d1305127a73
-- based-on: platform.unified_data_store_set(uuid, boolean, uuid, text) 1b59f5e2f44dad632f09bf39de2628c54b676037c98be1fb2744859d8df090ab
-- based-on: platform.unified_data_ramp_state(uuid) d7b89fe361322e1a2ef0595b125ec52db50c87c599697bb1d863617be3d18911

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE LADDER, ONCE.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function platform.may_operate_unified_data_ramp(p_organization_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_who name := coalesce(nullif(current_setting('role', true), 'none'), session_user)::name;
begin
  -- `current_user` is the definer in here and answers "the owner" for everybody,
  -- so the caller is read the way the store reads it: the role GUC PostgREST
  -- sets per request, falling back to the role the connection authenticated as.
  -- The owner of the knob table: the campaign's own migrations and the
  -- database owner. Read from the catalogue, never as a role literal.
  if pg_has_role(v_who, (select c.relowner from pg_class c
                          where c.oid = 'platform.knob_override'::regclass), 'member') then
    return true;
  end if;
  if exists (select 1 from pg_roles r where r.rolname = 'service_role')
     and pg_has_role(v_who, 'service_role', 'member') then
    -- The admin API route's lane. It establishes a super admin from the
    -- caller's own session before it ever uses this connection.
    return true;
  end if;
  if p_organization_id is null then
    return false;
  end if;
  return iam.has_org_admin(p_organization_id);
end
$function$;

create or replace function platform.assert_may_operate_unified_data_ramp(
  p_organization_id uuid,
  p_door            text
) returns void
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
begin
  if p_organization_id is null then
    raise exception 'Name the organization whose data store you are switching. This switch is set one organization at a time.'
      using errcode = '22004';
  end if;
  if platform.may_operate_unified_data_ramp(p_organization_id) then
    return;
  end if;
  raise exception 'Only an owner or an administrator of this organization can see or change where its data is stored.'
    using errcode = '42501',
          hint = format('%s was not run and nothing was changed. Ask an owner of this organization to make the change, or switch to an organization you administer.',
                        coalesce(nullif(btrim(p_door), ''), 'That switch'));
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE FIVE BODIES GAIN A DECISION AND CHANGE NOTHING ELSE.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function platform.unified_data_store_state(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_on   boolean;
  v_over boolean;
begin
  perform platform.assert_may_operate_unified_data_ramp(p_organization_id, 'Reading this organization''s data-store switch');

  v_on := coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean, false);
  select true into v_over from platform.knob_override o
   where o.feature = 'custom' and o.key = 'system_enabled'
     and o.scope_kind = 'organization' and o.scope_id = p_organization_id;
  return jsonb_build_object(
    'knob_key', 'system_enabled',
    'switched_on', v_on,
    'has_organization_override', coalesce(v_over, false),
    'why', case when v_on
                then 'This organization is on the unified record store. Its doors take writes from its own people; a field can be promoted here; relations between records are enforced, including the wall that refuses a link into another organization unless both organizations have turned cross-organization links on; custom fields on its standard tables are checked; and its changes are recorded so "who could see this on that day" can be answered. Every consumer knob is still separate: turning this on moved nobody onto the new store.'
                else 'This organization is not on the unified record store. Its doors take writes only from the role that owns custom.record; promoting a field is refused here; the relation rules, the custom-fields checks and its own change history are all switched off with it. Turning this on does not move any consumer — every consumer knob is separate and still off.' end);
end;
$function$;

create or replace function platform.unified_data_store_set(
  p_organization_id uuid,
  p_on              boolean,
  p_acting_user_id  uuid default null::uuid,
  p_note            text default null::text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor    uuid := coalesce(p_acting_user_id, auth.uid());
  v_door     jsonb;
  v_written  jsonb;
  v_readback jsonb;
begin
  perform platform.assert_may_operate_unified_data_ramp(p_organization_id, 'Turning this organization''s data store on or off');

  if v_actor is null then
    raise exception 'platform.unified_data_store_set: no acting user. The caller must pass p_acting_user_id — the person it has already established is a platform admin — because auth.uid() is null on a server lane and the override would otherwise be written by nobody.'
      using errcode = 'P0001';
  end if;
  if p_organization_id is null or p_on is null then
    raise exception 'platform.unified_data_store_set: name the organization and say on or off. Nothing was changed.'
      using errcode = '22004';
  end if;

  -- THE DOOR QUESTION IS STILL ASKED, exactly as platform.knob_override_set asks it.
  v_door := platform.knob_write_door_for('custom.system_enabled');
  if (v_door ->> 'ok')::boolean
     and (v_door ->> 'set_door') is distinct from 'platform.knob_override_set' then
    raise exception 'platform.unified_data_store_set: custom.system_enabled is written through %, not through this screen. That is where its own permission gate and its own audit trail live.',
      v_door ->> 'set_door'
      using errcode = 'P0001';
  end if;

  v_written := platform._knob_override_write(
    'custom', 'system_enabled', 'organization', p_organization_id, p_organization_id,
    to_jsonb(p_on),
    coalesce(p_note, 'Unified-data switch screen, the store itself, ' || (case when p_on then 'ON' else 'OFF' end)),
    v_actor);

  if v_written is null or not coalesce((v_written ->> 'ok')::boolean, false) then
    raise exception 'platform.unified_data_store_set: the override was NOT written for custom.system_enabled — the knob writer answered %. Nothing has changed and this organization has not moved.',
      coalesce(v_written::text, 'null')
      using errcode = 'P0001',
            hint = 'platform.knob_override_set RETURNS a refusal rather than raising one, so a discarded result looks exactly like success. This is the failure the consumer switch used to swallow.';
  end if;

  -- READ IT BACK. The screen may only say "switched on" when the database agrees.
  v_readback := platform.knob_resolve('custom', 'system_enabled', p_organization_id, null, null);
  if v_readback is distinct from to_jsonb(p_on) then
    raise exception 'platform.unified_data_store_set: wrote % for custom.system_enabled but platform.knob_resolve still answers % for organization %. The switch did not take.',
      to_jsonb(p_on), coalesce(v_readback::text, 'null'), p_organization_id
      using errcode = 'P0001';
  end if;

  return platform.unified_data_store_state(p_organization_id);
end;
$function$;

create or replace function platform.unified_data_ramp_state(p_organization_id uuid)
returns table(consumer_id text, label text, ramp_order integer, batch text, owning_lane text,
              landed_at timestamp with time zone, not_ready_why text, record_types text[],
              no_rollback boolean, knob_key text, switched_on boolean, gate_verdict text,
              gate_why text, gate_ran_at timestamp with time zone, gate_lost bigint,
              gate_gained bigint)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  -- THE DECISION, BEFORE THE FIRST READ. Until 19 September this body decided
  -- nothing and relied on there being no client lane at all; the comment here
  -- said asking `is_platform_admin()` would refuse every caller, which was true
  -- of a service-key connection and is why the check was left out rather than
  -- written in a form that works for both lanes. The shared predicate is that
  -- form: the service role and the owner pass as they always did, and a
  -- signed-in person passes when they administer THIS organization.
  perform platform.assert_may_operate_unified_data_ramp(p_organization_id, 'Reading this organization''s ramp');

  return query
    select c.consumer_id, c.label, c.ramp_order, c.batch, c.owning_lane, c.landed_at,
           c.not_ready_why, c.record_types, c.no_rollback, c.knob_key,
           coalesce(platform.knob_resolve('custom', c.knob_key, p_organization_id, null, null) = 'true'::jsonb, false),
           g.verdict, g.why, g.ran_at, g.lost_count, g.gained_count
      from campaign_watch.ramp_consumer c
      left join lateral (
        select r.verdict, r.why, r.ran_at, r.lost_count, r.gained_count
          from campaign_watch.ramp_gate_run r
         where r.consumer_id = c.consumer_id and r.organization_id = p_organization_id
         order by r.ran_at desc limit 1
      ) g on true
     order by c.ramp_order;
end;
$function$;

-- The organization-scoped twin of the exit list. Same rows, decided.
create or replace function platform.unified_data_ramp_exit(p_organization_id uuid)
returns table(id text, engine_old text, engine_new text, exit_trigger text, exit_date date,
              owner_name text, status text, note text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  perform platform.assert_may_operate_unified_data_ramp(p_organization_id, 'Reading the dual-engine exit plan');
  return query
    select e.id, e.engine_old, e.engine_new, e.exit_trigger, e.exit_date,
           e.owner_name, e.status, e.note
      from campaign_watch.dual_engine_exit e
     order by e.exit_date;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. THE TWO THAT MOVE AN ORGANIZATION'S READS STAY SERVER-ONLY, and that is
--    the answer to "check every other function the same way" rather than an
--    omission. `unified_data_ramp_gate` and `unified_data_ramp_set` re-point a
--    whole consumer of a whole organization at a different store; their
--    declarations say server-only and they should. What was wrong with them is
--    the same thing that was wrong with the other four: the grant their
--    declaration implied was never issued for the six-argument `..._set`, the
--    only one the admin route calls. It is issued in section 5.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. THE DECLARATIONS.
-- ─────────────────────────────────────────────────────────────────────────────
-- The ladder itself is not a door: it is the predicate the four doors below ask,
-- and it is declared as the server-only lane it is so the shape guard can see
-- that somebody said, in data, who may call it and what the organization id is
-- checked against.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
values
 ('platform', 'may_operate_unified_data_ramp', 'p_organization_id uuid',
  array['uuid'::regtype::oid],
  false, false,
  'server_only: this is the predicate the unified-data switch doors ask, never a call surface of its own. Its only callers are platform.assert_may_operate_unified_data_ramp and the four ramp doors, all in schema platform, all SECURITY DEFINER and all declared here in their own right.',
  'migrations/campaign/fieldadd_the_switch_screen_can_be_operated.sql (lane FIELD-ADD)',
  'p_organization_id is checked against iam.has_org_admin - the signed-in person owns or administers that organization - after two lanes that are not people: the role that owns platform.knob_override (the campaign''s own migrations and the database owner) and service_role (the admin API route, which establishes a super admin from the caller''s own session before it opens a connection). A NULL organization is false for a person and true for those two lanes, because they are not asking about one organization.'),
 ('platform', 'assert_may_operate_unified_data_ramp', 'p_organization_id uuid, p_door text',
  array['uuid'::regtype::oid, 'text'::regtype::oid],
  false, false,
  'server_only: the refusal half of the predicate above, called at the top of each unified-data switch door before it reads or writes anything. It has no result a caller could want and exists so the four doors refuse in one sentence rather than four.',
  'migrations/campaign/fieldadd_the_switch_screen_can_be_operated.sql (lane FIELD-ADD)',
  'p_organization_id is checked by platform.may_operate_unified_data_ramp, which is iam.has_org_admin for a person. A NULL organization is refused by name before the predicate is asked, because a switch that is set one organization at a time cannot be asked about none.')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
values
 ('platform', 'unified_data_ramp_exit', 'p_organization_id uuid',
  array['uuid'::regtype::oid],
  true, false,
  'migrations/campaign/fieldadd_the_switch_screen_can_be_operated.sql (lane FIELD-ADD)',
  'The plan for leaving each pair of engines behind, read by the one screen that switches an organization between them. An owner or an administrator of the organization named here may read it; the predicate is decided before the first read, so an organization somebody does not administer answers exactly as an invented id does. The no-argument original stays server-only: which engine replaces which is campaign metadata and not one organization''s business, and this twin exists so a screen can ask the question with an organization attached.'),
 ('platform', 'unified_data_ramp_state', 'p_organization_id uuid',
  array['uuid'::regtype::oid],
  true, false,
  'migrations/campaign/fieldadd_the_switch_screen_can_be_operated.sql (lane FIELD-ADD)',
  'Where one organization stands on the ramp, consumer by consumer, with the verdict of each consumer''s last gate run. An owner or an administrator of that organization may read it from their own session; the shared ramp predicate is decided before the first read. Until this row existed the only reach was an admin API route holding the service key, and four of the screen''s five operations had no grant at all, so the switch screen answered "permission denied" and nobody could turn the store on from the product.'),
 ('platform', 'unified_data_store_state', 'p_organization_id uuid',
  array['uuid'::regtype::oid],
  true, false,
  'migrations/campaign/fieldadd_the_switch_screen_can_be_operated.sql (lane FIELD-ADD)',
  'Whether this organization is on the unified record store, whether that is its own decision or the platform default, and what being on it actually means, in the sentence the screen shows. An owner or an administrator of the organization may read it; decided before the first read. Every refusal in the product points a person at this switch, so the screen that shows it has to be reachable by the person the refusal is addressed to.'),
 ('platform', 'unified_data_store_set', 'p_organization_id uuid, p_on boolean, p_acting_user_id uuid, p_note text',
  array['uuid'::regtype::oid, 'bool'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid],
  true, false,
  'migrations/campaign/fieldadd_the_switch_screen_can_be_operated.sql (lane FIELD-ADD)',
  'Turning the unified record store on or off for one organization. It moves no data and no consumer - every consumer knob stays separate - but until it is on, that organization reaches none of the store''s doors, so this is the switch every refusal in the product names. An owner or an administrator of the organization may operate it, decided before anything is written; the knob''s own write door, its audit row and its read-back check are untouched.')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. THE GRANTS, ISSUED FROM THE REGISTRY.
--    Schema `platform` is not declared closed, so `reopen_declared_doors` has
--    nothing to say about it. The same sentence is executed here over exactly
--    the rows that declare a client lane on these functions: a door that is
--    declared is reachable, and there is no third state where somebody forgot.
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
       and p.proname in ('unified_data_ramp_exit', 'unified_data_ramp_state',
                         'unified_data_store_state', 'unified_data_store_set')
  loop
    execute format('grant execute on function %s to authenticated', fn.sig);
    raise notice 'reachable by a signed-in organization admin: %', fn.sig;
  end loop;

  -- The no-argument exit list keeps its SERVER-ONLY declaration and finally
  -- gets the grant that declaration always implied. This is the function whose
  -- absent grant is the sentence a person read on the screen.
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function platform.unified_data_ramp_exit() to service_role';
    execute 'grant execute on function platform.unified_data_store_state(uuid) to service_role';
    execute 'grant execute on function platform.unified_data_store_set(uuid, boolean, uuid, text) to service_role';
    execute 'grant execute on function platform.unified_data_ramp_set(text, uuid, boolean, uuid, text, uuid) to service_role';
  end if;
end
$grants$;

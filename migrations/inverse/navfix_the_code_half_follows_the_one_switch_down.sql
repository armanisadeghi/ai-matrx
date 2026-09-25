-- THE INVERSE of migrations/campaign/navfix_the_code_half_follows_the_one_switch.sql.
--
-- It puts `custom/code_paths_enabled` back to a knob nothing can override, and
-- puts `platform.unified_data_store_set` back to writing one row. Run it only to
-- undo that file: the moment it runs, turning the store on for an organization
-- stops turning the server's own code half on with it, which is the state that
-- left an organization on the store with its agent tool still refusing.
--
-- The mirrored override rows are NOT deleted here. They are an organization's
-- own decision, written through the platform's own door with its audit row; an
-- inverse that quietly deleted somebody's setting would be a data loss dressed
-- as a rollback. Remove one by setting it through the same door with a null.

set lock_timeout = '2s';
set statement_timeout = '600s';

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
      using errcode = 'P0001';
  end if;

  v_readback := platform.knob_resolve('custom', 'system_enabled', p_organization_id, null, null);
  if v_readback is distinct from to_jsonb(p_on) then
    raise exception 'platform.unified_data_store_set: wrote % for custom.system_enabled but platform.knob_resolve still answers % for organization %. The switch did not take.',
      to_jsonb(p_on), coalesce(v_readback::text, 'null'), p_organization_id
      using errcode = 'P0001';
  end if;

  return platform.unified_data_store_state(p_organization_id);
end;
$function$;

-- chair-step: restores platform.knob_snapshot to its per-knob body and drops the two doors knobsnapshot_* added.
-- INVERSE of migrations/campaign/knobsnapshot_one_pass_defaults_once_and_a_small_delta.sql (lane KNOB-SNAPSHOT).
-- Nothing else read the two dropped functions except the client of this lane's commit, which falls back (see effectiveKnobs.ts).

set local lock_timeout = '2s';

delete from platform.client_callable_door
 where schema_name = 'platform' and function_name in ('knob_defaults', 'knob_snapshot_delta')
   and declared_by like '%knobsnapshot_one_pass_defaults_once_and_a_small_delta.sql%';
drop function if exists platform.knob_defaults(text);
drop function if exists platform.knob_snapshot_delta(uuid, uuid, jsonb, text);

create or replace function platform.knob_snapshot(p_organization_id uuid, p_user_id uuid default null::uuid, p_scopes jsonb default null::jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'platform', 'iam', 'public'
as $function$
declare
  v_stamp timestamptz;
  v_org   uuid := p_organization_id;
begin
  if p_organization_id is not null
     and not iam.is_trusted_backend()
     and not iam.has_org_access(p_organization_id) then
    if (select auth.uid()) is not null and custom.organization_has_a_public_table(p_organization_id) then
      v_org := null;
    else
      raise exception 'platform.knob_snapshot: not a member of that organization'
        using errcode = '42501';
    end if;
  end if;

  if p_user_id is not null
     and not iam.is_trusted_backend()
     and p_user_id is distinct from (select auth.uid())
     and not iam.may_address_user_in_org(p_user_id, p_organization_id) then
    raise exception 'platform.knob_snapshot: that is not your configuration to read'
      using errcode = '42501',
            hint = 'A snapshot resolves the USER rung as well as the organization rung, so it answers one person''s own settings. Ask for your own, or for somebody in an organization you are both in.';
  end if;

  select greatest(
           coalesce((select max(updated_at) from platform.feature_knob), 'epoch'::timestamptz),
           coalesce((select max(updated_at) from platform.knob_override
                      where organization_id is not distinct from v_org), 'epoch'::timestamptz),
           coalesce((select max(updated_at) from platform.knob_rung_lock
                      where organization_id is not distinct from v_org), 'epoch'::timestamptz))
    into v_stamp;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'user_id',         p_user_id,
    'stamp',           to_jsonb(v_stamp),
    'count',           (select count(*) from platform.feature_knob),
    'resolved', coalesce((
      select jsonb_object_agg(
               k.feature || '.' || k.key,
               platform.knob_resolve(k.feature, k.key, v_org, p_user_id, p_scopes))
        from platform.feature_knob k), '{}'::jsonb));
end
$function$;

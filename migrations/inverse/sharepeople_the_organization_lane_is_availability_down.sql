-- INVERSE of migrations/campaign/sharepeople_the_organization_lane_is_availability.sql: the body byte-for-byte as it was.
set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION custom.share_lane_set(p_organization_id uuid, p_subject_id uuid, p_choice text, p_level permission_level DEFAULT NULL::permission_level)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_choice record;
  v_row    custom.record;
  v_word   text;
  v_level  public.permission_level;
begin
  perform custom.assert_store_door(p_organization_id, 'share_lane_set');
  perform custom.assert_client_may_change(p_organization_id, p_subject_id, 'share_lane_set',
                                          'admin'::public.permission_level, 'record');

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_subject_id;
  if not found then
    raise exception 'There is no such record in this organization.' using errcode = '02000';
  end if;
  v_word := case when v_row.table_id = custom.table_kernel_id() then 'table' else 'record' end;

  select * into v_choice from custom.share_lanes() l where l.choice = lower(btrim(coalesce(p_choice, '')));
  if not found then
    raise exception 'There is no lane called "%".', coalesce(p_choice, '<nothing>')
      using errcode = '22023',
            hint = 'The lanes are mine, organization, community and world — call custom.share_lanes() for what each one means.';
  end if;

  if v_choice.lane = 'world' then
    -- Delegated whole: the world lane has its own act, its own admission and its own switch,
    -- and this door does not get a second copy of any of them (VIS-N-5, VIS-N-7).
    perform iam.publish_to_world('record', p_subject_id, p_organization_id, v_choice.discoverable);
    return jsonb_build_object('lane', v_choice.choice, 'message', v_choice.label || '.');
  end if;

  if v_choice.choice = 'organization' then
    v_level := coalesce(p_level, iam.member_default_level(p_organization_id, v_row.table_id),
                        'viewer'::public.permission_level);
    perform custom.share_grant(p_organization_id, p_subject_id, 'organization', p_organization_id, v_level);
  else
    delete from iam.permissions p
     where p.resource_type = 'record' and p.resource_id = p_subject_id
       and (p.granted_to_organization_id = p_organization_id or p.is_public);
    v_level := null;
  end if;

  insert into iam.content_lane as c
        (resource_type, resource_id, organization_id, lane, discoverable, unlisted)
  values ('record', p_subject_id, p_organization_id, 'mine', false, true)
  on conflict (resource_type, resource_id) do update
     set lane = 'mine', discoverable = false, unlisted = true;

  return jsonb_build_object(
    'lane', v_choice.choice,
    'level', v_level::text,
    'message', case when v_choice.choice = 'organization'
                    then format('Everyone in this organization now reaches this %s at %s.',
                                v_word, lower(iam.level_label(v_word, v_level)))
                    else format('Only the people it is shared with reach this %s now.', v_word) end);
end;
$function$;

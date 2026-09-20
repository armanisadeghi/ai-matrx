-- target: branch
--
-- THE INVERSE of `migrations/campaign/workdoors_the_states_are_vocabulary_not_somebody_s_rows.sql`:
-- the body as it stood at 04:23Z on 2026-09-20, deciding EACH STATE ROW on the ladder. Running
-- it is what makes the green suite's PART 3 fail again with "You do not have access to this
-- state" from the member's seat — the dead end the fix closed.

CREATE OR REPLACE FUNCTION custom.work_transition_refusal(p_organization_id uuid, p_from_state_id uuid, p_to_state_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_from custom.record;
  v_to   custom.record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_transition_refusal');
  if p_from_state_id is null or p_to_state_id is null or p_from_state_id = p_to_state_id then
    return null;
  end if;
  perform custom.assert_client_may_open(p_organization_id, p_from_state_id,
                                        'custom.work_transition_refusal',
                                        'viewer'::public.permission_level, 'state');
  perform custom.assert_client_may_open(p_organization_id, p_to_state_id,
                                        'custom.work_transition_refusal',
                                        'viewer'::public.permission_level, 'state');
  select * into v_from from custom.record r
   where r.organization_id = p_organization_id and r.id = p_from_state_id and r.deleted_at is null;
  select * into v_to   from custom.record r
   where r.organization_id = p_organization_id and r.id = p_to_state_id   and r.deleted_at is null;
  if v_from.id is null or v_to.id is null then
    return null;
  end if;
  if jsonb_typeof(v_from.data -> 'next') is distinct from 'array' then
    return null;
  end if;
  if (v_from.data -> 'next') ? (v_to.data ->> 'name') then
    return null;
  end if;
  return format('%s cannot go straight to %s. From %s it can go to %s.',
                v_from.data ->> 'name', v_to.data ->> 'name', v_from.data ->> 'name',
                coalesce(nullif((select string_agg(x #>> '{}', ' or ' order by x #>> '{}')
                                   from jsonb_array_elements(v_from.data -> 'next') x), ''),
                         'nowhere - it is finished'));
end
$function$
;

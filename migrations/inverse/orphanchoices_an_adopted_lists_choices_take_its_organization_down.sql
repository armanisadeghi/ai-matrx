-- inverse of migrations/campaign/orphanchoices_an_adopted_lists_choices_take_its_organization.sql (lane ORPHAN-CHOICES): the body as it was (add44375…). Choices already given their list's organization keep it (workbench.refuse_null_organization refuses taking it away).
-- lane: ORPHAN-CHOICES
-- based-on: platform.final_switch_adopt_orphan_lists(uuid) 3644be5d063ee1d0edb12cef84e1222f529227aa0e738e8b4f750f48fdb276dd

CREATE OR REPLACE FUNCTION platform.final_switch_adopt_orphan_lists(p_run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_refused jsonb := platform._final_switch_person_refusal();
  v_out jsonb := '[]'::jsonb;
  x jsonb;
begin
  if v_refused is not null then
    return jsonb_build_object('ok', false, 'reason', v_refused ->> 'reason', 'says', v_refused ->> 'says');
  end if;
  if coalesce((platform._final_switch_last()).direction, 'old') = 'new' then
    return jsonb_build_object('ok', false, 'reason', 'already_there', 'says', 'Everything is already on the new system.');
  end if;
  for x in select e from jsonb_array_elements(platform._final_switch_orphan_lists()) e
            where e ->> 'resolution' = 'organization' loop
    update workbench.udt_structured_lists
       set organization_id = (x ->> 'organization_id')::uuid,
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('final_switch_adopted', jsonb_build_object(
             'from', null, 'organization_id', x ->> 'organization_id', 'organization_name', x ->> 'organization_name',
             'why', x ->> 'why', 'run', p_run, 'at', clock_timestamp(), 'by', auth.uid()))
     where id = (x ->> 'id')::uuid and organization_id is null and deleted_at is null;
    v_out := v_out || jsonb_build_object('id', x ->> 'id', 'name', x ->> 'name', 'organization_id', x ->> 'organization_id',
                                         'organization_name', x ->> 'organization_name');
  end loop;
  return jsonb_build_object('ok', true, 'adopted', v_out,
    'says', case when jsonb_array_length(v_out) = 0 then 'No older pick list with no organization had a maker in exactly one organization.'
                 else format('Gave %s older pick %s %s maker''s organization: %s.', jsonb_array_length(v_out),
                             case when jsonb_array_length(v_out) = 1 then 'list' else 'lists' end,
                             case when jsonb_array_length(v_out) = 1 then 'its' else 'their' end,
                             (select string_agg(format('%s → %s', e ->> 'name', e ->> 'organization_name'), '; ') from jsonb_array_elements(v_out) e)) end);
end;
$function$;

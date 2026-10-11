-- chair-step: inverse of accesssetup_k1: restores the account-name body of iam.record_access_setup and drops the two-argument iam._access_setup_person.
-- lane: access-setup
-- lock: iam
-- ground-standing-ok: b - the restored body calls iam._access_setup_stages, which accesssetup_b_the_seat_and_part_answers_down.sql drops; that sibling runs AFTER this inverse (inverses run in reverse order: k, j, i, h, g ... b), so the callee still stands when this one runs.
-- based-on: iam.record_access_setup(text, uuid) 5e7ab437beb8377a3a918a3c2e9ac1d3846b46fad5a4c19733429e5354b7d458

CREATE OR REPLACE FUNCTION iam.record_access_setup(p_type text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_caller uuid := auth.uid(); s jsonb := iam._access_setup_of(p_type); v_org uuid; v_mine text[];
  v_admin text[]; v_stages text[]; v_seats jsonb := '[]'::jsonb; v_seat jsonb; v_key text; v_may boolean;
  v_any_may boolean := false; v_holders jsonb; v_excluded jsonb; v_cells jsonb; v_role text; v_confirm jsonb;
begin
  if v_caller is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if s is null then return jsonb_build_object('ok', false, 'reason', 'no_setup'); end if;
  v_org := iam._access_setup_head_org(p_type, p_id);
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_mine := coalesce(iam.seats_of(v_caller, p_type, p_id), '{}');
  if cardinality(v_mine) = 0 then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_admin := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(s -> 'admin_seats', '[]'::jsonb)) x), '{}');
  v_stages := coalesce(iam._access_setup_stages(s, p_id), '{}');
  select m.role into v_role from iam.memberships m
   where m.organization_id = v_org and m.user_id = v_caller and m.container_type = 'organization'
     and m.status = 'active' and m.deleted_at is null limit 1;

  for v_seat in select e from jsonb_array_elements(s -> 'seats') e loop
    v_key := v_seat ->> 'key';
    if coalesce((v_seat ->> 'opens_record')::boolean, true) = false then continue; end if;
    v_may := v_key is distinct from (s ->> 'subject_seat')
             and coalesce(v_seat #>> '{resolver,kind}', '') <> 'grants'
             and v_mine && (coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_seat -> 'assignable_by', '[]'::jsonb)) x), '{}') || v_admin);
    v_any_may := v_any_may or v_may;
    select coalesce(jsonb_agg(iam._access_setup_person(t.user_id)
                              || jsonb_build_object('source', t.source, 'removable', t.removable)
                              order by t.source, t.user_id), '[]'::jsonb)
      into v_holders from iam._seat_table(p_type, p_id) t where t.seat = v_key;
    select coalesce(jsonb_agg(iam._access_setup_person(c.user_id)
                              || jsonb_build_object('changed_at', c.changed_at, 'reason', c.reason)
                              order by c.changed_at desc), '[]'::jsonb)
      into v_excluded from iam.record_seat_change c
     where c.entity_type = p_type and c.record_id = p_id and c.seat_key = v_key
       and c.change = 'exclude' and c.deleted_at is null;
    select coalesce(jsonb_agg(jsonb_build_object(
             'part', pe ->> 'key',
             'level', s #>> array['grid', v_key, pe ->> 'key', 'level'],
             'rows', s #>> array['grid', v_key, pe ->> 'key', 'rows'],
             'from_stage', s #> array['grid', v_key, pe ->> 'key', 'from_stage'],
             'reached', case when s #> array['grid', v_key, pe ->> 'key', 'from_stage'] is null then true
                             else iam._access_setup_stage_reached(s #> array['grid', v_key, pe ->> 'key', 'from_stage'], v_stages) end)
             order by pe_ord), '[]'::jsonb)
      into v_cells
      from jsonb_array_elements(s -> 'parts') with ordinality p(pe, pe_ord)
     where s #> array['grid', v_key, pe ->> 'key'] is not null;
    v_seats := v_seats || jsonb_build_object(
      'key', v_key,
      'required', coalesce((v_seat ->> 'required')::boolean, false),
      'many', coalesce((v_seat ->> 'many')::boolean, false),
      'resolver', v_seat #>> '{resolver,kind}',
      'may_change', v_may,
      'fallback_only', jsonb_array_length(v_holders) > 0
                       and not exists (select 1 from jsonb_array_elements(v_holders) h where h ->> 'source' <> 'fallback'),
      'holders', v_holders,
      'excluded', v_excluded,
      'cells', v_cells);
  end loop;

  select jsonb_build_object('at', a.occurred_at) || coalesce(jsonb_build_object('by', iam._access_setup_person(a.actor_user_id)), '{}'::jsonb)
    into v_confirm from iam.access_audit a
   where a.organization_id = v_org and a.target_token = p_type and a.action = 'seat_confirm'
     and p_id = any(a.target_ids) and a.deleted_at is null
   order by a.occurred_at desc limit 1;

  return jsonb_build_object(
    'ok', true,
    'entity_type', p_type,
    'record_id', p_id,
    'organization', (select jsonb_build_object('id', o.id, 'name', o.name) from iam.organizations o where o.id = v_org),
    'my_seats', to_jsonb(v_mine),
    'my_org_role', v_role,
    'stages_reached', to_jsonb(v_stages),
    'seats', v_seats,
    'confirmed', v_confirm,
    'needs_confirm', iam._access_setup_needs_confirm(p_type, v_org, v_caller, array[p_id]),
    'candidates', case when v_any_may then (
        select coalesce(jsonb_agg(iam._access_setup_person(m.user_id)), '[]'::jsonb)
          from (select distinct m2.user_id from iam.memberships m2
                 where m2.organization_id = v_org and m2.container_type = 'organization'
                   and m2.status = 'active' and m2.deleted_at is null limit 500) m)
      else '[]'::jsonb end);
end
$function$;

drop function if exists iam._access_setup_person(uuid, uuid);

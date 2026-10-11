-- chair-step: inverse of accesssetup_k2: restores the bodies where any confirm by a seat changer marks the organization confirmed.
-- lane: access-setup
-- lock: iam
-- ground-standing-ok: b - the restored body calls iam._access_setup_stages, which accesssetup_b_the_seat_and_part_answers_down.sql drops; that sibling runs AFTER this inverse (inverses run in reverse order: k, j, i, h, g ... b), so the callee still stands when this one runs.
-- based-on: iam.record_setup_confirm(text, uuid[]) 27fe85da3cda6c7698f264ecce974c7b4ace49730ef75ae5714bee823a0e24e9
-- based-on: iam._access_setup_needs_confirm(text, uuid, uuid, uuid[]) 555f9d754ce4b7b0e392e55ed5690769feacd7d72721fdf601d943346ffbdea0

CREATE OR REPLACE FUNCTION iam.record_setup_confirm(p_type text, p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_caller uuid := auth.uid(); s jsonb := iam._access_setup_of(p_type); v_org uuid; v_id uuid; v_o uuid; v_audit uuid;
  v_changers text[];
begin
  if v_caller is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if s is null then return jsonb_build_object('ok', false, 'reason', 'no_setup'); end if;
  if coalesce(cardinality(p_ids), 0) = 0 or cardinality(p_ids) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'ids');
  end if;
  -- only a person who may change the setup confirms it: the admin seats or a seat named in any assignable_by
  v_changers := coalesce((select array_agg(distinct x) from (
      select jsonb_array_elements_text(coalesce(s -> 'admin_seats', '[]'::jsonb)) x
      union select jsonb_array_elements_text(coalesce(e -> 'assignable_by', '[]'::jsonb)) from jsonb_array_elements(s -> 'seats') e) q), '{}');
  foreach v_id in array p_ids loop
    v_o := iam._access_setup_head_org(p_type, v_id);
    if v_o is null or cardinality(coalesce(iam.seats_of(v_caller, p_type, v_id), '{}')) = 0 then
      return jsonb_build_object('ok', false, 'reason', 'not_reachable');
    end if;
    if not (coalesce(iam.seats_of(v_caller, p_type, v_id), '{}') && v_changers) then
      return jsonb_build_object('ok', false, 'reason', 'not_permitted');
    end if;
    if v_org is not null and v_o <> v_org then
      return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'ids');
    end if;
    v_org := v_o;
  end loop;
  v_audit := iam._record_access_audit(
    p_organization_id => v_org, p_action => 'seat_confirm', p_target_token => p_type,
    p_data_class => coalesce(iam.class_gate_class(p_type), 'organization'), p_purpose => 'access_setup',
    p_basis => 'access_setup', p_granted => true, p_target_ids => p_ids, p_row_count => cardinality(p_ids),
    p_justification => 'people involved confirmed', p_is_emergency_door => false, p_actor_user_id => v_caller);
  return jsonb_build_object('ok', true, 'audit_id', v_audit);
end
$function$;

CREATE OR REPLACE FUNCTION iam._access_setup_needs_confirm(p_type text, p_org uuid, p_user uuid, p_ids uuid[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_every boolean;
begin
  if p_org is null or coalesce(cardinality(p_ids), 0) = 0 then return false; end if;
  v_every := coalesce((platform.knob_resolve('access', 'setup_panel_every_time', p_org, p_user) #>> '{}')::boolean, false);
  if v_every then return true; end if;
  if not exists (select 1 from iam.access_audit a
                  where a.organization_id = p_org and a.target_token = p_type
                    and a.action = 'seat_confirm' and a.deleted_at is null) then
    return true;
  end if;
  return exists (select 1 from unnest(p_ids) x(id), iam._seat_table(p_type, x.id) t where t.source = 'fallback');
end
$function$;

-- chair-step: a confirm by anyone else who may change a seat is still logged but no longer marks the organization confirmed; only an admin-seat holder (HR) or an organization owner/admin does.
-- lane: access-setup
-- lock: iam
-- based-on: iam.record_setup_confirm(text, uuid[]) f07e7c299bfb4ebe15e890e6565bc5ad51a7a31ac16578c03307e477c93c4eeb
-- based-on: iam._access_setup_needs_confirm(text, uuid, uuid, uuid[]) eec4a328634116d437ebfee6495c5d2fed97b151c6b5fcdf78fd8e7f65713ce8
--
-- Plan: common-docs/systems/platform/access/projects/access-setup/PLAN.md §5b, §5c.
-- Inverse: migrations/inverse/accesssetup_k2_only_admin_confirms_switch_the_prompt_off_down.sql

CREATE OR REPLACE FUNCTION iam.record_setup_confirm(p_type text, p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_caller uuid := auth.uid(); s jsonb := iam._access_setup_of(p_type); v_org uuid; v_id uuid; v_o uuid; v_audit uuid;
  v_changers text[]; v_admin_seats text[]; v_is_admin boolean := true;
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
  v_admin_seats := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(s -> 'admin_seats', '[]'::jsonb)) x), '{}');
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
    -- the organization counts only a confirm by an admin-seat holder (HR) on every named record, or an organization owner/admin
    if not (coalesce(iam.seats_of(v_caller, p_type, v_id), '{}') && v_admin_seats) then v_is_admin := false; end if;
  end loop;
  if not v_is_admin and exists (select 1 from iam.memberships m where m.organization_id = v_org and m.user_id = v_caller
        and m.container_type = 'organization' and m.role in ('owner', 'admin') and m.status = 'active' and m.deleted_at is null) then
    v_is_admin := true;
  end if;
  v_audit := iam._record_access_audit(
    p_organization_id => v_org, p_action => 'seat_confirm', p_target_token => p_type,
    p_data_class => coalesce(iam.class_gate_class(p_type), 'organization'), p_purpose => 'access_setup',
    p_basis => case when v_is_admin then 'access_setup_admin' else 'access_setup_peer' end, p_granted => true, p_target_ids => p_ids, p_row_count => cardinality(p_ids),
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
                    and a.action = 'seat_confirm' and a.basis = 'access_setup_admin' and a.deleted_at is null) then
    return true;
  end if;
  return exists (select 1 from unnest(p_ids) x(id), iam._seat_table(p_type, x.id) t where t.source = 'fallback');
end
$function$;

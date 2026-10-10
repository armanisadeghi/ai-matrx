-- chair-step: it REPLACES the body of iam.record_setup_confirm (same signature, grants and door row) so only a person who may change the record's setup — a holder of an admin seat or of a seat named in any seat's assignable_by — can confirm; any other seat holder now gets not_permitted. Nothing else changes.
-- lane: access-setup
-- lock: iam
-- based-on: iam.record_setup_confirm(text, uuid[]) 1c3ff8116ed4ad1bb6402254720da1039a41e7d657302829058312d7844d83c8
--
-- Plan: common-docs/systems/platform/access/projects/access-setup/PLAN.md §5c.
-- Inverse: migrations/inverse/accesssetup_h2_only_setup_changers_confirm_down.sql

create or replace function iam.record_setup_confirm(p_type text, p_ids uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
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

-- chair-step: it REPLACES the body of iam.record_seat_set (same signature, same grants) so every seat change it records also writes one iam.access_audit row (action seat_change, basis = the seat's resolver kind, purpose access_setup, target = the head record, subject = the person added or excluded) and returns its audit_id. Nothing else changes; refusals are unchanged and write nothing.
-- lane: access-setup
-- lock: iam
-- based-on: iam.record_seat_set(text, uuid, text, uuid, text, text) 3460f3b731ceb3ea6785825d29319ac81a58857736129d05154675acbb562aa4
--
-- Plan: common-docs/systems/platform/access/projects/access-setup/PLAN.md §5c (leftover of step 1).
-- Inverse: migrations/inverse/accesssetup_e_seat_changes_write_the_access_log_down.sql

CREATE OR REPLACE FUNCTION iam.record_seat_set(p_type text, p_id uuid, p_seat text, p_user uuid, p_change text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_caller uuid := auth.uid(); s jsonb := iam._access_setup_of(p_type); v_seat jsonb; v_org uuid;
  v_mine text[]; v_may text[]; v_id uuid; v_left integer; v_audit uuid;
begin
  if v_caller is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if s is null then return jsonb_build_object('ok', false, 'reason', 'no_setup'); end if;
  if p_change not in ('add', 'exclude') then return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'change'); end if;
  select e into v_seat from jsonb_array_elements(s -> 'seats') e where e ->> 'key' = p_seat;
  if v_seat is null then return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'seat'); end if;
  if p_seat = s ->> 'subject_seat' then return jsonb_build_object('ok', false, 'reason', 'subject_seat_is_the_record'); end if;
  v_org := iam._access_setup_head_org(p_type, p_id);
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_mine := coalesce(iam.seats_of(v_caller, p_type, p_id), '{}');
  if cardinality(v_mine) = 0 then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_may := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_seat -> 'assignable_by', '[]'::jsonb)
                                                                          || coalesce(s -> 'admin_seats', '[]'::jsonb)) x), '{}');
  if not (v_mine && v_may) then return jsonb_build_object('ok', false, 'reason', 'not_permitted'); end if;
  if p_user is null or not exists (select 1 from iam.memberships m where m.organization_id = v_org and m.user_id = p_user
                                     and m.container_type = 'organization' and m.status = 'active' and m.deleted_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'user');
  end if;
  if p_change = 'exclude' and coalesce((v_seat ->> 'required')::boolean, false) then
    select count(*) into v_left from iam._seat_table(p_type, p_id) t where t.seat = p_seat and t.user_id <> p_user and t.source <> 'fallback';
    if v_left = 0 then return jsonb_build_object('ok', false, 'reason', 'last_holder_of_required_seat'); end if;
  end if;
  update iam.record_seat_change c set deleted_at = now(), archived_by = v_caller
   where c.entity_type = p_type and c.record_id = p_id and c.seat_key = p_seat and c.user_id = p_user and c.deleted_at is null;
  insert into iam.record_seat_change (organization_id, entity_type, record_id, seat_key, user_id, change, reason, changed_by)
  values (v_org, p_type, p_id, p_seat, p_user, p_change, nullif(btrim(coalesce(p_reason, '')), ''), v_caller)
  returning id into v_id;
  -- §5c: every seat change is written to the access log; basis = the seat's resolver kind
  v_audit := iam._record_access_audit(
    p_organization_id   => v_org,
    p_action            => 'seat_change',
    p_target_token      => p_type,
    p_data_class        => coalesce(iam.class_gate_class(p_type), 'organization'),
    p_purpose           => 'access_setup',
    p_basis             => coalesce(v_seat #>> '{resolver,kind}', 'record_seat_change'),
    p_granted           => true,
    p_target_ids        => array[p_id],
    p_row_count         => 1,
    p_subject_user_id   => p_user,
    p_justification     => format('%s %s seat%s', p_change, p_seat,
                                  coalesce(': ' || nullif(btrim(coalesce(p_reason, '')), ''), '')),
    p_is_emergency_door => false,
    p_actor_user_id     => v_caller,
    p_granted_to_user_id => p_user);
  return jsonb_build_object('ok', true, 'change_id', v_id, 'audit_id', v_audit, 'seats', (
    select coalesce(jsonb_agg(jsonb_build_object('seat', t.seat, 'user_id', t.user_id, 'source', t.source, 'removable', t.removable)), '[]'::jsonb)
      from iam._seat_table(p_type, p_id) t));
end
$function$
;

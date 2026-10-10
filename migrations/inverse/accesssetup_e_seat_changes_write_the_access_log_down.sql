-- chair-step: inverse of accesssetup_e — restores the accesssetup_b body of iam.record_seat_set, which records the seat change without writing iam.access_audit. Same signature and grants.
-- lane: access-setup
-- lock: iam
-- based-on: iam.record_seat_set(text, uuid, text, uuid, text, text) 47455727cd9f8e3509b1f56ef72534a33e2e3b68a05d3cafaaf1ef9894c144c8

CREATE OR REPLACE FUNCTION iam.record_seat_set(p_type text, p_id uuid, p_seat text, p_user uuid, p_change text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_caller uuid := auth.uid(); s jsonb := iam._access_setup_of(p_type); v_seat jsonb; v_org uuid;
  v_mine text[]; v_may text[]; v_id uuid; v_left integer;
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
  return jsonb_build_object('ok', true, 'change_id', v_id, 'seats', (
    select coalesce(jsonb_agg(jsonb_build_object('seat', t.seat, 'user_id', t.user_id, 'source', t.source, 'removable', t.removable)), '[]'::jsonb)
      from iam._seat_table(p_type, p_id) t));
end
$function$
;

-- chair-step: inverse of accesssetup_h — restores the accesssetup_b/f bodies of iam._seat_table, iam.seats_of, iam.part_level, iam._access_setup_stages and iam._access_setup_facts (no statement memo) and the accesssetup_g bodies of hr.hr_review_save_response, hr.hr_review_submit_response and hr.hr_review_calibrate, then drops iam._seat_table_now, iam._part_level_now and hr._review_response_row with their door rows.
-- lane: access-setup
-- lock: hr,iam
-- ground-standing-ok: b - this inverse restores the accesssetup_b/f bodies of iam._access_setup_stages and iam._seat_table, which call iam._access_setup_call_uuid; it runs BEFORE accesssetup_g's and accesssetup_b's inverses, and accesssetup_b_the_seat_and_part_answers_down drops those bodies and their helpers together.

CREATE OR REPLACE FUNCTION iam._access_setup_facts(p_setup jsonb, p_token text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_proc regprocedure; v_out jsonb;
begin
  if p_setup is null or p_setup ->> 'rows_fn' is null or p_id is null then return null; end if;
  v_proc := to_regprocedure(p_setup ->> 'rows_fn');
  if v_proc is null then raise exception 'access setup: rows_fn % does not exist', p_setup ->> 'rows_fn' using errcode = '42883'; end if;
  execute format('select %s($1, $2)', v_proc::regproc) into v_out using p_token, p_id;
  return v_out;
end
$function$
;
CREATE OR REPLACE FUNCTION iam._access_setup_stages(p_setup jsonb, p_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v jsonb;
begin
  if p_setup is null or p_setup ->> 'stages_fn' is null then return '{}'::text[]; end if;
  v := iam._access_setup_call_uuid(p_setup ->> 'stages_fn', p_id);
  return coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v, '[]'::jsonb)) x), '{}'::text[]);
end
$function$
;
CREATE OR REPLACE FUNCTION iam._seat_table(p_type text, p_id uuid)
 RETURNS TABLE(seat text, user_id uuid, source text, removable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s jsonb := iam._access_setup_of(p_type);
  v_seat jsonb; v_key text; v_kind text; v_org uuid; v_required boolean;
  v_subject_key text; v_subject uuid[] := '{}';
  v_res uuid[]; v_src text; v_add uuid[]; v_excl uuid[]; v_fb uuid[]; v_n integer; v_head jsonb;
begin
  if s is null or p_id is null then return; end if;
  v_subject_key := s ->> 'subject_seat';
  v_org := iam._access_setup_head_org(p_type, p_id);
  if v_org is null then return; end if;

  -- the subject seat first, so every other seat can drop its holders
  for v_seat in
    select e from jsonb_array_elements(s -> 'seats') e
     order by (e ->> 'key') is distinct from v_subject_key
  loop
    v_key := v_seat ->> 'key';
    v_kind := v_seat #>> '{resolver,kind}';
    v_required := coalesce((v_seat ->> 'required')::boolean, false);
    v_res := '{}'; v_src := 'resolver'; v_fb := '{}';
    if v_kind = 'function' then
      v_res := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(
                 coalesce(iam._access_setup_call_uuid(v_seat #>> '{resolver,fn}', p_id), '[]'::jsonb)) x
                 where x is not null), '{}');
    elsif v_kind = 'grants' then
      v_src := 'grant';
      v_res := coalesce((select array_agg(distinct p.granted_to_user_id) from iam.permissions p
                          where p.resource_type = p_type and p.resource_id = p_id and p.granted_to_user_id is not null
                            and coalesce(p.status, 'active') = 'active'
                            and (p.expires_at is null or p.expires_at > now())), '{}');
    end if;
    v_add := coalesce((select array_agg(distinct c.user_id) from iam.record_seat_change c
                        where c.entity_type = p_type and c.record_id = p_id and c.seat_key = v_key
                          and c.change = 'add' and c.deleted_at is null), '{}');
    v_excl := coalesce((select array_agg(distinct c.user_id) from iam.record_seat_change c
                         where c.entity_type = p_type and c.record_id = p_id and c.seat_key = v_key
                           and c.change = 'exclude' and c.deleted_at is null), '{}');
    v_res := coalesce((select array_agg(x) from unnest(v_res) x where not x = any(v_excl)), '{}');
    v_add := coalesce((select array_agg(x) from unnest(v_add) x where not x = any(v_excl) and not x = any(v_res)), '{}');
    if v_key = v_subject_key then
      v_subject := v_res || v_add;
    else
      -- the subject rule: other seats never resolve to the person the record is about
      v_res := coalesce((select array_agg(x) from unnest(v_res) x where not x = any(v_subject)), '{}');
      v_add := coalesce((select array_agg(x) from unnest(v_add) x where not x = any(v_subject)), '{}');
      -- the fallback: a required seat is never empty — unless the seat's fallback_when_fact says the record
      -- itself names the holder (a manager employment without a login is filled by the recorder rule)
      if v_required and cardinality(v_res) + cardinality(v_add) = 0
         and v_seat ->> 'fallback' = 'org_owners_admins' then
        if v_seat ? 'fallback_when_fact' and v_head is null then
          v_head := coalesce(iam._access_setup_facts(s, p_type, p_id), '{}'::jsonb);
        end if;
        if not (v_seat ? 'fallback_when_fact') or v_head @> (v_seat -> 'fallback_when_fact') then
          v_fb := coalesce((select array_agg(distinct m.user_id) from iam.memberships m
                             where m.organization_id = v_org and m.container_type = 'organization'
                               and m.role in ('owner', 'admin') and m.status = 'active' and m.deleted_at is null
                               and not (m.user_id = any(v_subject))
                               and not (m.user_id = any(v_excl))), '{}');
        end if;
      end if;
    end if;
    v_n := cardinality(v_res) + cardinality(v_add) + cardinality(v_fb);
    return query
      select v_key, x, v_src, not v_required or v_n > 1 from unnest(v_res) x
      union all
      select v_key, x, 'added', true from unnest(v_add) x
      union all
      select v_key, x, 'fallback', false from unnest(v_fb) x;
  end loop;
end
$function$
;
CREATE OR REPLACE FUNCTION iam.part_level(p_person uuid, p_type text, p_id uuid, p_part text, p_row_token text DEFAULT NULL::text, p_row_id uuid DEFAULT NULL::uuid)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s jsonb := iam._access_setup_of(p_type);
  f jsonb; v_part text := p_part; v_lvl public.permission_level; c record; v_mine boolean; v_sub boolean;
begin
  if s is null or p_person is null or p_id is null then return null; end if;
  if p_row_token is not null then
    f := iam._access_setup_facts(s, p_row_token, p_row_id);
    if f is null or (f ->> 'head_id')::uuid is distinct from p_id then return null; end if;
    v_part := coalesce(v_part, f ->> 'part');
    if f ->> 'part' is not null and f ->> 'part' <> v_part then return null; end if;
    v_mine := (f ->> 'author')::uuid is not distinct from p_person and f ->> 'author' is not null;
    v_sub := f ->> 'status' = 'submitted';
    -- authorship always reads: the author holds viewer on their own live row at every stage
    if v_mine and coalesce((f ->> 'live')::boolean, true) then v_lvl := 'viewer'; end if;
  end if;
  for c in select * from iam._cells_for(p_person, p_type, p_id, v_part) loop
    if c.reached and (f is null or case c.rows_rule
                                      when 'all' then true
                                      when 'own' then coalesce(v_mine, false)
                                      when 'submitted' then coalesce(v_sub, false)
                                      when 'own_or_submitted' then coalesce(v_mine, false) or coalesce(v_sub, false)
                                      else false end) then
      v_lvl := greatest(v_lvl, c.level);
    end if;
  end loop;
  return v_lvl;
end
$function$
;
CREATE OR REPLACE FUNCTION iam.seats_of(p_person uuid, p_type text, p_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select case when iam._access_setup_of(p_type) is null or p_person is null then null
              else coalesce((select array_agg(distinct t.seat order by t.seat)
                               from iam._seat_table(p_type, p_id) t where t.user_id = p_person), '{}'::text[]) end;
$function$
;

CREATE OR REPLACE FUNCTION hr.hr_review_save_response(p_review_id uuid, p_role text, p_answers jsonb, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; x hr.review_response%rowtype;
  v_lane text; v_resp uuid; v_id uuid; v_ver integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if not hr._review_reaches(v_uid, p_review_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if p_role = 'peer' and not coalesce((hr._rev_knob((select organization_id from hr.review where id = p_review_id),
       'standard_review_peers_enabled', 'false'::jsonb) #>> '{}')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'peer_reviews_not_open');
  end if;
  if p_role is null or p_role not in ('self', 'manager', 'peer') then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'role');
  end if;
  v_lane := hr._review_lane(v_uid, p_review_id, p_role);
  if v_lane is null then return jsonb_build_object('ok', false, 'reason', 'not_respondent', 'role', p_role); end if;
  select * into r from hr.review where id = p_review_id for update;
  select * into c from hr.review_cycle where id = r.cycle_id;
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'cycle_not_open', 'cycle_status', c.status); end if;
  if r.status = 'cancelled' then return jsonb_build_object('ok', false, 'reason', 'review_cancelled'); end if;
  if p_role = 'manager' and r.status in ('shared', 'acknowledged') then
    return jsonb_build_object('ok', false, 'reason', 'review_shared');
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object'
     or (p_answers ->> '__kind') is distinct from 'performance_review_answers' then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'answers',
      'detail', 'answers must be an object with __kind performance_review_answers');
  end if;
  v_resp := case when v_lane = 'recorder' then null else v_uid end;
  select * into x from hr.review_response
   where review_id = r.id and role = p_role and deleted_at is null
     and respondent_user_id is not distinct from v_resp
   for update;
  if x.id is not null and x.status = 'submitted' then
    return jsonb_build_object('ok', false, 'reason', 'already_submitted');
  end if;
  if x.id is not null and p_expected_version is not null and x.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'reason', 'version_conflict', 'current_version', x.version);
  end if;
  if x.id is null then
    insert into hr.review_response (review_id, role, respondent_user_id, recorded_by, answers, status, organization_id)
    values (r.id, p_role, v_resp, case when v_lane = 'recorder' then v_uid end, p_answers, 'draft', r.organization_id)
    returning id, version into v_id, v_ver;
  else
    update hr.review_response
       set answers = p_answers,
           recorded_by = case when v_lane = 'recorder' then v_uid else recorded_by end
     where id = x.id
    returning id, version into v_id, v_ver;
  end if;
  if r.status = 'not_started' and p_role <> 'peer' then
    update hr.review set status = 'in_progress' where id = r.id;
  end if;
  return jsonb_build_object('ok', true, 'response_id', v_id, 'role', p_role, 'version', v_ver,
                            'status', 'draft', 'saved_at', now(), 'recorded_by_hr', v_lane = 'recorder');
end
$function$;

CREATE OR REPLACE FUNCTION hr.hr_review_submit_response(p_review_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; x hr.review_response%rowtype;
  v_lane text; v_resp uuid; v_problems jsonb; v_wf jsonb; v_self_done boolean; v_mgr_done boolean;
  v_status text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if not hr._review_reaches(v_uid, p_review_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if p_role is null or p_role not in ('self', 'manager', 'peer') then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'role');
  end if;
  v_lane := hr._review_lane(v_uid, p_review_id, p_role);
  if v_lane is null then return jsonb_build_object('ok', false, 'reason', 'not_respondent', 'role', p_role); end if;
  select * into r from hr.review where id = p_review_id for update;
  select * into c from hr.review_cycle where id = r.cycle_id;
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'cycle_not_open', 'cycle_status', c.status); end if;
  if r.status = 'cancelled' then return jsonb_build_object('ok', false, 'reason', 'review_cancelled'); end if;
  if p_role = 'manager' and r.status in ('shared', 'acknowledged') then
    return jsonb_build_object('ok', false, 'reason', 'review_shared');
  end if;
  v_resp := case when v_lane = 'recorder' then null else v_uid end;
  select * into x from hr.review_response
   where review_id = r.id and role = p_role and deleted_at is null
     and respondent_user_id is not distinct from v_resp
   for update;
  if x.id is null then return jsonb_build_object('ok', false, 'reason', 'nothing_saved'); end if;
  if x.status = 'submitted' then return jsonb_build_object('ok', false, 'reason', 'already_submitted'); end if;
  v_problems := case when p_role = 'peer' then
                  case when (x.answers ->> '__kind') = 'performance_review_answers' then '[]'::jsonb
                       else '[{"question":null,"problem":"not_performance_review_answers"}]'::jsonb end
                else hr._rev_answer_problems(c.template_snapshot, x.answers, hr._rev_review_goal_ids(r.id)) end;
  if jsonb_array_length(v_problems) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'answers_incomplete', 'problems', v_problems);
  end if;
  update hr.review_response set status = 'submitted', submitted_at = now() where id = x.id;
  if p_role = 'peer' then
    return jsonb_build_object('ok', true, 'review_id', r.id, 'role', 'peer', 'submitted_at', now());
  end if;
  v_self_done := p_role = 'self' or exists (select 1 from hr.review_response where review_id = r.id
                   and role = 'self' and status = 'submitted' and deleted_at is null);
  v_mgr_done := p_role = 'manager' or exists (select 1 from hr.review_response where review_id = r.id
                   and role = 'manager' and status = 'submitted' and deleted_at is null);
  v_status := case when v_self_done and v_mgr_done then 'both_submitted'
                   when v_self_done then 'self_submitted' else 'manager_submitted' end;
  update hr.review
     set self_submitted_at = case when p_role = 'self' then now() else self_submitted_at end,
         manager_submitted_at = case when p_role = 'manager' then now() else manager_submitted_at end,
         status = v_status
   where id = r.id;
  v_wf := hr._rev_close_step(r.id, p_role, 'attested', v_uid, v_lane);
  if v_status = 'both_submitted' then
    perform hr._rev_set_due(r.workflow_instance_id, 'share', c.share_due_on);
  end if;
  return jsonb_build_object('ok', true, 'review_id', r.id, 'role', p_role, 'submitted_at', now(),
    'review_status', v_status, 'both_submitted', v_status = 'both_submitted', 'workflow', v_wf);
end
$function$;

CREATE OR REPLACE FUNCTION hr.hr_review_calibrate(p_review_id uuid, p_rating text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into r from hr.review where id = p_review_id and deleted_at is null for update;
  if r.id is null or not iam.may_act_seat(v_uid, 'hr_review', r.id, 'calibrate') then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  select * into c from hr.review_cycle where id = r.cycle_id;
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'cycle_not_open', 'cycle_status', c.status); end if;
  if r.status = 'cancelled' then return jsonb_build_object('ok', false, 'reason', 'review_cancelled'); end if;
  if p_rating is not null and not exists (
       select 1 from jsonb_array_elements(coalesce(c.template_snapshot #> '{rating_scale,points}', '[]'::jsonb)) p
        where p ->> 'key' = p_rating) then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'rating');
  end if;
  -- the manager's overall_rating is kept; HR's calibrated rating sits beside it
  update hr.review set calibrated_rating = p_rating,
                       calibration_note = nullif(btrim(coalesce(p_note, '')), ''),
                       calibrated_by = v_uid, calibrated_at = now()
   where id = r.id;
  return jsonb_build_object('ok', true, 'review_id', r.id, 'overall_rating', r.overall_rating,
                            'calibrated_rating', p_rating, 'calibrated_at', now());
end
$function$;

delete from platform.client_callable_door
 where (schema_name = 'iam' and function_name in ('_seat_table_now', '_part_level_now'))
    or (schema_name = 'hr' and function_name = '_review_response_row');
drop function iam._seat_table_now(text, uuid);
drop function iam._part_level_now(uuid, text, uuid, text, text, uuid);
drop function hr._review_response_row(uuid, text, text, uuid);

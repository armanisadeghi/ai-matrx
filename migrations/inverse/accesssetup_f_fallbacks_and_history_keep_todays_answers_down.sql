-- chair-step: inverse of accesssetup_f — restores the accesssetup_b/c bodies of iam._seat_table, iam._cells_for, iam.may_act and hr.review_row_facts and the hr_review declaration as it stood, and drops iam.may_act_seat, iam.seats_opening and hr.review_seat_line_manager(+_set). Only valid while no door calls them (before accesssetup_g, or after its inverse).
-- lane: access-setup
-- lock: hr,iam
-- ground-standing-ok: b - this inverse restores the accesssetup_b bodies of iam._seat_table, iam._cells_for and iam.may_act, which call iam._access_setup_call_uuid and iam._access_setup_stages; it runs BEFORE accesssetup_b_the_seat_and_part_answers_down, which drops those bodies and their helpers together.

update iam.access_setup set setup = $setup${"grid": {"hr": {"discussion": {"level": "editor"}, "peer_input": {"rows": "all", "level": "viewer"}, "calibration": {"level": "editor"}, "final_summary": {"level": "viewer"}, "self_evaluation": {"rows": "all", "level": "viewer"}, "peer_nominations": {"level": "viewer"}, "manager_evaluation": {"rows": "all", "level": "viewer"}}, "peer": {"peer_input": {"rows": "own", "level": "editor"}}, "manager": {"discussion": {"level": "editor"}, "peer_input": {"rows": "submitted", "level": "viewer"}, "final_summary": {"level": "editor"}, "self_evaluation": {"rows": "submitted", "level": "viewer", "from_stage": "manager_may_see_self"}, "peer_nominations": {"level": "editor"}, "manager_evaluation": {"rows": "all", "level": "editor"}}, "employee": {"discussion": {"level": "viewer", "from_stage": "shared"}, "peer_input": {"rows": "submitted", "level": "viewer", "names": "knob:hr.performance/standard_review_peer_anonymous", "from_stage": "peer_shared"}, "final_summary": {"level": "viewer", "from_stage": ["shared", "acknowledged"]}, "self_evaluation": {"rows": "all", "level": "editor"}, "peer_nominations": {"rows": "all", "level": "viewer", "names": "shown"}, "manager_evaluation": {"rows": "all", "level": "viewer", "from_stage": "shared"}}, "skip_level": {"discussion": {"level": "viewer"}, "final_summary": {"level": "viewer"}, "self_evaluation": {"rows": "submitted", "level": "viewer", "from_stage": "both_submitted"}, "manager_evaluation": {"rows": "submitted", "level": "viewer", "from_stage": "both_submitted"}}, "shared_with": {"final_summary": {"level": "viewer", "from_stage": "shared"}}, "upper_management": {"discussion": {"level": "viewer"}, "peer_input": {"rows": "all", "level": "viewer"}, "calibration": {"level": "viewer"}, "final_summary": {"level": "viewer"}, "self_evaluation": {"rows": "all", "level": "viewer"}, "peer_nominations": {"level": "viewer"}, "manager_evaluation": {"rows": "all", "level": "viewer"}}}, "parts": [{"key": "self_evaluation"}, {"key": "manager_evaluation"}, {"key": "peer_input"}, {"key": "peer_nominations"}, {"key": "calibration"}, {"key": "final_summary"}, {"key": "discussion"}], "seats": [{"key": "employee", "required": true, "resolver": {"fn": "hr.review_seat_employee(uuid)", "kind": "function", "set_fn": "hr.review_seat_employee_set(uuid)"}}, {"key": "manager", "fallback": "org_owners_admins", "required": true, "resolver": {"fn": "hr.review_seat_manager(uuid)", "kind": "function", "set_fn": "hr.review_seat_manager_set(uuid)"}}, {"key": "hr", "many": true, "fallback": "org_owners_admins", "required": true, "resolver": {"fn": "hr.review_seat_hr(uuid)", "kind": "function", "set_fn": "hr.review_seat_hr_set(uuid)"}, "assignable_by": ["hr"]}, {"key": "upper_management", "many": true, "resolver": {"fn": "hr.review_seat_upper(uuid)", "kind": "function", "set_fn": "hr.review_seat_upper_set(uuid)"}, "assignable_by": ["hr"]}, {"key": "skip_level", "resolver": {"fn": "hr.review_seat_skip_level(uuid)", "kind": "function", "set_fn": "hr.review_seat_skip_level_set(uuid)"}}, {"key": "peer", "many": true, "resolver": {"fn": "hr.review_seat_peers(uuid)", "kind": "function", "set_fn": "hr.review_seat_peers_set(uuid)"}, "assignable_by": ["employee", "manager"]}, {"key": "shared_with", "many": true, "resolver": {"kind": "grants"}}], "stages": ["started", "self_submitted", "manager_submitted", "both_submitted", "manager_may_see_self", "calibrated", "peer_shared", "shared", "acknowledged", "reopened", "cancelled"], "actions": {"start": {"seats": ["manager", "hr"]}, "cancel": {"seats": ["hr"], "not_stages": ["cancelled", "acknowledged"]}, "reopen": {"seats": ["manager", "hr"], "stages": ["shared", "acknowledged"], "not_stages": ["cancelled"]}, "calibrate": {"seats": ["hr"], "not_stages": ["cancelled"]}, "peer_share": {"seats": ["manager"], "not_stages": ["cancelled"]}, "acknowledge": {"seats": ["employee"], "stages": ["shared"], "not_stages": ["acknowledged", "cancelled"]}, "set_overall": {"seats": ["manager"], "not_stages": ["shared", "acknowledged", "cancelled"]}, "peer_approve": {"seats": ["manager"], "not_stages": ["cancelled"]}, "peer_nominate": {"seats": ["employee", "manager"], "when_fact": {"peers_enabled": true}, "not_stages": ["cancelled"]}, "replace_manager": {"seats": ["hr"], "not_stages": ["cancelled", "acknowledged", "shared"]}, "release_to_employee": {"seats": ["manager"], "stages": ["both_submitted"], "not_stages": ["shared", "acknowledged", "cancelled"]}}, "columns": {"shared_at": "final_summary", "calibrated_at": "calibration", "calibrated_by": "calibration", "overall_rating": "final_summary", "reopen_history": {"part": "discussion", "min_level": "editor", "else_keep_keys": ["at", "reason"]}, "calibration_note": "calibration", "calibrated_rating": "calibration", "acknowledgment_comment": "final_summary"}, "members": [{"token": "hr_review_response", "part_from": {"map": {"peer": "peer_input", "self": "self_evaluation", "manager": "manager_evaluation"}, "fact": "role"}, "head_column": "review_id"}, {"part": "peer_nominations", "token": "hr_review_peer_nomination", "head_column": "review_id"}], "rows_fn": "hr.review_row_facts(text,uuid)", "recorders": [{"lend_to": "admin_seats", "for_seat": "employee", "when_fact": {"employee_has_login": false}}, {"lend_to": "admin_seats", "for_seat": "manager", "when_fact": {"manager_has_login": false}}], "stages_fn": "hr.review_stages(uuid)", "blind_wins": {"self_evaluation": ["manager"]}, "share_seat": "shared_with", "admin_seats": ["hr"], "entity_type": "hr_review", "subject_seat": "employee", "attached_part": "discussion"}$setup$::jsonb,
       declared_by = 'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql'
 where entity_type = 'hr_review';

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
  v_res uuid[]; v_src text; v_add uuid[]; v_excl uuid[]; v_fb uuid[]; v_all uuid[]; v_n integer;
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
      -- the fallback: a required seat is never empty
      if v_required and cardinality(v_res) + cardinality(v_add) = 0
         and v_seat ->> 'fallback' = 'org_owners_admins' then
        v_fb := coalesce((select array_agg(distinct m.user_id) from iam.memberships m
                           where m.organization_id = v_org and m.container_type = 'organization'
                             and m.role in ('owner', 'admin') and m.status = 'active' and m.deleted_at is null
                             and not (m.user_id = any(v_subject))
                             and not (m.user_id = any(v_excl))), '{}');
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

CREATE OR REPLACE FUNCTION iam._cells_for(p_person uuid, p_type text, p_id uuid, p_part text)
 RETURNS TABLE(seat text, level permission_level, rows_rule text, from_stage jsonb, names text, reached boolean, borrowed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s jsonb := iam._access_setup_of(p_type);
  v_seats text[]; v_blind text[]; v_stages text[]; v_head jsonb; v_admin text[]; r jsonb; v_lend text[];
  v_seat text; c jsonb;
begin
  if s is null or p_person is null then return; end if;
  v_seats := iam.seats_of(p_person, p_type, p_id);
  v_stages := iam._access_setup_stages(s, p_id);
  v_admin := coalesce((select array_agg(x) from jsonb_array_elements_text(s -> 'admin_seats') x), '{}');

  -- blind_wins: a person who also holds a listed seat keeps that seat's gate on this part
  v_blind := (select array_agg(x) from jsonb_array_elements_text(s -> 'blind_wins' -> p_part) x);
  if v_blind is not null and v_seats && v_blind then
    v_seats := (select array_agg(x) from unnest(v_seats) x where x = any(v_blind));
  end if;

  foreach v_seat in array coalesce(v_seats, '{}') loop
    c := s -> 'grid' -> v_seat -> p_part;
    if c is not null then
      seat := v_seat; level := (c ->> 'level')::public.permission_level; rows_rule := coalesce(c ->> 'rows', 'all');
      from_stage := c -> 'from_stage'; names := coalesce(c ->> 'names', 'shown');
      reached := iam._access_setup_stage_reached(c -> 'from_stage', v_stages); borrowed := false;
      return next;
    end if;
  end loop;

  -- recorders: when a seat's holder has no login, the lend_to seats borrow that seat's editor cells
  -- (never the subject, never the holder themselves)
  if jsonb_array_length(coalesce(s -> 'recorders', '[]'::jsonb)) > 0
     and not (coalesce(iam.seats_of(p_person, p_type, p_id), '{}') @> array[s ->> 'subject_seat']) then
    v_head := iam._access_setup_facts(s, p_type, p_id);
    for r in select e from jsonb_array_elements(s -> 'recorders') e loop
      v_lend := case when r ->> 'lend_to' = 'admin_seats' then v_admin
                     else (select array_agg(x) from jsonb_array_elements_text(r -> 'lend_to') x) end;
      if coalesce(iam.seats_of(p_person, p_type, p_id), '{}') && coalesce(v_lend, '{}')
         and not (coalesce(iam.seats_of(p_person, p_type, p_id), '{}') @> array[r ->> 'for_seat'])
         and coalesce(v_head, '{}'::jsonb) @> coalesce(r -> 'when_fact', '{}'::jsonb) then
        c := s -> 'grid' -> (r ->> 'for_seat') -> p_part;
        if c is not null and c ->> 'level' = 'editor' then
          seat := r ->> 'for_seat'; level := 'editor'; rows_rule := coalesce(c ->> 'rows', 'all');
          from_stage := c -> 'from_stage'; names := coalesce(c ->> 'names', 'shown');
          reached := iam._access_setup_stage_reached(c -> 'from_stage', v_stages); borrowed := true;
          return next;
        end if;
      end if;
    end loop;
  end if;
end
$function$
;

CREATE OR REPLACE FUNCTION iam.may_act(p_person uuid, p_type text, p_id uuid, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s jsonb := iam._access_setup_of(p_type);
  a jsonb; v_seats text[]; v_stages text[]; v_head jsonb; v_admin text[]; r jsonb; v_lend text[];
begin
  if s is null or p_person is null or p_id is null then return false; end if;
  a := s -> 'actions' -> p_action;
  if a is null then return false; end if;
  v_seats := coalesce(iam.seats_of(p_person, p_type, p_id), '{}');
  v_stages := iam._access_setup_stages(s, p_id);
  v_head := coalesce(iam._access_setup_facts(s, p_type, p_id), '{}'::jsonb);
  v_admin := coalesce((select array_agg(x) from jsonb_array_elements_text(s -> 'admin_seats') x), '{}');
  -- recorders lend the absent holder's actions too
  if not (v_seats @> array[s ->> 'subject_seat']) then
    for r in select e from jsonb_array_elements(coalesce(s -> 'recorders', '[]'::jsonb)) e loop
      v_lend := case when r ->> 'lend_to' = 'admin_seats' then v_admin
                     else (select array_agg(x) from jsonb_array_elements_text(r -> 'lend_to') x) end;
      if v_seats && coalesce(v_lend, '{}') and not (v_seats @> array[r ->> 'for_seat'])
         and v_head @> coalesce(r -> 'when_fact', '{}'::jsonb) then
        v_seats := v_seats || (r ->> 'for_seat');
      end if;
    end loop;
  end if;
  if not (v_seats && coalesce((select array_agg(x) from jsonb_array_elements_text(a -> 'seats') x), '{}')) then
    return false;
  end if;
  if a ? 'stages' and not (v_stages && (select array_agg(x) from jsonb_array_elements_text(a -> 'stages') x)) then
    return false;
  end if;
  if a ? 'not_stages' and v_stages && (select array_agg(x) from jsonb_array_elements_text(a -> 'not_stages') x) then
    return false;
  end if;
  if a ? 'when_fact' and not (v_head @> (a -> 'when_fact')) then return false; end if;
  return true;
end
$function$
;

CREATE OR REPLACE FUNCTION hr.review_row_facts(p_token text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare r hr.review%rowtype; x hr.review_response%rowtype; n hr.review_peer_nomination%rowtype;
begin
  if p_token = 'hr_review' then
    select * into r from hr.review where id = p_id;
    if r.id is null then return null; end if;
    return jsonb_build_object('head_id', r.id, 'organization_id', r.organization_id, 'status', r.status,
      'live', r.deleted_at is null,
      'employee_has_login', r.employee_user_id is not null,
      'manager_has_login', r.manager_user_id is not null,
      'peers_enabled', coalesce((hr._hr_knob('hr.performance', 'standard_review_peers_enabled', r.organization_id,
                                             'false'::jsonb) #>> '{}')::boolean, false));
  elsif p_token = 'hr_review_response' then
    select * into x from hr.review_response where id = p_id;
    if x.id is null then return null; end if;
    return jsonb_build_object('head_id', x.review_id, 'author', x.respondent_user_id, 'status', x.status,
      'role', x.role, 'live', x.deleted_at is null, 'recorded_by', x.recorded_by,
      'part', case x.role when 'self' then 'self_evaluation' when 'manager' then 'manager_evaluation'
                          when 'peer' then 'peer_input' end);
  elsif p_token = 'hr_review_peer_nomination' then
    select * into n from hr.review_peer_nomination where id = p_id;
    if n.id is null then return null; end if;
    return jsonb_build_object('head_id', n.review_id, 'author', n.nominated_by, 'status', n.status,
      'live', n.deleted_at is null, 'part', 'peer_nominations');
  end if;
  return null;
end
$function$
;

delete from platform.client_callable_door where schema_name = 'hr' and function_name in ('review_seat_line_manager', 'review_seat_line_manager_set');
delete from platform.client_callable_door where schema_name = 'iam' and function_name in ('may_act_seat', 'seats_opening');
drop function if exists hr.review_seat_line_manager_set(uuid);
drop function if exists hr.review_seat_line_manager(uuid);
drop function if exists iam.seats_opening(uuid, text, uuid);
drop function if exists iam.may_act_seat(uuid, text, uuid, text);

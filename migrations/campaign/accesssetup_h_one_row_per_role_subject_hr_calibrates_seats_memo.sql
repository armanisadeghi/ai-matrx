-- chair-step: it REPLACES the live bodies of iam._seat_table, iam.seats_of, iam.part_level, iam._access_setup_stages and iam._access_setup_facts with statement-memo wrappers (their answers unchanged; the old bodies of _seat_table and part_level move to iam._seat_table_now / iam._part_level_now), and REPLACES hr.hr_review_save_response, hr.hr_review_submit_response and hr.hr_review_calibrate: one live response per role for self and manager (a submitted one refuses every later save or submit with "already_submitted"; a login linked after the review lands on the HR recorder's row), and calibrate admits HR in the organization exactly as the legacy door did, including HR who is the review's subject.
-- lane: access-setup
-- lock: hr,iam
-- based-on: iam._seat_table(text, uuid) 704b8ed7987081d0835e77758851a176c2b796bf45258301760fddd5381a8b0b
-- based-on: iam.seats_of(uuid, text, uuid) 4b3a6c543b13e41970a2532af32610330a549908b8b0857386f32032d911011b
-- based-on: iam._access_setup_stages(jsonb, uuid) e9f7a573bd854be1e81b13b90e8614e3d55a7c4c34fef3a5d8546349474596af
-- based-on: iam._access_setup_facts(jsonb, text, uuid) 2fb5765bda02b01249714081b4904472fe80f08dad69387c148b9c19e1c3c459
-- based-on: iam.part_level(uuid, text, uuid, text, text, uuid) 31c843b0ccbf1f1181d8899a865db013f46269c3413d848444d6d42e16ff5451
-- based-on: hr.hr_review_save_response(uuid, text, jsonb, integer) 0b004de819b4334700e1d3213ccbc940df08d60b66cc47bd901de1af3f8af9af
-- based-on: hr.hr_review_submit_response(uuid, text) e626f585ea598c8b14896d194fd89f6e590616090aa8cce6e1b12ad735e8f714
-- based-on: hr.hr_review_calibrate(uuid, text, text) 50fd193ed2ff2dcefdf899afad7337aa425fac7bab730f1fc54af4279c08e5f2
--
-- Plan: common-docs/systems/platform/access/projects/access-setup/PLAN.md §4 (seats_of statement-memoised), §8 step 4.
-- Inverse: migrations/inverse/accesssetup_h_one_row_per_role_subject_hr_calibrates_seats_memo_down.sql
--
-- Owner rulings 2026-10-10:
--  1. A login linked after creation could save a SECOND self row after HR recorded and submitted one. Now: for
--     self and manager a submitted live response of that role refuses a save or submit ("already_submitted",
--     today's word); the person's own lane finds their row, else the HR recorder's row (respondent null) and
--     takes it over (respondent_user_id = the person; recorded_by kept). The recorder lane never writes beside
--     a row the respondent already owns ("not_respondent", today's word).
--  2. Statement memo (KERNEL.md "One statement asks each sub-question once"): the same platform.memo_k_* slots
--     and the same switch iam.kernel_batch_on (knob access/kernel_batch; off once the transaction has written;
--     mx.kernel_batch forces either path). Keys carry the arguments and pg_current_snapshot().
--  3. Calibrate: legacy admitted hr._rev_can_manage (HR in the organization) whatever the person's seat, so HR
--     who is the review's subject could calibrate it. Restored: the seat answer OR hr._rev_can_manage. No part
--     opens: what the subject-HR person sees is unchanged (employee seat). Every other legacy org-level HR action
--     (cancel, replace_manager, reopen-as-HR, recorder lanes) already refused the subject in legacy (its seat was
--     'employee' by precedence), so nothing else changes.

-- ── the statement memo ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION iam._seat_table_now(p_type text, p_id uuid)
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

CREATE OR REPLACE FUNCTION iam._seat_table(p_type text, p_id uuid)
 RETURNS TABLE(seat text, user_id uuid, source text, removable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- iam._seat_table_now's rows, kept in the statement memo per (type, id, snapshot) while iam.kernel_batch_on.
declare v_key text; v_m text; v_j jsonb;
begin
  if p_id is null or not iam.kernel_batch_on(null) then
    return query select * from iam._seat_table_now(p_type, p_id);
    return;
  end if;
  v_key := 'iam._seat_table:' || coalesce(p_type, '') || ':' || p_id::text || ':' || pg_catalog.pg_current_snapshot()::text;
  v_m := platform.memo_k_get(v_key);
  if v_m is null then
    select coalesce(jsonb_agg(jsonb_build_array(t.seat, t.user_id, t.source, t.removable) order by t.n), '[]'::jsonb)
      into v_j from iam._seat_table_now(p_type, p_id) with ordinality t(seat, user_id, source, removable, n);
    perform platform.memo_k_put(v_key, v_j::text);
  else
    v_j := v_m::jsonb;
  end if;
  return query select e ->> 0, (e ->> 1)::uuid, e ->> 2, (e ->> 3)::boolean
                 from jsonb_array_elements(v_j) with ordinality x(e, n) order by x.n;
end
$function$;

CREATE OR REPLACE FUNCTION iam.seats_of(p_person uuid, p_type text, p_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- the seats one person holds on one record; asked once per (person, type, id, snapshot) per statement while
-- iam.kernel_batch_on(person) (statement memo)
declare v_key text; v_m text; v_s text[];
begin
  if iam._access_setup_of(p_type) is null or p_person is null then return null; end if;
  if iam.kernel_batch_on(p_person) then
    v_key := 'iam.seats_of:' || p_person::text || ':' || p_type || ':' || coalesce(p_id::text, '') || ':'
          || pg_catalog.pg_current_snapshot()::text;
    v_m := platform.memo_k_get(v_key);
    if v_m is not null then return v_m::text[]; end if;
  end if;
  v_s := coalesce((select array_agg(distinct t.seat order by t.seat)
                     from iam._seat_table(p_type, p_id) t where t.user_id = p_person), '{}'::text[]);
  if v_key is not null then perform platform.memo_k_put(v_key, v_s::text); end if;
  return v_s;
end
$function$;

CREATE OR REPLACE FUNCTION iam._access_setup_stages(p_setup jsonb, p_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- the record's reached stages; statement memo per (stages_fn, id, snapshot) while iam.kernel_batch_on
declare v jsonb; v_key text; v_m text; v_out text[];
begin
  if p_setup is null or p_setup ->> 'stages_fn' is null then return '{}'::text[]; end if;
  if p_id is not null and iam.kernel_batch_on(null) then
    v_key := 'iam._access_setup_stages:' || (p_setup ->> 'stages_fn') || ':' || p_id::text || ':'
          || pg_catalog.pg_current_snapshot()::text;
    v_m := platform.memo_k_get(v_key);
    if v_m is not null then return v_m::text[]; end if;
  end if;
  v := iam._access_setup_call_uuid(p_setup ->> 'stages_fn', p_id);
  v_out := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v, '[]'::jsonb)) x), '{}'::text[]);
  if v_key is not null then perform platform.memo_k_put(v_key, v_out::text); end if;
  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION iam._access_setup_facts(p_setup jsonb, p_token text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- a row's facts from the setup's rows_fn; statement memo per (rows_fn, token, id, snapshot) while iam.kernel_batch_on
declare v_proc regprocedure; v_out jsonb; v_key text; v_m text;
begin
  if p_setup is null or p_setup ->> 'rows_fn' is null or p_id is null then return null; end if;
  if iam.kernel_batch_on(null) then
    v_key := 'iam._access_setup_facts:' || (p_setup ->> 'rows_fn') || ':' || coalesce(p_token, '') || ':' || p_id::text
          || ':' || pg_catalog.pg_current_snapshot()::text;
    v_m := platform.memo_k_get(v_key);
    if v_m is not null then return nullif(v_m, '-')::jsonb; end if;
  end if;
  v_proc := to_regprocedure(p_setup ->> 'rows_fn');
  if v_proc is null then raise exception 'access setup: rows_fn % does not exist', p_setup ->> 'rows_fn' using errcode = '42883'; end if;
  execute format('select %s($1, $2)', v_proc::regproc) into v_out using p_token, p_id;
  if v_key is not null then perform platform.memo_k_put(v_key, coalesce(v_out::text, '-')); end if;
  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION iam._part_level_now(p_person uuid, p_type text, p_id uuid, p_part text, p_row_token text DEFAULT NULL::text, p_row_id uuid DEFAULT NULL::uuid)
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

CREATE OR REPLACE FUNCTION iam.part_level(p_person uuid, p_type text, p_id uuid, p_part text, p_row_token text DEFAULT NULL::text, p_row_id uuid DEFAULT NULL::uuid)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- iam._part_level_now's answer, kept in the statement memo per (person, type, id, part, row, snapshot) while
-- iam.kernel_batch_on(person): redact_by_parts asks the same part once per mapped column
declare v_key text; v_m text; v_l public.permission_level;
begin
  if p_person is null or p_id is null or not iam.kernel_batch_on(p_person) then
    return iam._part_level_now(p_person, p_type, p_id, p_part, p_row_token, p_row_id);
  end if;
  v_key := 'iam.part_level:' || p_person::text || ':' || coalesce(p_type, '') || ':' || p_id::text || ':'
        || coalesce(p_part, '') || ':' || coalesce(p_row_token, '') || ':' || coalesce(p_row_id::text, '') || ':'
        || pg_catalog.pg_current_snapshot()::text;
  v_m := platform.memo_k_get(v_key);
  if v_m is not null then return nullif(v_m, '-')::public.permission_level; end if;
  v_l := iam._part_level_now(p_person, p_type, p_id, p_part, p_row_token, p_row_id);
  perform platform.memo_k_put(v_key, coalesce(v_l::text, '-'));
  return v_l;
end
$function$;

revoke all on function iam._seat_table_now(text, uuid) from public, anon, authenticated;
revoke all on function iam._part_level_now(uuid, text, uuid, text, text, uuid) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('iam', '_seat_table_now', 'p_type text, p_id uuid', array['text'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_h_one_row_per_role_subject_hr_calibrates_seats_memo.sql (lane access-setup)',
   'ACCESS-SETUP §4: the un-memoised body of iam._seat_table (the memo wrapper asks it once per statement).',
   'server_only: called only by iam._seat_table; it answers every seat holder of a record, so no client may call it.', false, false),
  ('iam', '_part_level_now', 'p_person uuid, p_type text, p_id uuid, p_part text, p_row_token text, p_row_id uuid',
   array['uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_h_one_row_per_role_subject_hr_calibrates_seats_memo.sql (lane access-setup)',
   'ACCESS-SETUP §4: the un-memoised body of iam.part_level (the memo wrapper asks it once per statement).',
   'server_only: called only by iam.part_level; it takes the person as an argument, so no client may call it (a client would name anyone).', false, false)
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, signed_in_callers = false, anonymous_callers = false,
      reason = excluded.reason, declared_by = excluded.declared_by;

-- ── one live response per role (ruling 1) ────────────────────────────────────────────────────────
-- the row a person writes for self or manager: their own; else (own lane) the HR recorder's row; a peer keys by
-- respondent as before
create or replace function hr._review_response_row(p_review_id uuid, p_role text, p_lane text, p_uid uuid)
 returns uuid
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select x.id from hr.review_response x
   where x.review_id = p_review_id and x.role = p_role and x.deleted_at is null
     and (x.respondent_user_id is not distinct from case when p_lane = 'recorder' then null else p_uid end
          or (p_role <> 'peer' and p_lane = 'self' and x.respondent_user_id is null))
   order by (x.respondent_user_id is not distinct from case when p_lane = 'recorder' then null else p_uid end) desc,
            x.created_at
   limit 1;
$function$;
revoke all on function hr._review_response_row(uuid, text, text, uuid) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('hr', '_review_response_row', 'p_review_id uuid, p_role text, p_lane text, p_uid uuid',
   array['uuid'::regtype::oid, 'text'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_h_one_row_per_role_subject_hr_calibrates_seats_memo.sql (lane access-setup)',
   'ACCESS-SETUP ruling 1: the one live response row a person writes for a role (own, else the HR recorder''s).',
   'server_only: called only from inside the hr.hr_review_save_response / _submit_response SECURITY DEFINER doors after they read the caller from auth.uid(); no client role holds EXECUTE.', false, false)
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, signed_in_callers = false, anonymous_callers = false,
      reason = excluded.reason, declared_by = excluded.declared_by;

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
  -- self and manager have ONE live response each: a submitted one ends every later save, whoever wrote it
  if p_role <> 'peer' and exists (select 1 from hr.review_response where review_id = r.id and role = p_role
                                     and status = 'submitted' and deleted_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'already_submitted');
  end if;
  select * into x from hr.review_response
   where id = hr._review_response_row(r.id, p_role, v_lane, v_uid)
   for update;
  -- the recorder never writes beside a row the respondent already owns
  if x.id is null and p_role <> 'peer' and v_lane = 'recorder'
     and exists (select 1 from hr.review_response where review_id = r.id and role = p_role
                   and respondent_user_id is not null and deleted_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'not_respondent', 'role', p_role);
  end if;
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
    -- a person whose login was linked after the review takes over the HR recorder's draft (recorded_by kept)
    update hr.review_response
       set answers = p_answers,
           respondent_user_id = coalesce(respondent_user_id, v_resp),
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
   where id = hr._review_response_row(r.id, p_role, v_lane, v_uid)
   for update;
  -- self and manager have ONE live response each: a submitted one ends every later submit, whoever wrote it
  if p_role <> 'peer' and coalesce(x.status, '') <> 'submitted'
     and exists (select 1 from hr.review_response where review_id = r.id and role = p_role
                   and status = 'submitted' and deleted_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'already_submitted');
  end if;
  if x.id is null then return jsonb_build_object('ok', false, 'reason', 'nothing_saved'); end if;
  if x.status = 'submitted' then return jsonb_build_object('ok', false, 'reason', 'already_submitted'); end if;
  if x.respondent_user_id is null and v_resp is not null then
    update hr.review_response set respondent_user_id = v_resp where id = x.id;
  end if;
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
  -- legacy admitted HR in the organization whatever their seat (so HR who is the review's subject calibrates it)
  if r.id is null or not (hr._rev_can_manage(v_uid, r.organization_id)
                          or iam.may_act_seat(v_uid, 'hr_review', r.id, 'calibrate')) then
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

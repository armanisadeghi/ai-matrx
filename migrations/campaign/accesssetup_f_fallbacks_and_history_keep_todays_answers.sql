-- chair-step: it REPLACES four access-setup bodies created by this campaign (iam._seat_table, iam._cells_for, iam.may_act, hr.review_row_facts), ADDS iam.may_act_seat, iam.seats_opening and the hr.review_seat_line_manager resolver (+ set form), and UPDATES the hr_review declaration row. No live door calls any of this yet, so no person's answer changes anywhere; the frozen legacy bodies are untouched.
-- lane: access-setup
-- lock: hr,iam
-- based-on: hr.review_row_facts(text, uuid) ea87b3dd5fb638e71866784e63782b25b1e08e0fdd31bc24d15495010a195677
-- based-on: iam._seat_table(text, uuid) 95d2069014507434665cfc421eadd820bbdb6ba6f07bee697adc78929b82db48
-- based-on: iam._cells_for(uuid, text, uuid, text) d8ab1e27d1ce933587d7959deff293dc5679ef5ee80bfeb14b60950839fc3939
-- based-on: iam.may_act(uuid, text, uuid, text) dcf71eb0c46d4c2370e61b5fce28b2bc2429aeec6a315ecaa64d77f7074e83fe
--
-- Plan: common-docs/systems/platform/access/projects/access-setup/PLAN.md §2, §7 (step 3 blockers 2 and 4).
-- Inverse: migrations/inverse/accesssetup_f_fallbacks_and_history_keep_todays_answers_down.sql
--
-- Blocker 2 (a tightening): the manager fallback fired for a review whose manager has no login, so the org
-- owner who is also HR held manager(fallback) and blind_wins hid self rows HR reads today. Two rules, both kept:
--   * a seat may carry "fallback_when_fact": the fallback fires only when the head's facts contain it. The
--     manager seat says {"manager_named": false}: a manager employment without a login is NOT an empty seat
--     (the recorder rule lends it to HR, exactly as today); fallback fires only when the review names no manager.
--   * a seat held only through a fallback never triggers blind_wins.
-- Blocker 4 (a tightening): after a reorg the new position manager lost overall_rating / shared_at on history
-- entries. History keeps today's chain logic; the declaration gains the seat that logic names:
--   * "line_manager" — the review's employee's position manager at depth 1, at depth 2 when the skip-level knob
--     is on (hr.manager_chain, today's history rule), and the manager of any live review of the same employment
--     (today's history also admits them). Its only cell is final_summary viewer — exactly what history shows.
--   * "opens_record": false — a seat that never opens the record by itself (iam.seats_opening drops it; the
--     doors and, at step 5, the kernel arm read reach from that). Today nobody reaches a review through it.
-- Grammar also gains "recorders": false on an action (peer_nominate, peer_approve): today's peer doors never
-- take the HR recorder lane, so the lent seat must not open them. iam.may_act_seat answers the seat half of an
-- action (seats + lent seats) so a door keeps its own state refusals, in today's words and order.

-- ── head facts: whether the review names a manager at all ─────────────────────────────────────────
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
      'manager_named', r.manager_employment_id is not null or r.manager_user_id is not null,
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
$function$;

-- ── the seat table: a fallback fires only when the seat's fallback_when_fact holds ──────────────────
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
$function$;

-- ── cells: a seat held only through a fallback never triggers blind_wins ──────────────────────────
CREATE OR REPLACE FUNCTION iam._cells_for(p_person uuid, p_type text, p_id uuid, p_part text)
 RETURNS TABLE(seat text, level permission_level, rows_rule text, from_stage jsonb, names text, reached boolean, borrowed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s jsonb := iam._access_setup_of(p_type);
  v_seats text[]; v_blind text[]; v_stages text[]; v_head jsonb; v_admin text[]; r jsonb; v_lend text[];
  v_seat text; c jsonb; v_held text[];
begin
  if s is null or p_person is null then return; end if;
  v_seats := iam.seats_of(p_person, p_type, p_id);
  v_stages := iam._access_setup_stages(s, p_id);
  v_admin := coalesce((select array_agg(x) from jsonb_array_elements_text(s -> 'admin_seats') x), '{}');

  -- blind_wins: a person who also holds a listed seat keeps that seat's gate on this part — only when they
  -- hold it in their own right (resolver, grant, add), never when a fallback merely filled an empty seat
  v_blind := (select array_agg(x) from jsonb_array_elements_text(s -> 'blind_wins' -> p_part) x);
  if v_blind is not null and v_seats && v_blind then
    v_held := coalesce((select array_agg(distinct t.seat) from iam._seat_table(p_type, p_id) t
                         where t.user_id = p_person and t.source <> 'fallback'), '{}');
    if v_held && v_blind then
      v_seats := (select array_agg(x) from unnest(v_seats) x where x = any(v_blind));
    end if;
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
$function$;

-- ── actions: the seat half (seats + lent seats) and the whole answer ──────────────────────────────
create or replace function iam.may_act_seat(p_person uuid, p_type text, p_id uuid, p_action text)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  s jsonb := iam._access_setup_of(p_type);
  a jsonb; v_seats text[]; v_head jsonb; v_admin text[]; r jsonb; v_lend text[];
begin
  if s is null or p_person is null or p_id is null then return false; end if;
  a := s -> 'actions' -> p_action;
  if a is null then return false; end if;
  v_seats := coalesce(iam.seats_of(p_person, p_type, p_id), '{}');
  -- recorders lend the absent holder's actions too, unless the action says "recorders": false
  if coalesce((a ->> 'recorders')::boolean, true) and not (v_seats @> array[s ->> 'subject_seat']) then
    v_head := coalesce(iam._access_setup_facts(s, p_type, p_id), '{}'::jsonb);
    v_admin := coalesce((select array_agg(x) from jsonb_array_elements_text(s -> 'admin_seats') x), '{}');
    for r in select e from jsonb_array_elements(coalesce(s -> 'recorders', '[]'::jsonb)) e loop
      v_lend := case when r ->> 'lend_to' = 'admin_seats' then v_admin
                     else (select array_agg(x) from jsonb_array_elements_text(r -> 'lend_to') x) end;
      if v_seats && coalesce(v_lend, '{}') and not (v_seats @> array[r ->> 'for_seat'])
         and v_head @> coalesce(r -> 'when_fact', '{}'::jsonb) then
        v_seats := v_seats || (r ->> 'for_seat');
      end if;
    end loop;
  end if;
  return v_seats && coalesce((select array_agg(x) from jsonb_array_elements_text(a -> 'seats') x), '{}');
end
$function$;
comment on function iam.may_act_seat(uuid, text, uuid, text) is
  'The seat half of iam.may_act: whether a person holds (or, as a recorder, borrows) a seat the action names. A door asks it first and keeps its own state refusals; iam.may_act adds the stage gates and head facts. PLAN.md §2, §7.';

CREATE OR REPLACE FUNCTION iam.may_act(p_person uuid, p_type text, p_id uuid, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s jsonb := iam._access_setup_of(p_type);
  a jsonb; v_stages text[]; v_head jsonb;
begin
  if s is null or p_person is null or p_id is null then return false; end if;
  a := s -> 'actions' -> p_action;
  if a is null then return false; end if;
  if not iam.may_act_seat(p_person, p_type, p_id, p_action) then return false; end if;
  v_stages := iam._access_setup_stages(s, p_id);
  if a ? 'stages' and not (v_stages && (select array_agg(x) from jsonb_array_elements_text(a -> 'stages') x)) then
    return false;
  end if;
  if a ? 'not_stages' and v_stages && (select array_agg(x) from jsonb_array_elements_text(a -> 'not_stages') x) then
    return false;
  end if;
  if a ? 'when_fact' then
    v_head := coalesce(iam._access_setup_facts(s, p_type, p_id), '{}'::jsonb);
    if not (v_head @> (a -> 'when_fact')) then return false; end if;
  end if;
  return true;
end
$function$;

-- ── reach: the seats that open the record (a seat with "opens_record": false never does) ───────────
create or replace function iam.seats_opening(p_person uuid, p_type text, p_id uuid)
 returns text[]
 language sql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
  select case when iam._access_setup_of(p_type) is null or p_person is null then null
              else coalesce((select array_agg(x order by x) from unnest(iam.seats_of(p_person, p_type, p_id)) x
                              where coalesce((select (e ->> 'opens_record')::boolean
                                                from jsonb_array_elements(iam._access_setup_of(p_type) -> 'seats') e
                                               where e ->> 'key' = x), true)), '{}'::text[]) end;
$function$;
comment on function iam.seats_opening(uuid, text, uuid) is
  'The seats of iam.seats_of that open the record: a seat declared "opens_record": false (the review''s line_manager, which only history reads) never reaches the record by itself. NULL when the type has no setup. PLAN.md §2, §7.';

-- ── the line manager seat: today's history chain, as a seat ─────────────────────────────────────
create or replace function hr.review_seat_line_manager(p_review_id uuid)
 returns uuid[]
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  -- hr_review_history admits: the position manager at depth 1, at depth 2 when the skip-level knob is on,
  -- and the manager of any live review of the same employment. Same people, as a seat.
  select coalesce((select array_agg(distinct u) from (
           select unnest(hr._review_logins_of_employment(mc.manager_employment_id)) u
             from hr.manager_chain(r.employment_id, current_date) mc
            where mc.depth = 1 or (mc.depth = 2 and hr._review_skip_level_on(r.organization_id))
           union all
           select unnest(hr._review_logins_of_employment(r2.manager_employment_id))
             from hr.review r2
            where r2.employment_id = r.employment_id and r2.deleted_at is null and r2.manager_employment_id is not null
         ) z where u is not null), '{}'::uuid[])
    from hr.review r where r.id = p_review_id and r.deleted_at is null;
$function$;
create or replace function hr.review_seat_line_manager_set(p_person uuid)
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select r.id from hr.review r
   where r.deleted_at is null
     and (exists (select 1 from hr.manager_chain(r.employment_id, current_date) mc
                   where mc.manager_employment_id = any(hr.employments_of(p_person))
                     and (mc.depth = 1 or (mc.depth = 2 and hr._review_skip_level_on(r.organization_id))))
          or exists (select 1 from hr.review r2 where r2.employment_id = r.employment_id and r2.deleted_at is null
                       and r2.manager_employment_id = any(hr.employments_of(p_person))));
$function$;

revoke all on function iam.may_act_seat(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function iam.seats_opening(uuid, text, uuid) from public, anon, authenticated;
revoke all on function hr.review_seat_line_manager(uuid) from public, anon, authenticated;
revoke all on function hr.review_seat_line_manager_set(uuid) from public, anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('iam', 'may_act_seat', 'p_person uuid, p_type text, p_id uuid, p_action text', array['uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid],
   'migrations/campaign/accesssetup_f_fallbacks_and_history_keep_todays_answers.sql (lane access-setup)',
   'ACCESS-SETUP: internal to the access-setup primitive; reads declarations and the records they name.',
   'server_only: asked by SECURITY DEFINER doors before an action, with the caller they already resolved; it takes the person as an argument, so no client may call it (a client would name anyone)', false, false),
  ('iam', 'seats_opening', 'p_person uuid, p_type text, p_id uuid', array['uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_f_fallbacks_and_history_keep_todays_answers.sql (lane access-setup)',
   'ACCESS-SETUP: internal to the access-setup primitive; reads declarations and the records they name.',
   'server_only: asked by SECURITY DEFINER doors for reach, with the caller they already resolved; it takes the person as an argument, so no client may call it (a client would name anyone)', false, false),
  ('hr', 'review_seat_line_manager', 'p_review_id uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_f_fallbacks_and_history_keep_todays_answers.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', 'review_seat_line_manager_set', 'p_person uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_f_fallbacks_and_history_keep_todays_answers.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false)
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, signed_in_callers = false, anonymous_callers = false,
      reason = excluded.reason, declared_by = excluded.declared_by;

-- ── the declaration (re-validated by iam.access_setup_check in its update trigger) ─────────────────
update iam.access_setup
   set setup = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(setup,
         '{seats}',
         (select jsonb_agg(case when e ->> 'key' = 'manager'
                                then e || '{"fallback_when_fact": {"manager_named": false}}'::jsonb else e end
                           order by o)
            from jsonb_array_elements(setup -> 'seats') with ordinality t(e, o))
         || '[{"key": "line_manager", "many": true, "opens_record": false,
               "resolver": {"kind": "function", "fn": "hr.review_seat_line_manager(uuid)",
                            "set_fn": "hr.review_seat_line_manager_set(uuid)"}}]'::jsonb),
         '{grid,line_manager}', '{"final_summary": {"level": "viewer"}}'::jsonb),
         '{actions,peer_nominate,recorders}', 'false'::jsonb),
         '{actions,peer_approve,recorders}', 'false'::jsonb),
         '{entity_type}', '"hr_review"'::jsonb),
       declared_by = 'migrations/campaign/accesssetup_f_fallbacks_and_history_keep_todays_answers.sql'
 where entity_type = 'hr_review'
   and not exists (select 1 from jsonb_array_elements(setup -> 'seats') e where e ->> 'key' = 'line_manager');

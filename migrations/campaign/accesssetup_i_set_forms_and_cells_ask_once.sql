-- chair-step: it REPLACES the live bodies of iam._seat_table_now (reads the record's seat changes once instead of twice per seat), iam._cells_for (a statement-memo wrapper; the body moves unchanged to iam._cells_for_now) and the four hr.review_seat_*_set forms that called hr.employments_of(person) once per review row (now once per statement, as an initplan). Every answer is unchanged.
-- lane: access-setup
-- lock: hr,iam
-- based-on: iam._seat_table_now(text, uuid) 5fb66801be7d2899d9d8069aa72c6a9a113c641302aaac69605ad10daafbdc9e
-- based-on: iam._cells_for(uuid, text, uuid, text) de18d2aea200c490469448be46dc6ba4526d29b71d39f99579fe2c99cb70240b
-- based-on: hr.review_seat_employee_set(uuid) 8ebe1cc6eaaef11e540e90fd716a34692726c29e0722ddf667cd1f6a875ee35b
-- based-on: hr.review_seat_manager_set(uuid) 022ad01d6deaa217f57f1e2d3a0a6c14a21074bebf2e3397955fff523b7642ad
-- based-on: hr.review_seat_skip_level_set(uuid) 4325fe8b40dbb4b5fb4550aceec81f80cc5e88ffc7d4f0e0e7bf88b06cfcaf21
-- based-on: hr.review_seat_line_manager_set(uuid) 0a06d152345e77432c534ece80a434627be98692b50c8373ec580de3be94cb7c
--
-- Plan: common-docs/systems/platform/access/projects/access-setup/PLAN.md §4; owner ruling 2 (performance) 2026-10-10.
-- Inverse: migrations/inverse/accesssetup_i_set_forms_and_cells_ask_once_down.sql

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
  v_chg jsonb;
begin
  if s is null or p_id is null then return; end if;
  v_subject_key := s ->> 'subject_seat';
  v_org := iam._access_setup_head_org(p_type, p_id);
  if v_org is null then return; end if;
  -- the record's live seat changes, read once (not twice per seat)
  v_chg := coalesce((select jsonb_agg(jsonb_build_object('s', c.seat_key, 'u', c.user_id, 'c', c.change))
                       from iam.record_seat_change c
                      where c.entity_type = p_type and c.record_id = p_id and c.deleted_at is null
                        and c.change in ('add', 'exclude')), '[]'::jsonb);

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
    v_add := coalesce((select array_agg(distinct (e ->> 'u')::uuid) from jsonb_array_elements(v_chg) e
                        where e ->> 's' = v_key and e ->> 'c' = 'add'), '{}');
    v_excl := coalesce((select array_agg(distinct (e ->> 'u')::uuid) from jsonb_array_elements(v_chg) e
                         where e ->> 's' = v_key and e ->> 'c' = 'exclude'), '{}');
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

CREATE OR REPLACE FUNCTION iam._cells_for_now(p_person uuid, p_type text, p_id uuid, p_part text)
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

CREATE OR REPLACE FUNCTION iam._cells_for(p_person uuid, p_type text, p_id uuid, p_part text)
 RETURNS TABLE(seat text, level permission_level, rows_rule text, from_stage jsonb, names text, reached boolean, borrowed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- iam._cells_for_now's rows, kept in the statement memo per (person, type, id, part, snapshot) while
-- iam.kernel_batch_on(person): every response row's part_level asks the same cells
declare v_key text; v_m text; v_j jsonb;
begin
  if p_person is null or p_id is null or not iam.kernel_batch_on(p_person) then
    return query select * from iam._cells_for_now(p_person, p_type, p_id, p_part);
    return;
  end if;
  v_key := 'iam._cells_for:' || p_person::text || ':' || coalesce(p_type, '') || ':' || p_id::text || ':'
        || coalesce(p_part, '') || ':' || pg_catalog.pg_current_snapshot()::text;
  v_m := platform.memo_k_get(v_key);
  if v_m is null then
    select coalesce(jsonb_agg(jsonb_build_array(c.seat, c.level, c.rows_rule, c.from_stage, c.names, c.reached, c.borrowed)
                              order by c.n), '[]'::jsonb)
      into v_j
      from iam._cells_for_now(p_person, p_type, p_id, p_part)
           with ordinality c(seat, level, rows_rule, from_stage, names, reached, borrowed, n);
    perform platform.memo_k_put(v_key, v_j::text);
  else
    v_j := v_m::jsonb;
  end if;
  return query select e ->> 0, (e ->> 1)::public.permission_level, e ->> 2,
                      case when jsonb_typeof(e -> 3) = 'null' then null else e -> 3 end,
                      e ->> 4, (e ->> 5)::boolean, (e ->> 6)::boolean
                 from jsonb_array_elements(v_j) with ordinality x(e, n) order by x.n;
end
$function$;

revoke all on function iam._cells_for_now(uuid, text, uuid, text) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('iam', '_cells_for_now', 'p_person uuid, p_type text, p_id uuid, p_part text',
   array['uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid],
   'migrations/campaign/accesssetup_i_set_forms_and_cells_ask_once.sql (lane access-setup)',
   'ACCESS-SETUP §4: the un-memoised body of iam._cells_for (the memo wrapper asks it once per statement).',
   'server_only: called only by iam._cells_for; it takes the person as an argument, so no client may call it (a client would name anyone).', false, false)
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, signed_in_callers = false, anonymous_callers = false,
      reason = excluded.reason, declared_by = excluded.declared_by;

-- ── set forms: the person's employments once per statement, not once per review row ─────────────
CREATE OR REPLACE FUNCTION hr.review_seat_employee_set(p_person uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
  select r.id from hr.review r
   where r.deleted_at is null
     and (r.employee_user_id = p_person or r.employment_id = any(array(select unnest(hr.employments_of(p_person)))));
$function$;

CREATE OR REPLACE FUNCTION hr.review_seat_manager_set(p_person uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
  select r.id from hr.review r
   where r.deleted_at is null
     and (r.manager_user_id = p_person or r.manager_employment_id = any(array(select unnest(hr.employments_of(p_person)))));
$function$;

CREATE OR REPLACE FUNCTION hr.review_seat_skip_level_set(p_person uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
  select r.id from hr.review r
   where r.deleted_at is null and r.manager_employment_id is not null
     and hr.manager_as_of(r.manager_employment_id, current_date) = any(array(select unnest(hr.employments_of(p_person))))
     and hr._review_skip_level_on(r.organization_id);
$function$;

CREATE OR REPLACE FUNCTION hr.review_seat_line_manager_set(p_person uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
  with mine as (select hr.employments_of(p_person) e)
  select r.id from hr.review r
   where r.deleted_at is null
     and (exists (select 1 from hr.manager_chain(r.employment_id, current_date) mc
                   where mc.manager_employment_id = any(array(select unnest(e) from mine))
                     and (mc.depth = 1 or (mc.depth = 2 and hr._review_skip_level_on(r.organization_id))))
          or exists (select 1 from hr.review r2 where r2.employment_id = r.employment_id and r2.deleted_at is null
                       and r2.manager_employment_id = any(array(select unnest(e) from mine))));
$function$;

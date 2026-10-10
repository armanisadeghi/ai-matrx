-- chair-step: it ADDS the functions of the access-setup primitive: iam.seats_of / part_level / may_act / parts_for / seat_holders / records_where_seated / redact_by_parts / access_setup_check and their internal helpers (no client EXECUTE — schema iam is closed and the DDL guards take it back), the validating trigger on iam.access_setup, and ONE client door iam.record_seat_set declared in platform.client_callable_door before its GRANT. No existing function, table, policy, kernel body or data row is changed; nothing calls these functions yet, so no person's answer changes anywhere.
-- lane: access-setup
-- lock: iam
--
-- Plan: common-docs/systems/platform/access/projects/access-setup/PLAN.md §2, §3, §4 (step 1 of §8).
-- Inverse: migrations/inverse/accesssetup_b_the_seat_and_part_answers_down.sql
--
-- A record type may carry an ACCESS SETUP: its parts, the seats of people involved, a grid of what each
-- seat may see and do on each part from which stage, the actions each seat may take, and which other
-- tokens are its members. Seat holders resolve LIVE from data the record already names; one table holds
-- only the per-record changes people make in the panel. These functions are the one place every door and
-- (later, §5a) the kernel arm will ask.
--
-- Grammar additions over the plan's §2 sketch, each forced by the live legacy bodies (the oracle):
--   * "stages": the declared stage vocabulary; every from_stage / action stage must be in it, and
--     iam.access_setup_check runs stages_fn over every live record and refuses a stage outside it.
--   * a cell's "from_stage" may be a string or an array (reached when ANY listed stage is reached) —
--     today's employee overall rating opens on shared OR acknowledged.
--   * "columns" values may be a part key or {"part", "min_level", "else_keep_keys"} — today's reopen
--     history goes whole to HR and the manager and as {at, reason} to everyone else.
--   * actions carry "stages" (any reached), "not_stages" (none reached) and "when_fact" (head facts
--     contain it); recorders read "when_fact" against the head's own facts (rows_fn(head, id)).
--   * "subject_seat" is exempt from "required needs a fallback": the record itself always names it.

-- ── 3. internal helpers ──────────────────────────────────────────────────────────────────────────
-- the setup row (null when the type has none)
create or replace function iam._access_setup_of(p_type text)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
  select s.setup from iam.access_setup s where s.entity_type = p_type;
$function$;

-- the head record's organization, read from the token's own table
create or replace function iam._access_setup_head_org(p_type text, p_id uuid)
 returns uuid
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare v_rel regclass; v_org uuid;
begin
  select et.table_ref into v_rel from platform.entity_types et where et.token = p_type;
  if v_rel is null or p_id is null then return null; end if;
  execute format('select organization_id from %s where id = $1', v_rel) into v_org using p_id;
  return v_org;
end
$function$;

-- call a declared "schema.fn(argtypes)" with one uuid (resolvers, stages_fn)
create or replace function iam._access_setup_call_uuid(p_fn text, p_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare v_proc regprocedure := to_regprocedure(p_fn); v_out jsonb;
begin
  if v_proc is null then raise exception 'access setup: function % does not exist', p_fn using errcode = '42883'; end if;
  execute format('select to_jsonb(%s($1))', v_proc::regproc) into v_out using p_id;
  return v_out;
end
$function$;

-- the declared rows_fn: (token, row id) -> facts
create or replace function iam._access_setup_facts(p_setup jsonb, p_token text, p_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare v_proc regprocedure; v_out jsonb;
begin
  if p_setup is null or p_setup ->> 'rows_fn' is null or p_id is null then return null; end if;
  v_proc := to_regprocedure(p_setup ->> 'rows_fn');
  if v_proc is null then raise exception 'access setup: rows_fn % does not exist', p_setup ->> 'rows_fn' using errcode = '42883'; end if;
  execute format('select %s($1, $2)', v_proc::regproc) into v_out using p_token, p_id;
  return v_out;
end
$function$;

-- the reached stages of one head record
create or replace function iam._access_setup_stages(p_setup jsonb, p_id uuid)
 returns text[]
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare v jsonb;
begin
  if p_setup is null or p_setup ->> 'stages_fn' is null then return '{}'::text[]; end if;
  v := iam._access_setup_call_uuid(p_setup ->> 'stages_fn', p_id);
  return coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v, '[]'::jsonb)) x), '{}'::text[]);
end
$function$;

-- is a cell's from_stage reached? (absent = always; a string; or an array meaning any of)
create or replace function iam._access_setup_stage_reached(p_from jsonb, p_stages text[])
 returns boolean
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  select case
    when p_from is null or jsonb_typeof(p_from) = 'null' then true
    when jsonb_typeof(p_from) = 'string' then (p_from #>> '{}') = any(coalesce(p_stages, '{}'::text[]))
    when jsonb_typeof(p_from) = 'array' then exists (select 1 from jsonb_array_elements_text(p_from) s
                                                      where s = any(coalesce(p_stages, '{}'::text[])))
    else false end;
$function$;

-- every holder of every seat on one record: resolvers ∪ adds − excludes, the subject rule, the fallback.
-- THE one body behind seats_of, seat_holders and the panel.
create or replace function iam._seat_table(p_type text, p_id uuid)
 returns table(seat text, user_id uuid, source text, removable boolean)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
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
$function$;

-- ── 4. the public answers ────────────────────────────────────────────────────────────────────────
create or replace function iam.seats_of(p_person uuid, p_type text, p_id uuid)
 returns text[]
 language sql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
  select case when iam._access_setup_of(p_type) is null or p_person is null then null
              else coalesce((select array_agg(distinct t.seat order by t.seat)
                               from iam._seat_table(p_type, p_id) t where t.user_id = p_person), '{}'::text[]) end;
$function$;
comment on function iam.seats_of(uuid, text, uuid) is
  'Every seat a person holds on one record of a type with an access setup: resolvers ∪ adds − excludes, the subject rule, the required-seat fallback. NULL when the type has no setup. PLAN.md §4.';

-- the cells that apply to a person on one part, with whether each is reached now (internal; one body for
-- part_level and parts_for). blind_wins and recorders are applied here.
create or replace function iam._cells_for(p_person uuid, p_type text, p_id uuid, p_part text)
 returns table(seat text, level public.permission_level, rows_rule text, from_stage jsonb, names text,
               reached boolean, borrowed boolean)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
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
$function$;

create or replace function iam.part_level(p_person uuid, p_type text, p_id uuid, p_part text,
                                          p_row_token text default null, p_row_id uuid default null)
 returns public.permission_level
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
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
$function$;
comment on function iam.part_level(uuid, text, uuid, text, text, uuid) is
  'The level a person holds on one part of one record (optionally one member row of it): the union of their seats'' grid cells reached at the record''s current stages, blind_wins applied, recorders lent, plus authorship (an author always reads their own live row). NULL = none. PLAN.md §2, §4.';

create or replace function iam.may_act(p_person uuid, p_type text, p_id uuid, p_action text)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
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
$function$;
comment on function iam.may_act(uuid, text, uuid, text) is
  'Whether a person may take one declared action on one record: a seat in the action''s seats (recorders lent), the stage gates and the head-fact condition. PLAN.md §2, §4.';

create or replace function iam.parts_for(p_person uuid, p_type text, p_id uuid)
 returns table(part text, level public.permission_level, rows_rule text, opens_at_stage jsonb, names text)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare s jsonb := iam._access_setup_of(p_type); v_part text;
begin
  if s is null or p_person is null then return; end if;
  for v_part in select e ->> 'key' from jsonb_array_elements(s -> 'parts') e loop
    part := v_part;
    level := iam.part_level(p_person, p_type, p_id, v_part);
    select c.rows_rule, c.names into rows_rule, names
      from iam._cells_for(p_person, p_type, p_id, v_part) c
     where c.reached order by c.level desc limit 1;
    -- what is still to open: the earliest unreached cell's stage
    select c.from_stage into opens_at_stage
      from iam._cells_for(p_person, p_type, p_id, v_part) c
     where not c.reached order by c.level desc limit 1;
    if level is not null or opens_at_stage is not null then return next; end if;
    rows_rule := null; names := null; opens_at_stage := null;
  end loop;
end
$function$;
comment on function iam.parts_for(uuid, text, uuid) is
  'Per part: the person''s level now, which rows it covers, how names come back, and the stage at which a not-yet-reached cell opens. PLAN.md §4 (the panel''s "Self-evaluation · after they submit").';

create or replace function iam.seat_holders(p_type text, p_id uuid)
 returns table(seat text, user_id uuid, source text, removable boolean)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare v_caller uuid := auth.uid();
begin
  -- no probes: a signed-in caller who holds no seat on the record gets nothing
  if v_caller is not null and cardinality(coalesce(iam.seats_of(v_caller, p_type, p_id), '{}')) = 0 then
    return;
  end if;
  return query select t.seat, t.user_id, t.source, t.removable from iam._seat_table(p_type, p_id) t;
end
$function$;
comment on function iam.seat_holders(text, uuid) is
  'Who fills each seat of one record and why (resolver | grant | added | fallback) and whether removing them is allowed. Answers a signed-in caller only when they hold a seat on that record. PLAN.md §4.';

create or replace function iam.records_where_seated(p_person uuid, p_type text, p_org_filter uuid default null)
 returns setof uuid
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  s jsonb := iam._access_setup_of(p_type);
  v_seat jsonb; v_proc regprocedure; v_rel regclass; v_cand uuid[] := '{}'; v_more uuid[];
begin
  if s is null or p_person is null then return; end if;
  select et.table_ref into v_rel from platform.entity_types et where et.token = p_type;
  -- candidates: each resolver's own set form
  for v_seat in select e from jsonb_array_elements(s -> 'seats') e loop
    if v_seat #>> '{resolver,set_fn}' is not null then
      v_proc := to_regprocedure(v_seat #>> '{resolver,set_fn}');
      if v_proc is null then
        raise exception 'access setup: set_fn % does not exist', v_seat #>> '{resolver,set_fn}' using errcode = '42883';
      end if;
      execute format('select coalesce(array_agg(x), ''{}'') from %s($1) x', v_proc::regproc) into v_more using p_person;
      v_cand := v_cand || v_more;
    end if;
  end loop;
  -- grants and adds
  v_cand := v_cand || coalesce((select array_agg(p.resource_id) from iam.permissions p
                                 where p.resource_type = p_type and p.granted_to_user_id = p_person
                                   and coalesce(p.status, 'active') = 'active'), '{}')
                   || coalesce((select array_agg(c.record_id) from iam.record_seat_change c
                                 where c.entity_type = p_type and c.user_id = p_person and c.change = 'add'
                                   and c.deleted_at is null), '{}');
  -- fallback seats: records in organizations the person owns or administers
  if exists (select 1 from jsonb_array_elements(s -> 'seats') e where e ->> 'fallback' is not null) and v_rel is not null then
    execute format('select coalesce(array_agg(t.id), ''{}'') from %s t where t.organization_id in (
                      select m.organization_id from iam.memberships m where m.user_id = $1
                         and m.container_type = ''organization'' and m.role in (''owner'',''admin'')
                         and m.status = ''active'' and m.deleted_at is null)', v_rel)
      into v_more using p_person;
    v_cand := v_cand || v_more;
  end if;
  -- the truth is seats_of; the candidates only bound the work
  return query
    select distinct x from unnest(v_cand) x
     where cardinality(coalesce(iam.seats_of(p_person, p_type, x), '{}')) > 0
       and (p_org_filter is null or iam._access_setup_head_org(p_type, x) = p_org_filter);
end
$function$;
comment on function iam.records_where_seated(uuid, text, uuid) is
  'The set form for lists: every record of a type where the person holds at least one seat (resolver set forms ∪ grants ∪ adds ∪ fallback organizations, confirmed by iam.seats_of), optionally inside one organization. PLAN.md §4.';

create or replace function iam.redact_by_parts(p_type text, p_id uuid, p_person uuid, p_json jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  s jsonb := iam._access_setup_of(p_type);
  k text; spec jsonb; v_part text; v_min public.permission_level; v_lvl public.permission_level;
  v_col text; v_sub text; v_out jsonb := p_json; v_keep jsonb;
begin
  if s is null or p_json is null or jsonb_typeof(p_json) <> 'object' then return p_json; end if;
  for k, spec in select * from jsonb_each(coalesce(s -> 'columns', '{}'::jsonb)) loop
    v_part := case when jsonb_typeof(spec) = 'string' then spec #>> '{}' else spec ->> 'part' end;
    v_min := coalesce(case when jsonb_typeof(spec) = 'object' then spec ->> 'min_level' end, 'viewer')::public.permission_level;
    v_col := split_part(k, '.', 1);
    v_sub := nullif(split_part(k, '.', 2), '');
    continue when not (v_out ? v_col);
    v_lvl := iam.part_level(p_person, p_type, p_id, v_part);
    continue when v_lvl is not null and v_lvl >= v_min;
    v_keep := case when jsonb_typeof(spec) = 'object' then spec -> 'else_keep_keys' end;
    if v_keep is not null and jsonb_typeof(v_out -> v_col) = 'array' then
      v_out := jsonb_set(v_out, array[v_col], coalesce((
        select jsonb_agg((select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                            from jsonb_each(el) e where e.key in (select jsonb_array_elements_text(v_keep))))
          from jsonb_array_elements(v_out -> v_col) el), '[]'::jsonb));
    elsif v_sub is not null and jsonb_typeof(v_out -> v_col) = 'array' then
      v_out := jsonb_set(v_out, array[v_col], coalesce((
        select jsonb_agg(el - v_sub) from jsonb_array_elements(v_out -> v_col) el), '[]'::jsonb));
    elsif v_sub is not null and jsonb_typeof(v_out -> v_col) = 'object' then
      v_out := jsonb_set(v_out, array[v_col], (v_out -> v_col) - v_sub);
    else
      v_out := jsonb_set(v_out, array[v_col], 'null'::jsonb);
    end if;
  end loop;
  return v_out;
end
$function$;
comment on function iam.redact_by_parts(text, uuid, uuid, jsonb) is
  'The one helper a door builds its record JSON through: each head column the setup maps to a part comes back only to a person whose level on that part reaches the column''s min_level (default viewer); otherwise null, or the array''s else_keep_keys. Unlisted columns pass. PLAN.md §2 (Columns).';

-- ── 5. the check ─────────────────────────────────────────────────────────────────────────────────
create or replace function iam._access_setup_problems(p_type text, s jsonb)
 returns text[]
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  p text[] := '{}';
  v_seats text[]; v_parts text[]; v_stages text[]; v_admin text[]; v_rel regclass; v_tok text;
  v_seat jsonb; v_key text; c record; m jsonb; a record; r jsonb; x text; v_live uuid; v_got text[];
  v_levels text[] := array['viewer','commenter','edit_content','editor','admin'];
begin
  if s is null then return array['no_setup']; end if;
  if not exists (select 1 from platform.entity_types et where et.token = p_type and et.is_active) then
    p := p || ('head_token_unregistered: ' || p_type);
  end if;
  select et.table_ref into v_rel from platform.entity_types et where et.token = p_type;
  v_seats := coalesce((select array_agg(e ->> 'key') from jsonb_array_elements(s -> 'seats') e), '{}');
  v_parts := coalesce((select array_agg(e ->> 'key') from jsonb_array_elements(s -> 'parts') e), '{}');
  v_stages := coalesce((select array_agg(e) from jsonb_array_elements_text(s -> 'stages') e), '{}');
  v_admin := coalesce((select array_agg(e) from jsonb_array_elements_text(s -> 'admin_seats') e), '{}');

  if cardinality(v_seats) <> (select count(distinct x) from unnest(v_seats) x) then p := p || 'seat_declared_twice'::text; end if;
  if cardinality(v_parts) <> (select count(distinct x) from unnest(v_parts) x) then p := p || 'part_declared_twice'::text; end if;
  if cardinality(v_stages) = 0 then p := p || 'no_stage_vocabulary'::text; end if;
  if cardinality(v_admin) = 0 then p := p || 'no_admin_seats'::text; end if;
  foreach x in array v_admin loop
    if not x = any(v_seats) then p := p || ('admin_seat_undeclared: ' || x); end if;
  end loop;
  if s ->> 'subject_seat' is null or not (s ->> 'subject_seat') = any(v_seats) then
    p := p || 'subject_seat_undeclared'::text;
  end if;
  if s ->> 'share_seat' is not null and not (s ->> 'share_seat') = any(v_seats) then
    p := p || ('share_seat_undeclared: ' || (s ->> 'share_seat'));
  end if;
  if s ->> 'attached_part' is not null and not (s ->> 'attached_part') = any(v_parts) then
    p := p || ('attached_part_undeclared: ' || (s ->> 'attached_part'));
  end if;
  if to_regprocedure(coalesce(s ->> 'stages_fn', '')) is null then p := p || ('stages_fn_missing: ' || coalesce(s ->> 'stages_fn', '(none)')); end if;
  if to_regprocedure(coalesce(s ->> 'rows_fn', '')) is null then p := p || ('rows_fn_missing: ' || coalesce(s ->> 'rows_fn', '(none)')); end if;

  -- seats
  for v_seat in select e from jsonb_array_elements(s -> 'seats') e loop
    v_key := v_seat ->> 'key';
    if v_seat #>> '{resolver,kind}' = 'function' then
      if to_regprocedure(coalesce(v_seat #>> '{resolver,fn}', '')) is null then
        p := p || ('resolver_missing: ' || v_key || ' -> ' || coalesce(v_seat #>> '{resolver,fn}', '(none)'));
      elsif (select pr.prorettype from pg_proc pr where pr.oid = to_regprocedure(v_seat #>> '{resolver,fn}')) <> 'uuid[]'::regtype then
        p := p || ('resolver_not_uuid_array: ' || v_key);
      end if;
      if v_seat #>> '{resolver,set_fn}' is null or to_regprocedure(v_seat #>> '{resolver,set_fn}') is null then
        p := p || ('resolver_set_form_missing: ' || v_key);
      end if;
    elsif coalesce(v_seat #>> '{resolver,kind}', '') <> 'grants' then
      p := p || ('resolver_kind_unknown: ' || v_key);
    end if;
    if coalesce((v_seat ->> 'required')::boolean, false) and v_key is distinct from s ->> 'subject_seat'
       and coalesce(v_seat ->> 'fallback', '') <> 'org_owners_admins' then
      p := p || ('required_seat_without_fallback: ' || v_key);
    end if;
    for x in select jsonb_array_elements_text(coalesce(v_seat -> 'assignable_by', '[]'::jsonb)) loop
      if not x = any(v_seats) then p := p || ('assignable_by_undeclared: ' || v_key || ' <- ' || x); end if;
    end loop;
  end loop;

  -- grid
  for c in select g.key seat, e.key part, e.value cell
             from jsonb_each(coalesce(s -> 'grid', '{}'::jsonb)) g, jsonb_each(g.value) e loop
    if not c.seat = any(v_seats) then p := p || ('grid_seat_undeclared: ' || c.seat); end if;
    if not c.part = any(v_parts) then p := p || ('grid_part_undeclared: ' || c.seat || '.' || c.part); end if;
    if not coalesce(c.cell ->> 'level', '') = any(v_levels) then p := p || ('grid_level_invalid: ' || c.seat || '.' || c.part); end if;
    if coalesce(c.cell ->> 'rows', 'all') not in ('all','own','submitted','own_or_submitted') then
      p := p || ('grid_rows_invalid: ' || c.seat || '.' || c.part);
    end if;
    if not (coalesce(c.cell ->> 'names', 'shown') in ('shown','hidden') or c.cell ->> 'names' like 'knob:%/%') then
      p := p || ('grid_names_invalid: ' || c.seat || '.' || c.part);
    end if;
    for x in select jsonb_array_elements_text(case when jsonb_typeof(c.cell -> 'from_stage') = 'array' then c.cell -> 'from_stage'
                                                   when c.cell -> 'from_stage' is null or jsonb_typeof(c.cell -> 'from_stage') = 'null' then '[]'::jsonb
                                                   else jsonb_build_array(c.cell -> 'from_stage') end) loop
      if x is not null and not x = any(v_stages) then
        p := p || ('from_stage_undeclared: ' || c.seat || '.' || c.part || ' -> ' || x);
      end if;
    end loop;
  end loop;

  -- the subject seat reads and writes its own part
  if not exists (select 1 from jsonb_each(coalesce(s -> 'grid' -> (s ->> 'subject_seat'), '{}'::jsonb)) e
                  where e.value ->> 'level' in ('editor','admin')) then
    p := p || 'subject_seat_cannot_write_its_own_part'::text;
  end if;
  -- a writable part some admin seat can read from the stage it is written
  for c in select g.key seat, e.key part, e.value cell
             from jsonb_each(coalesce(s -> 'grid', '{}'::jsonb)) g, jsonb_each(g.value) e
            where e.value ->> 'level' in ('editor','admin') loop
    if not exists (select 1 from unnest(v_admin) ad
                    where s -> 'grid' -> ad -> c.part is not null
                      and ((s -> 'grid' -> ad -> c.part -> 'from_stage') is null
                           or (s -> 'grid' -> ad -> c.part -> 'from_stage') = (c.cell -> 'from_stage'))) then
      p := p || ('writable_part_unreadable_at_its_write_stage: ' || c.part || ' (written by ' || c.seat || ')');
    end if;
  end loop;

  -- columns
  for c in select e.key col, e.value spec from jsonb_each(coalesce(s -> 'columns', '{}'::jsonb)) e loop
    x := case when jsonb_typeof(c.spec) = 'string' then c.spec #>> '{}' else c.spec ->> 'part' end;
    if x is null or not x = any(v_parts) then p := p || ('column_part_undeclared: ' || c.col); end if;
    if v_rel is not null and not exists (select 1 from pg_attribute pa where pa.attrelid = v_rel
                                           and pa.attname = split_part(c.col, '.', 1) and not pa.attisdropped) then
      p := p || ('column_missing_on_head: ' || c.col);
    end if;
  end loop;

  -- members: registered, head_column present, a part, never listed twice (here or in another setup)
  for m in select e from jsonb_array_elements(coalesce(s -> 'members', '[]'::jsonb)) e loop
    v_tok := m ->> 'token';
    if not exists (select 1 from platform.entity_types et where et.token = v_tok and et.is_active) then
      p := p || ('member_token_unregistered: ' || coalesce(v_tok, '(none)'));
    end if;
    if m ->> 'head_column' is null then
      p := p || ('member_without_head_column: ' || coalesce(v_tok, '(none)'));
    elsif not exists (select 1 from platform.entity_types et join pg_attribute pa on pa.attrelid = et.table_ref
                       where et.token = v_tok and pa.attname = m ->> 'head_column' and not pa.attisdropped) then
      p := p || ('member_head_column_missing: ' || v_tok || '.' || (m ->> 'head_column'));
    end if;
    if m ->> 'part' is null and m -> 'part_from' is null then p := p || ('member_without_part: ' || v_tok); end if;
    if m ->> 'part' is not null and not (m ->> 'part') = any(v_parts) then p := p || ('member_part_undeclared: ' || v_tok); end if;
    if exists (select 1 from jsonb_each_text(coalesce(m -> 'part_from' -> 'map', '{}'::jsonb)) e where not e.value = any(v_parts)) then
      p := p || ('member_part_map_undeclared: ' || v_tok);
    end if;
  end loop;
  for x in
    select t from (select s0.entity_type t from iam.access_setup s0 where s0.entity_type <> p_type
                   union all
                   select e ->> 'token' from iam.access_setup s0, jsonb_array_elements(coalesce(s0.setup -> 'members', '[]'::jsonb)) e
                    where s0.entity_type <> p_type) o
     where t = p_type or t in (select e ->> 'token' from jsonb_array_elements(coalesce(s -> 'members', '[]'::jsonb)) e)
  loop
    p := p || ('token_listed_twice: ' || x);
  end loop;
  if (select count(*) from jsonb_array_elements(coalesce(s -> 'members', '[]'::jsonb)) e)
     <> (select count(distinct e ->> 'token') from jsonb_array_elements(coalesce(s -> 'members', '[]'::jsonb)) e)
     or exists (select 1 from jsonb_array_elements(coalesce(s -> 'members', '[]'::jsonb)) e where e ->> 'token' = p_type) then
    p := p || 'token_listed_twice: within this setup'::text;
  end if;

  -- actions
  for a in select e.key act, e.value def from jsonb_each(coalesce(s -> 'actions', '{}'::jsonb)) e loop
    if jsonb_array_length(coalesce(a.def -> 'seats', '[]'::jsonb)) = 0 then p := p || ('action_without_seats: ' || a.act); end if;
    for x in select jsonb_array_elements_text(coalesce(a.def -> 'seats', '[]'::jsonb)) loop
      if not x = any(v_seats) then p := p || ('action_seat_undeclared: ' || a.act || ' -> ' || x); end if;
    end loop;
    for x in select jsonb_array_elements_text(coalesce(a.def -> 'stages', '[]'::jsonb) || coalesce(a.def -> 'not_stages', '[]'::jsonb)) loop
      if not x = any(v_stages) then p := p || ('action_stage_undeclared: ' || a.act || ' -> ' || x); end if;
    end loop;
  end loop;

  -- recorders and blind_wins
  for r in select e from jsonb_array_elements(coalesce(s -> 'recorders', '[]'::jsonb)) e loop
    if not coalesce(r ->> 'for_seat', '') = any(v_seats) then p := p || ('recorder_seat_undeclared: ' || coalesce(r ->> 'for_seat', '(none)')); end if;
    if r ->> 'lend_to' is distinct from 'admin_seats' and jsonb_typeof(r -> 'lend_to') <> 'array' then
      p := p || ('recorder_lend_to_invalid: ' || coalesce(r ->> 'for_seat', '(none)'));
    end if;
  end loop;
  for c in select e.key part, e.value seats from jsonb_each(coalesce(s -> 'blind_wins', '{}'::jsonb)) e loop
    if not c.part = any(v_parts) then p := p || ('blind_wins_part_undeclared: ' || c.part); end if;
    for x in select jsonb_array_elements_text(c.seats) loop
      if not x = any(v_seats) then p := p || ('blind_wins_seat_undeclared: ' || c.part || ' -> ' || x); end if;
    end loop;
  end loop;

  -- stages_fn answers only declared stages on every live record of the head
  if cardinality(p) = 0 and v_rel is not null then
    for v_live in execute format('select id from %s', v_rel) loop
      v_got := iam._access_setup_stages(s, v_live);
      for x in select unnest(v_got) loop
        if not x = any(v_stages) then p := p || ('stage_outside_vocabulary: ' || x || ' on ' || v_live); end if;
      end loop;
    end loop;
  end if;
  return p;
end
$function$;

create or replace function iam.access_setup_check(p_type text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare v_p text[] := iam._access_setup_problems(p_type, iam._access_setup_of(p_type));
begin
  return jsonb_build_object('ok', cardinality(v_p) = 0, 'entity_type', p_type, 'problems', to_jsonb(v_p));
end
$function$;
comment on function iam.access_setup_check(text) is
  'Validates one access setup against the grammar (PLAN.md §2 "The check refuses"): {ok, entity_type, problems[]}. Runs on every write of iam.access_setup and is what the Confidential guard (step 5) will require.';

create or replace function iam._access_setup_validate()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare v_p text[] := iam._access_setup_problems(new.entity_type, new.setup);
begin
  if cardinality(v_p) > 0 then
    raise exception 'access setup for % refused: %', new.entity_type, array_to_string(v_p, '; ')
      using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end
$function$;
create trigger access_setup_validate before insert or update on iam.access_setup
  for each row execute function iam._access_setup_validate();

-- ── 6. the one write door ────────────────────────────────────────────────────────────────────────
create or replace function iam.record_seat_set(p_type text, p_id uuid, p_seat text, p_user uuid,
                                               p_change text, p_reason text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
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
$function$;
comment on function iam.record_seat_set(text, uuid, text, uuid, text, text) is
  'The one write door for per-record seat changes (PLAN.md §3): a holder of the seat''s assignable_by or an admin seat adds or excludes one organization member on one seat; excluding the last holder of a required seat is refused. The previous active change for the same person and seat is archived.';

-- ── 7. privileges: everything internal except the one door ───────────────────────────────────────
-- iam.record_seat_change is doors only, like hr.review: written through iam.record_seat_set, read through
-- iam.seat_holders. The provisioner's entity variant granted authenticated SELECT; taken back here (in
-- accesssetup_a the REVOKE would run its whole-schema door pass under the iam.users FK lock).
revoke all on iam.record_seat_change from public, anon, authenticated;
-- schema iam is closed: the DDL guards (close_new_functions_to_anon, enforce_definer_client_grants,
-- platform_reopen_declared_doors) take every client EXECUTE back from a new function with no
-- platform.client_callable_door row, so the internal functions need no REVOKE here (an explicit one
-- re-runs the whole-schema reopen pass per statement). The one door is declared, then granted.

-- every SECURITY DEFINER function here declares its access decision in data (provision_shape_guard):
-- all but record_seat_set are server-only
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('iam', '_access_setup_of', 'p_type text', array['text'::regtype::oid],
   'migrations/campaign/accesssetup_b_the_seat_and_part_answers.sql (lane access-setup)',
   'ACCESS-SETUP: internal to the access-setup primitive; reads declarations and the records they name.',
   'server_only: reads one iam.access_setup row for the seat and part functions; it takes the person as an argument, so no client may call it (a client would name anyone)', false, false),
  ('iam', '_access_setup_head_org', 'p_type text, p_id uuid', array['text'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_b_the_seat_and_part_answers.sql (lane access-setup)',
   'ACCESS-SETUP: internal to the access-setup primitive; reads declarations and the records they name.',
   'server_only: reads the organization of one head record for the seat functions and the door; it takes the person as an argument, so no client may call it (a client would name anyone)', false, false),
  ('iam', '_access_setup_call_uuid', 'p_fn text, p_id uuid', array['text'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_b_the_seat_and_part_answers.sql (lane access-setup)',
   'ACCESS-SETUP: internal to the access-setup primitive; reads declarations and the records they name.',
   'server_only: calls a resolver or stages_fn named in a migration-written setup row; it takes the person as an argument, so no client may call it (a client would name anyone)', false, false),
  ('iam', '_access_setup_facts', 'p_setup jsonb, p_token text, p_id uuid', array['jsonb'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_b_the_seat_and_part_answers.sql (lane access-setup)',
   'ACCESS-SETUP: internal to the access-setup primitive; reads declarations and the records they name.',
   'server_only: calls the setup rows rows_fn for part_level, may_act and the recorders; it takes the person as an argument, so no client may call it (a client would name anyone)', false, false),
  ('iam', '_access_setup_stages', 'p_setup jsonb, p_id uuid', array['jsonb'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_b_the_seat_and_part_answers.sql (lane access-setup)',
   'ACCESS-SETUP: internal to the access-setup primitive; reads declarations and the records they name.',
   'server_only: calls the setup rows stages_fn for the grid and action stage gates; it takes the person as an argument, so no client may call it (a client would name anyone)', false, false),
  ('iam', '_seat_table', 'p_type text, p_id uuid', array['text'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_b_the_seat_and_part_answers.sql (lane access-setup)',
   'ACCESS-SETUP: internal to the access-setup primitive; reads declarations and the records they name.',
   'server_only: the one body behind seats_of, seat_holders and record_seat_set; it takes the person as an argument, so no client may call it (a client would name anyone)', false, false),
  ('iam', '_cells_for', 'p_person uuid, p_type text, p_id uuid, p_part text', array['uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid],
   'migrations/campaign/accesssetup_b_the_seat_and_part_answers.sql (lane access-setup)',
   'ACCESS-SETUP: internal to the access-setup primitive; reads declarations and the records they name.',
   'server_only: the grid cells behind part_level and parts_for; it takes the person as an argument, so no client may call it (a client would name anyone)', false, false),
  ('iam', '_access_setup_problems', 'p_type text, s jsonb', array['text'::regtype::oid, 'jsonb'::regtype::oid],
   'migrations/campaign/accesssetup_b_the_seat_and_part_answers.sql (lane access-setup)',
   'ACCESS-SETUP: internal to the access-setup primitive; reads declarations and the records they name.',
   'server_only: the validation body behind access_setup_check and the iam.access_setup write trigger; it takes the person as an argument, so no client may call it (a client would name anyone)', false, false),
  ('iam', 'seats_of', 'p_person uuid, p_type text, p_id uuid', array['uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_b_the_seat_and_part_answers.sql (lane access-setup)',
   'ACCESS-SETUP: internal to the access-setup primitive; reads declarations and the records they name.',
   'server_only: asked by SECURITY DEFINER doors (hr review doors from step 4) and, from step 5, the kernel arm, always with the caller they already resolved; it takes the person as an argument, so no client may call it (a client would name anyone)', false, false),
  ('iam', 'part_level', 'p_person uuid, p_type text, p_id uuid, p_part text, p_row_token text, p_row_id uuid', array['uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_b_the_seat_and_part_answers.sql (lane access-setup)',
   'ACCESS-SETUP: internal to the access-setup primitive; reads declarations and the records they name.',
   'server_only: asked by SECURITY DEFINER doors and, from step 5, the kernel arm, with the caller they already resolved; it takes the person as an argument, so no client may call it (a client would name anyone)', false, false),
  ('iam', 'may_act', 'p_person uuid, p_type text, p_id uuid, p_action text', array['uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid],
   'migrations/campaign/accesssetup_b_the_seat_and_part_answers.sql (lane access-setup)',
   'ACCESS-SETUP: internal to the access-setup primitive; reads declarations and the records they name.',
   'server_only: asked by SECURITY DEFINER doors before an action, with the caller they already resolved; it takes the person as an argument, so no client may call it (a client would name anyone)', false, false),
  ('iam', 'parts_for', 'p_person uuid, p_type text, p_id uuid', array['uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_b_the_seat_and_part_answers.sql (lane access-setup)',
   'ACCESS-SETUP: internal to the access-setup primitive; reads declarations and the records they name.',
   'server_only: asked by the access-setup panel door (step 6) for the caller it already resolved; it takes the person as an argument, so no client may call it (a client would name anyone)', false, false),
  ('iam', 'seat_holders', 'p_type text, p_id uuid', array['text'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_b_the_seat_and_part_answers.sql (lane access-setup)',
   'ACCESS-SETUP: internal to the access-setup primitive; reads declarations and the records they name.',
   'server_only: asked by the access-setup panel door (step 6); answers a signed-in caller only when they hold a seat; it takes the person as an argument, so no client may call it (a client would name anyone)', false, false),
  ('iam', 'records_where_seated', 'p_person uuid, p_type text, p_org_filter uuid', array['uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_b_the_seat_and_part_answers.sql (lane access-setup)',
   'ACCESS-SETUP: internal to the access-setup primitive; reads declarations and the records they name.',
   'server_only: the set form list doors and, from step 5, accessible_entity_ids ask with the caller they already resolved; it takes the person as an argument, so no client may call it (a client would name anyone)', false, false),
  ('iam', 'redact_by_parts', 'p_type text, p_id uuid, p_person uuid, p_json jsonb', array['text'::regtype::oid, 'uuid'::regtype::oid, 'uuid'::regtype::oid, 'jsonb'::regtype::oid],
   'migrations/campaign/accesssetup_b_the_seat_and_part_answers.sql (lane access-setup)',
   'ACCESS-SETUP: internal to the access-setup primitive; reads declarations and the records they name.',
   'server_only: the JSON builder SECURITY DEFINER doors pass their record through for the caller they already resolved; it takes the person as an argument, so no client may call it (a client would name anyone)', false, false),
  ('iam', 'access_setup_check', 'p_type text', array['text'::regtype::oid],
   'migrations/campaign/accesssetup_b_the_seat_and_part_answers.sql (lane access-setup)',
   'ACCESS-SETUP: internal to the access-setup primitive; reads declarations and the records they name.',
   'server_only: run by migrations, CI and (step 5) the Confidential guard to validate a declaration; it takes the person as an argument, so no client may call it (a client would name anyone)', false, false)
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, signed_in_callers = false, anonymous_callers = false,
      reason = excluded.reason, declared_by = excluded.declared_by;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   anonymous_callers, signed_in_callers, argument_rules)
values
  ('iam', 'record_seat_set', 'p_type text, p_id uuid, p_seat text, p_user uuid, p_change text, p_reason text',
   array['text'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid, 'text'::regtype::oid],
   'migrations/campaign/accesssetup_a_records_declare_their_parts_and_seats.sql (lane access-setup)',
   'ACCESS-SETUP §3: SECURITY DEFINER. Answers no_caller without auth.uid(); refuses a type with no access setup, an undeclared seat, the subject seat, a record the caller holds no seat on (not_reachable — the same answer as a missing record), a caller whose seats are not in the seat''s assignable_by or the admin seats, a person who is not an active member of the record''s own organization, and excluding the last holder of a required seat. Writes one iam.record_seat_change row under the record''s own organization and returns the record''s seat holders, which the caller may already read as a seat holder.',
   false, true,
   jsonb_build_object('version', 1, 'arguments', jsonb_build_object(
     'p_type',   jsonb_build_object('type', 'text', 'position', 1, 'optional', false, 'foreign', jsonb_build_object('not_an_id', true)),
     'p_id',     jsonb_build_object('type', 'uuid', 'position', 2, 'optional', false,
                   'check', 'iam.seats_of(auth.uid(), p_type, p_id) must be non-empty, decided before any write',
                   'foreign', jsonb_build_object('bounded', true, 'note', 'A record the caller holds no seat on answers not_reachable, the same as a missing one.')),
     'p_seat',   jsonb_build_object('type', 'text', 'position', 3, 'optional', false, 'foreign', jsonb_build_object('not_an_id', true)),
     'p_user',   jsonb_build_object('type', 'uuid', 'position', 4, 'optional', false,
                   'check', 'an active member of the record''s own organization',
                   'foreign', jsonb_build_object('bounded', true, 'note', 'Only a member of the record''s own organization can be added or excluded; anyone else is refused as validation.')),
     'p_change', jsonb_build_object('type', 'text', 'position', 5, 'optional', false, 'foreign', jsonb_build_object('not_an_id', true)),
     'p_reason', jsonb_build_object('type', 'text', 'position', 6, 'optional', true, 'foreign', jsonb_build_object('not_an_id', true),
                   'null_rule', jsonb_build_object('means', 'no reason recorded')))))
on conflict (schema_name, function_name, identity_argtypes) do update
  set argument_rules    = excluded.argument_rules,
      signed_in_callers = excluded.signed_in_callers,
      anonymous_callers = excluded.anonymous_callers,
      non_client_lane   = null,
      reason            = excluded.reason,
      declared_by       = excluded.declared_by;

grant execute on function iam.record_seat_set(text, uuid, text, uuid, text, text) to authenticated;

-- two invoker helpers the closed-schema guards leave alone (pure stage test; the trigger function)
revoke execute on function iam._access_setup_stage_reached(jsonb, text[]) from public, anon, authenticated;
revoke execute on function iam._access_setup_validate() from public, anon, authenticated;

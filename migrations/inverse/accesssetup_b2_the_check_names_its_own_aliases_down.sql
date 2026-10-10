-- chair-step: inverse of accesssetup_b2 — restores the accesssetup_b body of iam._access_setup_problems (the one with the ambiguous alias that raised 42702). Only useful before running accesssetup_b's own inverse.
-- lane: access-setup
-- lock: iam
-- ground-standing-ok: b - this inverse restores the accesssetup_b body of iam._access_setup_problems, which calls iam._access_setup_stages; the sibling accesssetup_b_the_seat_and_part_answers_down (meant to run after this one) drops this function and that helper together.

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

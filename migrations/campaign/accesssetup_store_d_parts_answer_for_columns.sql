-- chair-step: ADDS the part answers for Store Tables columns (PLAN §12.1): custom.store_field_part (a column's part: data.part, else its sensitivity word's preset part), custom._store_part_cells (preset cells read live from custom/field_sensitivity_levels until the scoped setup lookup lands), iam.part_may_touch / part_may_read / part_may_edit (the per-row read and the one write check; worked-out columns AND over every input), iam.parts_visible_for (parts readable at one level, memoised), custom.store_part_notice ({part, who} beside today's notice), and the column panel's doors custom.field_access_setup (read; who sees and edits now, who would lose sight) and custom.field_access_set (table admins only, never an agent; audited). No existing door is swapped: no answer changes until PLAN §12 order 5.
-- lane: access-setup-store
-- lock: custom,iam
--
-- Plan: common-docs/systems/platform/access/projects/access-setup/PLAN.md §12, §12.1 (§12.1 overrides §12).
-- Inverse: migrations/inverse/accesssetup_store_d_parts_answer_for_columns_down.sql
-- Nothing calls these before the swap (PLAN §12 order 5); no door, kernel answer or iam.access_setup row changes.

-- ── the part a column belongs to (PLAN §12.1) ────────────────────────────────────────────────
-- A named part (data.part, written by custom.field_update for a table admin) is 'part:<lower name>'.
-- A column nobody moved is in its sensitivity word's preset part: 'columns' for internal (the Table's
-- ordinary ladder), 'word:<word>' for every other word. A worked-out column has no part of its own: it is
-- readable only by a person who reads EVERY input's part (AND over custom.field_input_closure).
create or replace function custom.store_field_part(p_field_data jsonb)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select case
           when nullif(btrim(coalesce(p_field_data ->> 'part', '')), '') is not null
             then 'part:' || lower(btrim(p_field_data ->> 'part'))
           when coalesce(p_field_data ->> 'sensitivity', 'internal') = 'internal' then 'columns'
           else 'word:' || (p_field_data ->> 'sensitivity')
         end;
$function$;

-- ── the cells of one part ────────────────────────────────────────────────────────────────────
-- Until the scoped setup lookup lands (iam._access_setup_of(type, id), owner's step), every part answers
-- from its PRESET: the sensitivity word its columns carry, through the knob custom/field_sensitivity_levels
-- read LIVE for the Table's organization (an organization's knob change still applies). A named part's
-- columns share one word (custom.field_access_set keeps them equal). When a scoped setup row exists the
-- cells come from its grid instead — that is the one line to repoint, and nothing calls these answers
-- before the swap (PLAN §12 order 5).
create or replace function custom._store_part_cells(p_org uuid, p_table uuid, p_part text, p_word text)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select jsonb_build_array(
           jsonb_build_object('seat', jsonb_build_object('kind', 'row_level', 'min',
                                iam.field_sensitivity_level(coalesce(p_word, 'internal'), 'read', p_org)),
                              'level', 'viewer', 'preset', coalesce(p_word, 'internal')),
           jsonb_build_object('seat', jsonb_build_object('kind', 'row_level', 'min',
                                iam.field_sensitivity_level(coalesce(p_word, 'internal'), 'edit', p_org)),
                              'level', 'editor', 'preset', coalesce(p_word, 'internal')));
$function$;

create or replace function custom._store_cell_per_row(p_cell jsonb)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  -- a cell answered from the row's own data (who is named in it, who made it), never from a level alone
  select coalesce(p_cell #>> '{seat,kind}', '') in ('row_field', 'row_creator');
$function$;

-- ── the portal narrowing, unchanged from iam.may_touch_field_itself (per-column layer, stays) ──────
create or replace function custom._store_portal_allows(p_user_id uuid, p_field_id uuid, p_org uuid, p_action text)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select not (
        coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_org) #>> '{}')::boolean, false)
    and exists (select 1 from custom.portal_principal pp
                 where pp.user_id = p_user_id and pp.organization_id = p_org and pp.is_active)
    and not iam.has_org_access_for(p_user_id, p_org))
    or exists (
      select 1
        from custom.portal_table pt
        join custom.portal p on p.id = pt.portal_id and p.is_active
        join custom.portal_principal pp on pp.portal_id = p.id
       where pt.organization_id = p_org and pp.user_id = p_user_id and pp.is_active
         and case when p_action = 'read' then p_field_id = any (pt.visible_field_ids)
                  else p_field_id = any (pt.editable_field_ids) end);
$function$;

-- ── one column, itself (no worked-out closure): the part's cells, the share of this one column, the portal ──
create or replace function custom._store_column_itself(p_person uuid, p_row uuid, p_field_id uuid, p_org uuid,
                                                       p_level public.permission_level, p_action text)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_f      custom.record;
  v_table  uuid;
  v_cells  jsonb;
  v_cell   jsonb;
  v_want   public.permission_level := case when p_action = 'read' then 'viewer' else 'editor' end;
  v_share  public.permission_level;
  v_grant  public.permission_level;
begin
  if p_field_id is null then return true; end if;
  select * into v_f from custom.record f
   where f.organization_id = p_org and f.id = p_field_id and f.table_id = custom.field_kernel_id() and f.deleted_at is null;
  if not found then return false; end if;   -- a field nobody declared is not a field this store hands out
  if not custom._store_portal_allows(p_person, p_field_id, p_org, p_action) then return false; end if;
  v_table := nullif(v_f.data ->> 'entity_definition_id', '')::uuid;
  v_cells := custom._store_part_cells(p_org, v_table, custom.store_field_part(v_f.data), v_f.data ->> 'sensitivity');

  -- the share of ONE column (a grant on the field record) at or above the part's lowest level-only rung
  select min((c #>> '{seat,min}')::public.permission_level) into v_share
    from jsonb_array_elements(v_cells) c
   where (c ->> 'level')::public.permission_level >= v_want and c #>> '{seat,kind}' = 'row_level';
  v_grant := iam.granted_level(p_person, 'record', p_field_id);
  if v_grant is not null and v_share is not null and v_grant >= v_share then return true; end if;

  for v_cell in select c from jsonb_array_elements(v_cells) c
                 where (c ->> 'level')::public.permission_level >= v_want loop
    if v_cell #>> '{seat,kind}' = 'row_level' then
      if p_level is not null and p_level >= (v_cell #>> '{seat,min}')::public.permission_level then return true; end if;
    elsif p_row is not null and custom.store_seat_has(p_person, p_row, v_cell -> 'seat') then
      return true;
    end if;
  end loop;
  return false;
end $function$;

-- ── THE PER-ROW ANSWER (the swap's new read/write form; not called by any door before the swap) ──────
create or replace function iam.part_may_touch(p_person uuid, p_row uuid, p_field_id uuid,
                                              p_level public.permission_level, p_action text default 'read')
 returns boolean
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
-- may this person read / edit this column on this row, given their level on the row: the part's cells
-- (level-only cells from p_level, per-row cells from the row's own data), the share of one column and the
-- portal; a worked-out column also needs READ of every live input (AND over the closure, never "the
-- strictest part")
declare
  v_org   uuid;
  v_data  jsonb;
  v_input record;
begin
  if p_action not in ('read', 'edit') then
    raise exception 'a column is read or edited, and this asks to %', p_action using errcode = '22023';
  end if;
  if p_field_id is null then return true; end if;
  select f.organization_id, f.data into v_org, v_data
    from custom.record f where f.id = p_field_id and f.table_id = custom.field_kernel_id() and f.deleted_at is null;
  if v_org is null then return false; end if;
  if not custom._store_column_itself(p_person, p_row, p_field_id, v_org, p_level, p_action) then return false; end if;
  if coalesce(v_data ->> 'type', '') <> 'formula'
     or not (coalesce(v_data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']) then
    return true;
  end if;
  for v_input in select c.input_id from custom.field_input_closure(v_org, v_data, p_field_id) c where not c.retired loop
    if not custom._store_column_itself(p_person, p_row, v_input.input_id, v_org, p_level, 'read') then return false; end if;
  end loop;
  return true;
end $function$;

create or replace function iam.part_may_read(p_person uuid, p_row uuid, p_field_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select iam.part_may_touch(p_person, p_row, p_field_id,
           custom.effective_level(p_person, r.organization_id, r.id, 'record'), 'read')
    from custom.record r where r.id = p_row and r.deleted_at is null;
$function$;

-- §12.1 "one check": the part's edit cell AND an editing rung on the record (edit_content, the lowest rung
-- that changes a row's content); used by _field_write_door, entity_value_write and _entity_custom_fields_guard
-- AFTER the swap.
create or replace function iam.part_may_edit(p_person uuid, p_row uuid, p_field_id uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare v_level public.permission_level;
begin
  select custom.effective_level(p_person, r.organization_id, r.id, 'record') into v_level
    from custom.record r where r.id = p_row and r.deleted_at is null;
  if v_level is null or v_level < 'edit_content' then return false; end if;
  return iam.part_may_touch(p_person, p_row, p_field_id, v_level, 'edit');
end $function$;

-- ── ONE PAGE, ONE ANSWER: the parts a person reads at one level, from level-only cells ─────────────
-- Memoised per (person, table, level) like custom.read_mask_for. A part with any per-row cell is answered
-- per row (only that row's JSON reveals it) and counts as HIDDEN for every set-wide use — sort, filter,
-- search, aggregates, group headers, drill, enrichment, duplicate, dashboards — unless the person already
-- reads it from a level-only cell (per_row says which parts those are).
create or replace function iam.parts_visible_for(p_person uuid, p_table uuid, p_level public.permission_level)
 returns table(part text, label text, may_read boolean, may_edit boolean, per_row boolean)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_key text;
  v_hit text;
  v_org uuid;
  v_out jsonb;
begin
  if p_table is null then return; end if;
  v_key := 'pvf:' || coalesce(p_person::text, '-') || ':' || p_table::text || ':' || coalesce(p_level::text, '-');
  v_hit := platform.memo_k_get(v_key);
  if v_hit is null then
    select t.organization_id into v_org from custom.record t where t.id = p_table;
    with parts as (
      select custom.store_field_part(f.data) as part,
             min(coalesce(nullif(btrim(f.data ->> 'part'), ''), f.data ->> 'sensitivity', 'internal')) as label,
             max(coalesce(f.data ->> 'sensitivity', 'internal')) filter (where true) as word
        from custom.record f
       where f.organization_id = v_org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
         and (f.data ->> 'entity_definition_id')::uuid = p_table and coalesce(f.data ->> 'type', '') <> 'formula'
       group by 1),
    cells as (select p.part, p.label, c
                from parts p, jsonb_array_elements(custom._store_part_cells(v_org, p_table, p.part, p.word)) c)
    select coalesce(jsonb_agg(jsonb_build_object(
             'part', x.part, 'label', x.label,
             'may_read', x.r, 'may_edit', x.e, 'per_row', x.pr) order by x.part), '[]'::jsonb)
      into v_out
      from (select part, label,
                   bool_or(not custom._store_cell_per_row(c) and (c ->> 'level')::public.permission_level >= 'viewer'
                           and (case when c #>> '{seat,kind}' = 'row_level'
                                     then p_level is not null and p_level >= (c #>> '{seat,min}')::public.permission_level
                                     when c #>> '{seat,kind}' = 'org_role'
                                     then exists (select 1 from iam.memberships m where m.organization_id = v_org
                                                    and m.container_type = 'organization' and m.user_id = p_person
                                                    and m.role = c #>> '{seat,role}' and m.status = 'active' and m.deleted_at is null)
                                     else false end)) as r,
                   bool_or(not custom._store_cell_per_row(c) and (c ->> 'level')::public.permission_level >= 'editor'
                           and p_level is not null and p_level >= 'edit_content'
                           and (case when c #>> '{seat,kind}' = 'row_level'
                                     then p_level >= (c #>> '{seat,min}')::public.permission_level
                                     else false end)) as e,
                   bool_or(custom._store_cell_per_row(c)) as pr
              from cells group by part, label) x;
    perform platform.memo_k_put(v_key, v_out::text);
  else
    v_out := v_hit::jsonb;
  end if;
  return query select e ->> 'part', e ->> 'label', (e ->> 'may_read')::boolean, (e ->> 'may_edit')::boolean,
                      (e ->> 'per_row')::boolean
                 from jsonb_array_elements(v_out) e;
end $function$;

-- ── the notice beside a withheld value: {part, who} beside today's {reason, needs, or} ──────────────
create or replace function custom.store_part_who(p_cells jsonb, p_action text default 'read')
 returns text
 language sql
 stable security definer
 set search_path to ''
as $function$
  -- who reads (or edits) a part, in words, from its cells: "people with Editor on this row and the person named in Employee"
  select string_agg(w, ' and ' order by n)
    from (select w, min(n) n from (
      select case x.cell #>> '{seat,kind}'
               when 'row_level' then 'people with ' || iam.level_label('record', (x.cell #>> '{seat,min}')::public.permission_level)
                                     || ' on this row'
               when 'row_field' then 'the person named in ' || coalesce((select coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key')
                                       from custom.record f where f.id::text = x.cell #>> '{seat,field_id}'), 'a person column')
               when 'row_creator' then 'the person who made this row'
               when 'org_role' then 'organization ' || (x.cell #>> '{seat,role}') || 's'
               when 'field_grant' then 'people given a share of this column'
             end as w, x.n
        from jsonb_array_elements(p_cells) with ordinality x(cell, n)
       where (x.cell ->> 'level')::public.permission_level
             >= (case when p_action = 'read' then 'viewer' else 'editor' end)::public.permission_level
    ) y where w is not null group by w) z;
$function$;

create or replace function custom.store_part_notice(p_field custom.record, p_action text default 'read')
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  -- today's notice (reason, needs, or, and for a worked-out column what it reads) with the part and who
  -- reads it; withheld.tsx says "Pay — people with Admin on this row" from {part, who}
  select jsonb_build_object(
    'reason', p_field.data ->> 'sensitivity',
    'needs',  iam.level_label('record', iam.field_sensitivity_level(p_field.data ->> 'sensitivity', p_action, p_field.organization_id)),
    'or',     'a share of this one field with you',
    'part',   coalesce(nullif(btrim(p_field.data ->> 'part'), ''),
                       case when custom.store_field_part(p_field.data) = 'columns' then null
                            else initcap(coalesce(p_field.data ->> 'sensitivity', 'internal')) end),
    'who',    custom.store_part_who(custom._store_part_cells(p_field.organization_id,
                 nullif(p_field.data ->> 'entity_definition_id', '')::uuid,
                 custom.store_field_part(p_field.data), p_field.data ->> 'sensitivity'), p_action))
  || coalesce((
    select jsonb_build_object(
             'reads', jsonb_agg(c.input_label order by c.input_label),
             'says',  format('%s is worked out from %s, which you have not been given.',
                             coalesce(nullif(p_field.data ->> 'label', ''), p_field.data ->> 'key'),
                             string_agg(c.input_label, ', ' order by c.input_label)))
      from custom.field_input_closure(p_field.organization_id, p_field.data, p_field.id) c
     where not c.retired and custom.sensitivity_rank(c.sensitivity) > custom.sensitivity_rank('internal')
    having count(*) > 0), '{}'::jsonb);
$function$;

-- ── THE COLUMN'S "WHO CAN SEE AND EDIT" (the panel's one read and one write) ──────────────────────
create or replace function custom._store_person_card(p_user uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select jsonb_build_object('user_id', u.id, 'email', u.email,
           'name', coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', ''), u.email))
    from auth.users u where u.id = p_user;
$function$;

create or replace function custom.field_access_setup(p_field_id uuid, p_proposed jsonb default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
-- One column's People involved: its part, the columns in that part, the words a part can take (with the
-- level each needs today, read live from the knob), and every person who reaches the Table with whether
-- they see and edit this column now. With p_proposed {part?, word} it also says who would LOSE sight or
-- editing (and who would gain it) before anything is saved. Table admins may change it; never an agent.
declare
  v_me     uuid := auth.uid();
  v_f      custom.record;
  v_table  uuid;
  v_org    uuid;
  v_mine   public.permission_level;
  v_title  boolean;
  v_why    text;
  v_word   text;
  v_pdata  jsonb;
  v_people jsonb;
  v_map    jsonb;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into v_f from custom.record f
   where f.id = p_field_id and f.table_id = custom.field_kernel_id() and f.deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_table := nullif(v_f.data ->> 'entity_definition_id', '')::uuid;
  v_org := v_f.organization_id;
  v_mine := custom.effective_level(v_me, v_org, v_table, 'record');
  if v_mine is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_title := exists (select 1 from custom.record t where t.id = v_table and t.table_id = custom.table_kernel_id()
                        and t.data ->> 'title_field' = v_f.data ->> 'key');
  v_why := case
    when platform.declared_actor_tier() is not distinct from 'agent' then 'An agent never decides who sees a column.'
    when v_mine is distinct from 'admin' then 'Only a table admin decides who sees a column.'
    when v_title then 'This column names each record, so everyone who can open a row sees it.'
    when coalesce(v_f.data ->> 'type', '') = 'formula' then 'This column is worked out from others; it is as private as what it reads.'
  end;
  begin
    v_map := platform.knob_resolve('custom', 'field_sensitivity_levels', v_org);
  exception when others then v_map := '{}'::jsonb;
  end;

  if p_proposed is not null then
    v_word := coalesce(p_proposed ->> 'word', v_f.data ->> 'sensitivity', 'internal');
    if not coalesce(v_map -> 'read' ? v_word, false) then
      return jsonb_build_object('ok', false, 'reason', 'unknown_word', 'word', v_word);
    end if;
    v_pdata := (v_f.data - 'part') || jsonb_build_object('sensitivity', v_word)
               || case when nullif(btrim(coalesce(p_proposed ->> 'part', '')), '') is not null
                       then jsonb_build_object('part', btrim(p_proposed ->> 'part')) else '{}'::jsonb end;
  end if;

  -- everyone who reaches the Table: members, people granted on the Table or on this column, portal people
  with cand as (
    select m.user_id u from iam.memberships m
     where m.organization_id = v_org and m.container_type = 'organization' and m.status = 'active'
       and m.deleted_at is null and m.user_id is not null
    union
    select p.granted_to_user_id from iam.permissions p
     where p.resource_type = 'record' and p.resource_id in (v_table, p_field_id) and p.granted_to_user_id is not null
       and p.status <> 'rejected' and (p.expires_at is null or p.expires_at > now())),
  lv as (select u, custom.effective_level(u, v_org, v_table, 'record') l from cand),
  ans as (
    select u, l,
           iam.part_may_touch(u, null, p_field_id, l, 'read') r_now,
           iam.part_may_touch(u, null, p_field_id, l, 'edit') and l >= 'edit_content' e_now,
           case when v_pdata is null then null else
             (l >= iam.field_sensitivity_level(v_word, 'read', v_org)
              or coalesce(iam.granted_level(u, 'record', p_field_id) >= iam.field_sensitivity_level(v_word, 'read', v_org), false)) end r_next,
           case when v_pdata is null then null else
             (l >= 'edit_content' and (l >= iam.field_sensitivity_level(v_word, 'edit', v_org)
              or coalesce(iam.granted_level(u, 'record', p_field_id) >= iam.field_sensitivity_level(v_word, 'edit', v_org), false))) end e_next,
           iam.granted_level(u, 'record', p_field_id) share
      from lv where l is not null)
  select coalesce(jsonb_agg(custom._store_person_card(a.u) || jsonb_build_object(
           'level', a.l, 'sees', a.r_now, 'edits', a.e_now, 'share', a.share,
           'sees_next', a.r_next, 'edits_next', a.e_next) order by a.l desc, a.u), '[]'::jsonb)
    into v_people from ans a;

  return jsonb_build_object(
    'ok', true,
    'field', jsonb_build_object('id', v_f.id, 'key', v_f.data ->> 'key',
               'label', coalesce(nullif(v_f.data ->> 'label', ''), v_f.data ->> 'key'),
               'part', nullif(btrim(coalesce(v_f.data ->> 'part', '')), ''),
               'word', coalesce(v_f.data ->> 'sensitivity', 'internal'),
               'names_each_record', v_title, 'worked_out', coalesce(v_f.data ->> 'type', '') = 'formula'),
    'table_id', v_table,
    'my_level', v_mine,
    'may_change', v_why is null,
    'why_not', v_why,
    'parts', (select coalesce(jsonb_agg(distinct btrim(f.data ->> 'part')), '[]'::jsonb) from custom.record f
               where f.organization_id = v_org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
                 and (f.data ->> 'entity_definition_id')::uuid = v_table and nullif(btrim(f.data ->> 'part'), '') is not null),
    'part_columns', (select coalesce(jsonb_agg(coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key') order by f.data ->> 'label'), '[]'::jsonb)
               from custom.record f
               where f.organization_id = v_org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
                 and (f.data ->> 'entity_definition_id')::uuid = v_table and f.id <> v_f.id
                 and nullif(btrim(v_f.data ->> 'part'), '') is not null
                 and lower(btrim(f.data ->> 'part')) = lower(btrim(v_f.data ->> 'part'))),
    'words', (select coalesce(jsonb_agg(jsonb_build_object('word', k,
                 'read_needs', iam.level_label('record', iam.field_sensitivity_level(k, 'read', v_org)),
                 'edit_needs', iam.level_label('record', iam.field_sensitivity_level(k, 'edit', v_org)))
                 order by custom.sensitivity_rank(k)), '[]'::jsonb)
               from jsonb_object_keys(coalesce(v_map -> 'read', '{}'::jsonb)) k),
    'people', v_people,
    'proposed', case when v_pdata is null then null else jsonb_build_object(
        'word', v_word, 'part', v_pdata ->> 'part',
        'loses_sight', (select count(*) from jsonb_array_elements(v_people) e where (e ->> 'sees')::boolean and not (e ->> 'sees_next')::boolean),
        'loses_edit',  (select count(*) from jsonb_array_elements(v_people) e where (e ->> 'edits')::boolean and not (e ->> 'edits_next')::boolean),
        'gains_sight', (select count(*) from jsonb_array_elements(v_people) e where not (e ->> 'sees')::boolean and (e ->> 'sees_next')::boolean)) end);
end $function$;

create or replace function custom.field_access_set(p_field_id uuid, p_part text, p_word text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
-- A table admin puts one column in a part (or takes it out) and says how private the part is. Every other
-- column already in that part takes the same word, so a part answers one way. Written through
-- custom.field_update (its part arm refuses agents, non-admins, the record-naming column and worked-out
-- columns); one iam.access_audit row per call with before and after.
declare
  v_me    uuid := auth.uid();
  v_f     custom.record;
  v_table uuid;
  v_org   uuid;
  v_part  text := nullif(btrim(coalesce(p_part, '')), '');
  v_word  text := coalesce(nullif(btrim(coalesce(p_word, '')), ''), 'internal');
  v_ids   uuid[];
  v_id    uuid;
  v_before jsonb;
  v_audit uuid;
  v_map   jsonb;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if platform.declared_actor_tier() is not distinct from 'agent' then
    raise exception 'An agent never decides who sees a column. A table admin does that in "Who can see and edit".'
      using errcode = '42501', hint = 'ACCESS-SETUP §12 (d). Nothing was changed.';
  end if;
  select * into v_f from custom.record f
   where f.id = p_field_id and f.table_id = custom.field_kernel_id() and f.deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_table := nullif(v_f.data ->> 'entity_definition_id', '')::uuid;
  v_org := v_f.organization_id;
  if custom.effective_level(v_me, v_org, v_table, 'record') is distinct from 'admin' then
    raise exception 'Only a table admin decides who sees "%".', coalesce(nullif(v_f.data ->> 'label', ''), v_f.data ->> 'key')
      using errcode = '42501', hint = 'ACCESS-SETUP §12 (d). Nothing was changed.';
  end if;
  begin
    v_map := platform.knob_resolve('custom', 'field_sensitivity_levels', v_org);
  exception when others then v_map := '{}'::jsonb;
  end;
  if not coalesce(v_map -> 'read' ? v_word, false) then
    raise exception '"%" is not a privacy this organization knows.', v_word
      using errcode = '22023', hint = 'ACCESS-SETUP: the words are the keys of custom/field_sensitivity_levels. Nothing was changed.';
  end if;

  select coalesce(array_agg(f.id), '{}'::uuid[]),
         coalesce(jsonb_agg(jsonb_build_object('field_id', f.id, 'part', f.data ->> 'part', 'word', f.data ->> 'sensitivity')), '[]'::jsonb)
    into v_ids, v_before
    from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table
     and (f.id = p_field_id or (v_part is not null and lower(btrim(coalesce(f.data ->> 'part', ''))) = lower(v_part)));

  perform custom.field_update(v_org, p_field_id,
            jsonb_build_object('part', to_jsonb(v_part), 'sensitivity', v_word));
  foreach v_id in array v_ids loop
    if v_id <> p_field_id then
      perform custom.field_update(v_org, v_id, jsonb_build_object('sensitivity', v_word));
    end if;
  end loop;

  v_audit := iam._record_access_audit(
    p_organization_id   => v_org,
    p_action            => 'part_change',
    p_target_token      => 'record',
    p_data_class        => 'organization',
    p_purpose           => 'access_setup',
    p_basis             => 'store_part',
    p_granted           => true,
    p_target_ids        => v_ids,
    p_row_count         => coalesce(array_length(v_ids, 1), 0),
    p_subject_user_id   => null,
    p_justification     => format('%s -> part %s, %s', coalesce(nullif(v_f.data ->> 'label', ''), v_f.data ->> 'key'),
                                  coalesce(v_part, '(none)'), v_word),
    p_is_emergency_door => false,
    p_actor_user_id     => v_me,
    p_granted_to_user_id => null);
  return jsonb_build_object('ok', true, 'field_id', p_field_id, 'part', v_part, 'word', v_word,
                            'columns', coalesce(array_length(v_ids, 1), 0), 'before', v_before, 'audit_id', v_audit);
end $function$;

-- every SECURITY DEFINER function declares its access decision in data; the two panel doors are client doors
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_d_parts_answer_for_columns.sql (lane access-setup-store)', 'ACCESS-SETUP §12.1: a parts cells (preset from the sensitivity knob until scoped setups land).',
       'server_only: an internal Store Tables answer, called only by other store functions and the equivalence proof; takes any person id, so never a client door', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'custom._store_part_cells(uuid,uuid,text,text)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;
revoke all on function custom._store_part_cells(uuid,uuid,text,text) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_d_parts_answer_for_columns.sql (lane access-setup-store)', 'ACCESS-SETUP §12.1: the portal narrowing of one column.',
       'server_only: an internal Store Tables answer, called only by other store functions and the equivalence proof; takes any person id, so never a client door', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'custom._store_portal_allows(uuid,uuid,uuid,text)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;
revoke all on function custom._store_portal_allows(uuid,uuid,uuid,text) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_d_parts_answer_for_columns.sql (lane access-setup-store)', 'ACCESS-SETUP §12.1: one column itself, part cells + share + portal.',
       'server_only: an internal Store Tables answer, called only by other store functions and the equivalence proof; takes any person id, so never a client door', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'custom._store_column_itself(uuid,uuid,uuid,uuid,permission_level,text)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;
revoke all on function custom._store_column_itself(uuid,uuid,uuid,uuid,permission_level,text) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_d_parts_answer_for_columns.sql (lane access-setup-store)', 'ACCESS-SETUP §12.1: per-row column answer given a level.',
       'server_only: an internal Store Tables answer, called only by other store functions and the equivalence proof; takes any person id, so never a client door', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'iam.part_may_touch(uuid,uuid,uuid,permission_level,text)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;
revoke all on function iam.part_may_touch(uuid,uuid,uuid,permission_level,text) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_d_parts_answer_for_columns.sql (lane access-setup-store)', 'ACCESS-SETUP §12.1: per-row read answer.',
       'server_only: an internal Store Tables answer, called only by other store functions and the equivalence proof; takes any person id, so never a client door', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'iam.part_may_read(uuid,uuid,uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;
revoke all on function iam.part_may_read(uuid,uuid,uuid) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_d_parts_answer_for_columns.sql (lane access-setup-store)', 'ACCESS-SETUP §12.1: the one write check, part edit cell AND an editing rung.',
       'server_only: an internal Store Tables answer, called only by other store functions and the equivalence proof; takes any person id, so never a client door', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'iam.part_may_edit(uuid,uuid,uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;
revoke all on function iam.part_may_edit(uuid,uuid,uuid) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_d_parts_answer_for_columns.sql (lane access-setup-store)', 'ACCESS-SETUP §12.1: parts readable at one level, memoised per person/table/level.',
       'server_only: an internal Store Tables answer, called only by other store functions and the equivalence proof; takes any person id, so never a client door', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'iam.parts_visible_for(uuid,uuid,permission_level)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;
revoke all on function iam.parts_visible_for(uuid,uuid,permission_level) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_d_parts_answer_for_columns.sql (lane access-setup-store)', 'ACCESS-SETUP §12.1: who reads a part, in words.',
       'server_only: an internal Store Tables answer, called only by other store functions and the equivalence proof; takes any person id, so never a client door', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'custom.store_part_who(jsonb,text)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;
revoke all on function custom.store_part_who(jsonb,text) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_d_parts_answer_for_columns.sql (lane access-setup-store)', 'ACCESS-SETUP §12.1: the withheld notice with part and who.',
       'server_only: an internal Store Tables answer, called only by other store functions and the equivalence proof; takes any person id, so never a client door', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'custom.store_part_notice(custom.record,text)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;
revoke all on function custom.store_part_notice(custom.record,text) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_d_parts_answer_for_columns.sql (lane access-setup-store)', 'ACCESS-SETUP §12.1: a person as the column panel shows them.',
       'server_only: an internal Store Tables answer, called only by other store functions and the equivalence proof; takes any person id, so never a client door', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'custom._store_person_card(uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;
revoke all on function custom._store_person_card(uuid) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_d_parts_answer_for_columns.sql (lane access-setup-store)', 'ACCESS-SETUP §12 order 6: SECURITY DEFINER. not_reachable unless auth.uid() reaches the columns Table (custom.effective_level not null); returns the columns part, the words and what each needs (knob, live), every person who reaches the Table with whether they see and edit it now, and with p_proposed who would lose or gain sight before saving. may_change only for a table admin, never an agent.', null, true, false, '{"version":1,"arguments":{"p_field_id":{"type":"uuid","position":1,"optional":false,"foreign":{"bounded":true,"note":"A column whose Table the caller does not reach answers not_reachable, the same as a missing one."}},"p_proposed":{"type":"jsonb","position":2,"optional":true,"foreign":{"not_an_id":true}}}}'::jsonb
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'custom.field_access_setup(uuid,jsonb)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set reason = excluded.reason, declared_by = excluded.declared_by, non_client_lane = null, signed_in_callers = true,
      anonymous_callers = false, argument_rules = excluded.argument_rules;
grant execute on function custom.field_access_setup(uuid,jsonb) to authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_d_parts_answer_for_columns.sql (lane access-setup-store)', 'ACCESS-SETUP §12 order 6: SECURITY DEFINER. Refuses an agent and anyone below admin on the columns Table; writes part and word through custom.field_update for the column and the word for every other column in that part; one iam.access_audit part_change row.', null, true, false, '{"version":1,"arguments":{"p_field_id":{"type":"uuid","position":1,"optional":false,"foreign":{"bounded":true,"note":"Refused unless the caller is admin on the columns Table."}},"p_part":{"type":"text","position":2,"optional":false,"foreign":{"not_an_id":true}},"p_word":{"type":"text","position":3,"optional":false,"foreign":{"not_an_id":true}}}}'::jsonb
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'custom.field_access_set(uuid,text,text)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set reason = excluded.reason, declared_by = excluded.declared_by, non_client_lane = null, signed_in_callers = true,
      anonymous_callers = false, argument_rules = excluded.argument_rules;
grant execute on function custom.field_access_set(uuid,text,text) to authenticated;
revoke all on function custom.store_field_part(jsonb) from public, anon, authenticated;
revoke all on function custom._store_cell_per_row(jsonb) from public, anon, authenticated;

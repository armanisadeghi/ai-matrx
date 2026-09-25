-- target: branch,production
-- additive: yes
--   It ADDS seven functions — custom.levels_of, custom.read_mask_at and custom._read_record_with
--   (SECURITY DEFINER, no client EXECUTE, declared server_only), custom.record_values_step,
--   custom.choice_render_plan, custom.choice_render_with and custom.entity_reference_render_with
--   (invoker; the ddl_guard clears their client EXECUTE at birth, like the helpers they serve) — and REPLACES nine
--   function bodies with their existing signatures, security, search_path and grants:
--   custom.read_record, custom.read_mask, custom.read_records_by_ids, custom.read_records_matching,
--   custom.read_records, custom.resolve_context, custom.choice_render,
--   custom.entity_reference_render and custom.with_whole_value_pointers. No table, column,
--   trigger, policy or grant is touched; no row is written except the three door rows. Every
--   answer is byte-identical (storereadperf2_green.sql, dev clone; oracle on production).
-- guard: custom/system_enabled
-- lane: STORE-READ-PERF-2
-- lock: custom
--
-- WHY. After READ-MASK-ONCE the set doors still paid, PER RECORD, for questions whose answer is the
-- same for a whole class of records (PROGRESS-READ-MASK-ONCE § What remains): custom.effective_level
-- (three custom.has_visibility walks) inside custom.read_mask plus custom.read_record's own viewer
-- walk; custom.derived_values_of asking custom.table_type_field and custom.applicable_fields for the
-- record's Table and running custom.parity_type over every Field of it; custom.choice_render asking
-- the Table's reference Fields and every list Field's options; custom.with_whole_value_pointers
-- running custom.whole_value_pointer_of for every visible key of every record although almost no
-- record keeps a value in a file.
--
-- THE FIX, in four parts, each the same rule asked once instead of once per record:
--   1. custom.levels_of(person, ids) — the rung and the viewer answer for a SET, one ladder walk per
--      class of records the ladder cannot tell apart (same organization, Table, visibility,
--      liveness and creator-is-me, and no row anywhere naming the record: a grant, a membership, a
--      library grant, a closure row, a carrying edge or a scope assignment). A record so named is
--      asked on its own. read_records_by_ids and resolve_context ask it once for their set.
--   2. custom.record_values_step — custom.record_values_of(r) with the Table's type field and
--      read-time derived Fields carried from record to record (the set doors and the read door).
--   3. custom.choice_render_with / custom.entity_reference_render_with — the rules, with the Table's
--      plan (custom.choice_render_plan) handed in; custom.choice_render and
--      custom.entity_reference_render ask them with the plan looked up, so there is one copy.
--   4. custom.with_whole_value_pointers answers the untouched document first when no source keeps a
--      whole value in a file.
-- custom.read_record is custom._read_record_with with nothing handed in, so the single-record door
-- asks every question itself, in the order it always did.
--
-- Inverse: migrations/inverse/storereadperf2_the_rung_is_asked_once_per_class_down.sql puts the
-- nine bodies back verbatim, removes the three door rows and drops the seven functions.
-- based-on: custom.read_record(uuid, uuid, boolean) b36b1743cac8ee4106e2996e97cf244970484466081ccf5d5594841556696a54
-- based-on: custom.read_records_by_ids(uuid, uuid, uuid[], boolean) 9552d44e81fdd4e7b2d40f4aead0141e73a8ee4a20b2955dbff04a6dc234b266
-- based-on: custom.read_mask(uuid, uuid, text) 12d82f297d20436aba2c9dcca0d697eaff3651e8d84828bf82ba20f8c191cd73
-- based-on: custom.choice_render(uuid, uuid, jsonb) 7de72cceb216ede63d5f63b4b0c03014c2e157a47d535dbea8a7e6757c476d04
-- based-on: custom.entity_reference_render(uuid, uuid, jsonb) a328d70b00838e599412620f0886cc6ae9403eab2984fe654fa475e39ba47996
-- based-on: custom.with_whole_value_pointers(jsonb, jsonb, jsonb, text[], boolean, jsonb) 7f91ba9e89178bad3c4b61f90ea41812a823ea58a45f5d0b613551ecee76ded0
-- based-on: custom.read_records_matching(uuid, uuid, jsonb, boolean, integer, integer) 575636c1b65e4546ab0a856121cf98f19b1ed6f6aa99d4b12c2d3ef15bf3df5a
-- based-on: custom.read_records(uuid, uuid, boolean, integer, integer) 6daaabadd53c8f8bfbf6bc14bdf59158575ea00b06d50b0ce36c162d6db4386f
-- based-on: custom.resolve_context(text, uuid, uuid[], uuid[]) 110d18720b370c5bc44c7513e612571af1d93d5b5c745d5e33cd2533639ccc6c

set local lock_timeout = '30s';

-- ── 1. THE RUNG, ONCE PER CLASS ───────────────────────────────────────────────────────────────
create function custom.levels_of(p_user_id uuid, p_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
-- STORE-READ-PERF-2 (2026-09-25). THE RUNG, ONCE PER CLASS, FOR A SET OF RECORDS.
--
-- Answers, for each id, exactly what the one ladder answers about it for this person:
--   l = custom.effective_level(p_user_id, <its organization>, id)   (the rung the mask needs)
--   s = custom.has_visibility(p_user_id, 'record', id, 'viewer')   (the read door's own check)
-- as {"<id>": {"l": <level or null>, "s": <bool>}}.
--
-- WHY IT MAY ASK ONCE PER CLASS. Every input the ladder reads about ONE record is either a
-- column of that record — its organization, its Table, its `visibility`, whether it is live,
-- whether this person created it (`iam.owner_of` reads `created_by`) — or a row somewhere else
-- that NAMES that record by id: a grant (`iam.permissions`), a membership held on it
-- (`iam.memberships`, record or scope), a library grant (`platform.entity_grants`), a closure
-- row (`platform.reachability`), a carrying edge (`custom.carrying_edges_of` arms 1a/1b/2a/2b/4
-- — every arm but the Table the record lives in), or an assignment to a scope
-- (`public._edu_can_read_via_assignment`). Everything else the ladder reads — the organization's
-- lanes and knobs, the Table's own grants and carrying, whether this person is an admin, owns a
-- record in the organization, or holds any grant anywhere — is the same for every record that
-- shares those columns. So two records with the same columns and NO row naming either of them
-- get the same answer at every rung, and the ladder is asked once for the class.
--
-- A record that is NAMED by any such row, a row of the kernel Table (arm 4 of has_visibility
-- reads the Table's contents), a record with no Table, an id that is not a record, and every
-- record while `record` has a registered FK containment parent (custom.visible_set's first stop)
-- is asked on its own, exactly as before. The class memo lives in this one call and nowhere
-- else, so it can never outlive the snapshot it was answered in.
declare
  v_out    jsonb := '{}'::jsonb;
  v_memo   jsonb := '{}'::jsonb;
  v_fk     boolean;
  v_kernel uuid := custom.table_kernel_id();
  v_key    text;
  v_l      public.permission_level;
  v_s      boolean;
  r        record;
begin
  if p_user_id is null or p_ids is null or cardinality(p_ids) = 0 then
    return v_out;
  end if;

  v_fk := exists (select 1 from platform.entity_relationships er
                   where er.child_type = 'record' and er.kind in ('composition', 'containment'));

  for r in
    select u.id, x.organization_id, x.table_id, x.visibility, x.deleted_at is null as live,
           x.created_by is not distinct from p_user_id as own, x.id is not null as found,
           ( exists (select 1 from iam.permissions p
                      where p.resource_type = 'record' and p.resource_id = u.id)
          or exists (select 1 from iam.memberships m
                      where m.container_type in ('record', 'scope') and m.container_id = u.id)
          or exists (select 1 from platform.entity_grants g
                      where g.entity_type = 'record' and g.entity_id = u.id)
          or exists (select 1 from platform.reachability rr
                      where rr.item_type = 'record' and rr.item_id = u.id)
          or exists (select 1 from platform.associations a
                      where a.deleted_at is null and a.target_type = 'record' and a.target_id = u.id)
          or exists (select 1 from platform.associations a
                      where a.deleted_at is null and a.source_type = 'record' and a.source_id = u.id
                        and ( a.target_type = 'scope'
                           or a.relation_field_id is not null and exists (
                                select 1 from custom.portal_table pt where pt.names_via_field_id = a.relation_field_id)
                           or exists (select 1 from platform.association_types t
                                       where t.source_type = a.source_type and t.target_type = a.target_type
                                         and (t.label is null or t.label = a.label)
                                         and t.is_active and t.container_side = 'target')
                           or exists (select 1 from custom.carrying_rule cr
                                       where cr.role = a.role and cr.is_active and cr.container_side = 'target'))) ) as named
      from (select distinct unnest(p_ids) as id) u
      left join custom.record x on x.id = u.id
     where u.id is not null
  loop
    if not r.found or v_fk or r.table_id is null or r.table_id = v_kernel or r.named then
      v_key := null;
    else
      v_key := r.organization_id::text || ':' || r.table_id::text || ':' || r.visibility::text || ':'
            || r.live::text || ':' || r.own::text;
    end if;

    if v_key is not null and v_memo ? v_key then
      v_out := v_out || jsonb_build_object(r.id::text, v_memo -> v_key);
      continue;
    end if;

    v_l := custom.effective_level(p_user_id, r.organization_id, r.id);
    v_s := custom.has_visibility(p_user_id, 'record', r.id, 'viewer'::public.permission_level);
    v_out := v_out || jsonb_build_object(r.id::text, jsonb_build_object('l', v_l, 's', v_s));
    if v_key is not null then
      v_memo := v_memo || jsonb_build_object(v_key, jsonb_build_object('l', v_l, 's', v_s));
    end if;
  end loop;
  return v_out;
end;
$function$;

-- ── 2. THE VALUES, ONCE PER TABLE PLAN ───────────────────────────────────────────────────────
-- custom.record_values_of(r) is the document a reader starts from. Its expensive half,
-- custom.derived_values_of, asks custom.table_type_field and custom.applicable_fields for the
-- record's Table — the same answer for every record of that Table and type — and runs
-- custom.parity_type over every Field of it, once PER RECORD. This is the same body with that
-- plan carried: the set doors hand the cache from one record to the next, so a page of 200 asks
-- the Table once. `custom.record_values_of` and `custom.derived_values_of` are unchanged and
-- stay the single-record answer; this function must equal them record for record
-- (storereadperf2_green.sql clause 2).
create function custom.record_values_step(p_row custom.record, p_cache jsonb default '{}'::jsonb,
                                          out o_doc jsonb, out o_cache jsonb)
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_base  jsonb;
  v_out   jsonb;
  v_plain jsonb;
  v_tf    text;
  v_rtype text;
  v_tk    text;
  v_pk    text;
  v_plan  jsonb;
  f       jsonb;
begin
  o_cache := coalesce(p_cache, '{}'::jsonb);
  v_base := (p_row.data - '_computed' - '_retired' - '_values' - '_sources' - '_derived')
            || custom.computed_block(p_row.data -> '_computed');

  -- custom.derived_values_of's own first line, exactly.
  if p_row.id is null or p_row.table_id is null
     or p_row.data_class in ('kernel', 'relation') then
    o_doc := v_base || '{}'::jsonb;
    return;
  end if;

  v_out := custom.computed_block(p_row.data -> '_derived');
  v_plain := v_base || v_out;

  v_tk := 'tf:' || coalesce(p_row.organization_id::text, '-') || ':' || p_row.table_id::text;
  if not (o_cache ? v_tk) then
    o_cache := o_cache || jsonb_build_object(v_tk,
                 to_jsonb(custom.table_type_field(p_row.organization_id, p_row.table_id)));
  end if;
  v_tf := o_cache ->> v_tk;
  if v_tf is not null then
    v_rtype := p_row.data ->> v_tf;
  end if;

  v_pk := 'af:' || coalesce(p_row.organization_id::text, '-') || ':' || p_row.table_id::text || ':'
       || case when v_rtype is null then 'n' else 'v:' || v_rtype end;
  if not (o_cache ? v_pk) then
    select coalesce(jsonb_agg(a.data order by a.ordinality), '[]'::jsonb) into v_plan
      from custom.applicable_fields(p_row.organization_id, p_row.table_id, v_rtype) with ordinality as a
     where custom.parity_type(a.data) in ('lookup', 'rollup', 'formula')
       and coalesce(a.data ->> 'compute_on', '') = 'read';
    o_cache := o_cache || jsonb_build_object(v_pk, v_plan);
  end if;

  for f in select e from jsonb_array_elements(o_cache -> v_pk) e loop
    v_out := v_out || jsonb_build_object(f ->> 'key',
                        custom.derived_value(p_row.organization_id, p_row.id, f, v_plain));
  end loop;
  o_doc := v_base || coalesce(v_out, '{}'::jsonb);
end;
$function$;

-- ── 3. THE CHOICE WORDS AND ENTITY LABELS, ONCE PER TABLE PLAN ───────────────────────────────
-- custom.choice_render asked custom.entity_reference_fields and custom.choice_field_map (every
-- list Field's options) for the Table on EVERY record. The two answers are now a plan the set
-- doors carry; custom.choice_render and custom.entity_reference_render keep their signatures
-- and ask the same `_with` bodies, so there is one copy of each rule.
create function custom.entity_reference_render_with(p_organization_id uuid, p_table_id uuid, p_doc jsonb, p_fields jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_fields jsonb := p_fields;
  v_out    jsonb;
  v_at     text;
  v_val    jsonb;
  v_items  jsonb;
  e        record;
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or p_table_id is null then
    return p_doc;
  end if;
  if v_fields = '{}'::jsonb then
    return p_doc;
  end if;
  v_out := p_doc;
  for e in select key as k, value as v from jsonb_each(v_fields) loop
    v_at := case when p_doc ? e.k then e.k
                 when p_doc ? (e.v ->> 'field_id') then e.v ->> 'field_id' end;
    if v_at is null then
      continue;
    end if;
    v_val := p_doc -> v_at;
    if jsonb_typeof(v_val) not in ('array', 'object')
       or (jsonb_typeof(v_val) = 'object' and not (v_val ? 'token' and v_val ? 'id')) then
      continue;   -- a masking notice, or something the validator would refuse: untouched
    end if;
    select coalesce(jsonb_agg(
             case when jsonb_typeof(x) = 'object' and x ? 'token' and x ? 'id'
                       and (x ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then jsonb_build_object(
                         'token', x ->> 'token',
                         'id',    x ->> 'id',
                         'label', platform.relation_label(p_organization_id, x ->> 'token', (x ->> 'id')::uuid))
                  else x end order by o), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(case when jsonb_typeof(v_val) = 'array' then v_val
                                     else jsonb_build_array(v_val) end) with ordinality as a(x, o);
    v_out := v_out || jsonb_build_object(v_at,
               case when jsonb_typeof(v_val) = 'array' then v_items else v_items -> 0 end);
  end loop;
  return v_out;
end
$function$;

create or replace function custom.entity_reference_render(p_organization_id uuid, p_table_id uuid, p_doc jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or p_table_id is null then
    return p_doc;
  end if;
  -- STORE-READ-PERF-2: the rule lives in custom.entity_reference_render_with; this is it with
  -- the Table's reference Fields looked up here, for a caller that renders one document.
  return custom.entity_reference_render_with(p_organization_id, p_table_id, p_doc,
           custom.entity_reference_fields(p_organization_id, p_table_id));
end
$function$;

-- The plan: what custom.choice_render reads about a Table, once.
create function custom.choice_render_plan(p_organization_id uuid, p_table_id uuid)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $function$
  select jsonb_build_object('erf', custom.entity_reference_fields(p_organization_id, p_table_id),
                            'map', custom.choice_field_map(p_organization_id, p_table_id));
$function$;

create function custom.choice_render_with(p_organization_id uuid, p_table_id uuid, p_doc jsonb, p_plan jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_map   jsonb;
  v_out   jsonb;
  v_notes jsonb := '{}'::jsonb;
  v_note  jsonb;
  v_at    text;
  e       record;
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or p_table_id is null then
    return p_doc;
  end if;
  -- SC-R / P12: an entity reference is rendered here too — {token, id} gains the thing's own
  -- label — because this is the one step every read door takes after masking (read_record,
  -- read_records*, value_read, record_aggregate, query_across_homes, query_by_coordinates).
  p_doc := custom.entity_reference_render_with(p_organization_id, p_table_id, p_doc, p_plan -> 'erf');
  v_map := p_plan -> 'map';
  if v_map = '{}'::jsonb then
    return p_doc;                       -- no list Field on this Table: nothing to say.
  end if;

  v_out := p_doc;
  for e in select key as k, value as v from jsonb_each(v_map) loop
    -- THE COLUMN, UNDER WHICHEVER NAME THIS DOCUMENT USES. `custom.mask_document` re-keys the
    -- whole document by field id when the caller asks for it, and every list surface does.
    v_at := case when p_doc ? e.k then e.k
                 when p_doc ? (e.v ->> 'field_id') then e.v ->> 'field_id'
            end;
    if v_at is null then
      continue;
    end if;
    v_note := custom.choice_render_note(e.v, p_doc -> v_at);
    if v_note is null then
      continue;                         -- a notice, or a token that names no choice: untouched.
    end if;
    v_out   := v_out   || jsonb_build_object(v_at, custom.choice_render_value(e.v, p_doc -> v_at));
    v_notes := v_notes || jsonb_build_object(v_at, v_note);
  end loop;

  if v_notes <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_choices', v_notes);
  end if;
  return v_out;
end;
$function$;

create or replace function custom.choice_render(p_organization_id uuid, p_table_id uuid, p_doc jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or p_table_id is null then
    return p_doc;
  end if;
  -- STORE-READ-PERF-2: the rule lives in custom.choice_render_with; this is it with the Table's
  -- plan looked up here, for a caller that renders one document. The set doors carry the plan.
  return custom.choice_render_with(p_organization_id, p_table_id, p_doc,
           custom.choice_render_plan(p_organization_id, p_table_id));
end;
$function$;

-- ── 4. A DOCUMENT WITH NO WHOLE VALUE IN A FILE COSTS NOTHING ────────────────────────────────
-- custom.with_whole_value_pointers ran custom.whole_value_pointer_of for every visible key of
-- every record — 1,600 calls on a 200-row page — although a pointer exists only where a source
-- says `whole_value_in_file` with a file id. When no source says so, every pointer is null and
-- the answer is the document untouched; that is now decided first, in one scan of the sources.
create or replace function custom.with_whole_value_pointers(p_document jsonb, p_values jsonb, p_sources jsonb, p_visible text[], p_by_id boolean default false, p_key_ids jsonb default '{}'::jsonb)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select case
    when not (jsonb_typeof(p_values) = 'object'
              and jsonb_typeof(p_sources) = 'object'
              and exists (select 1 from jsonb_each(p_sources) s0
                           where s0.value ->> 'kind' = 'whole_value_in_file'
                             and coalesce(s0.value ->> 'file_id', '') <> ''))
      then p_document
    else (
  with p as (
    select case when p_by_id then coalesce(p_key_ids ->> e.key, e.key) else e.key end as k,
           e.value ->> 'src' as ptr,
           custom.whole_value_pointer_of(p_values, p_sources, e.key) as pointer
      from jsonb_each(case when jsonb_typeof(p_values) = 'object' then p_values else '{}'::jsonb end) e
     where e.key = any (coalesce(p_visible, '{}'::text[]))
  ), w as (
    select jsonb_object_agg(k, jsonb_build_object('src', ptr)) as vals,
           jsonb_object_agg(ptr, pointer) as srcs
      from p where pointer is not null
  )
  select case
           when w.vals is null then p_document
           else p_document || jsonb_build_object(
             '_values', coalesce(p_document -> '_values', '{}'::jsonb) || w.vals,
             '_sources', coalesce(p_document -> '_sources', '{}'::jsonb) || (
               select jsonb_object_agg(s.key, coalesce(p_document -> '_sources' -> s.key, '{}'::jsonb) || s.value)
                 from jsonb_each(w.srcs) s))
         end
    from w)
  end;
$function$;

-- ── 5. THE MASK AT A RUNG THE CALLER ALREADY HOLDS ────────────────────────────────────────────
-- custom.read_mask worked out the record's rung (custom.effective_level) and asked the one mask
-- door. custom.read_mask_at is that body with the rung optionally handed in by a door that has
-- already answered it for the whole set (custom.levels_of). It keeps `all_key_ids`;
-- custom.read_mask strips it exactly as before, so its answer does not move.
create function custom.read_mask_at(p_record_id uuid, p_level_given boolean, p_level public.permission_level,
                                    p_action text default 'read')
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_me    uuid := auth.uid();
  v_table uuid;
  v_org   uuid;
begin
  -- THE MASK IS TAKEN IN THE RECORD'S OWN ORGANIZATION (2026-09-23) — see custom.read_mask.
  select r.table_id, r.organization_id into v_table, v_org
    from custom.record r
   where r.id = p_record_id;
  if v_table is null then
    -- A record with no Table (a Home) declares no Fields, so nothing is masked and nothing
    -- is claimed. The caller's own door has already decided whether they may read it.
    return jsonb_build_object('table_id', null, 'level', null,
                              'visible', '[]'::jsonb, 'declared', '[]'::jsonb,
                              'notices', '{}'::jsonb, 'key_ids', '{}'::jsonb,
                              'undeclared_ride_along', true);
  end if;
  return custom.read_mask_for(v_me, v_org, v_table,
                              case when p_level_given then p_level
                                   else custom.effective_level(v_me, v_org, p_record_id) end,
                              p_action);
end;
$function$;

create or replace function custom.read_mask(p_organization_id uuid, p_record_id uuid, p_action text default 'read')
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  -- READ-MASK-ONCE (2026-09-25): the LEVEL is this record's and the FIELDS at that level are the
  -- one door's answer. STORE-READ-PERF-2: the body is custom.read_mask_at, asked here with the
  -- rung left for it to work out; the organization passed in still decides nothing.
  return custom.read_mask_at(p_record_id, false, null, p_action) - 'all_key_ids';
end;
$function$;


-- ── 6. THE ONE READ DOOR, WITH THE SET'S ANSWERS HANDED IN ───────────────────────────────────
-- custom._read_record_with is custom.read_record's body verbatim except that (a) a rung and a
-- viewer answer the calling door already worked out for the whole set are used instead of asked
-- again, and (b) the Table's value and choice plans are carried in o_cache. With nothing handed in
-- it asks exactly what custom.read_record asked, in the same order, and custom.read_record is now
-- that call.
CREATE FUNCTION custom._read_record_with(p_organization_id uuid, p_record_id uuid, p_by_id boolean, p_levels jsonb, p_cache jsonb, OUT o_doc jsonb, OUT o_cache jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_table    uuid;
  v_doc      jsonb;
  v_mask     jsonb;
  v_visible  text[];
  v_declared text[];
  v_now      uuid;
  v_alts     jsonb;
  v_retired  jsonb;
  v_out      jsonb;
  v_wv_values  jsonb;
  v_wv_sources jsonb;
  v_row      custom.record;
  v_vs       record;
  v_ck       text;
  v_known    boolean;
begin
  o_cache := coalesce(p_cache, '{}'::jsonb);
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  -- ARGS-RULED (2026-09-21). THE WALL IS DECIDED FIRST, AND IT WAS NOT DECIDED AT ALL.
  -- REC-29: "organizations are hard walls, and a door decides who may reach one before it
  -- decides anything else" — every other door in this store obeys it and DOOR-1, the one read
  -- door, did not. It made no membership decision about the organization it was handed.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_record');

  -- REC-21 / T5. THE ID A MERGE SENT SOMEWHERE ELSE — a redirect, never a silent substitution.
  v_now := custom.resolve_id(p_organization_id, p_record_id);
  -- STORE-READ-PERF-2: a set door that already asked the ladder about this record for the whole
  -- set (custom.levels_of) hands the answer in; alone, the door asks it here as it always did.
  v_known := coalesce(p_levels ? v_now::text, false);

  -- AND THE LADDER BEFORE EXISTENCE. This used to raise 02000 "there is no record % in this
  -- organization" BEFORE asking custom.has_visibility, so the two answers differed: a caller who
  -- guessed a record uuid learned whether it existed in that organization (02000) or not
  -- (42501). One bit per guess, and the store's own rule is that a record you may not open and a
  -- record that is not there answer the same thing. `custom.has_visibility` answers false for an
  -- id that is not there, so this ordering makes the two identical without a second read.
  if not (case when v_known then (p_levels -> v_now::text ->> 's')::boolean
               else custom.has_visibility(v_me, 'record', v_now, 'viewer') end) then
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an agent, not an export. Ask somebody who holds it to share it with you.';
  end if;

  select r.* into v_row
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_now and r.deleted_at is null;
  if not found then
    -- Only somebody the ladder has already admitted reaches this sentence, so it now tells a
    -- person who holds the record that it is in the trash — and tells a stranger nothing.
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000', hint = 'It was deleted, or it never existed here.';
  end if;
  v_table := v_row.table_id;
  v_wv_values := v_row.data -> '_values';
  v_wv_sources := v_row.data -> '_sources';
  -- custom.record_values_of(r), with the Table's plan carried from record to record.
  select * into v_vs from custom.record_values_step(v_row, o_cache);
  v_doc := v_vs.o_doc;
  o_cache := v_vs.o_cache;

  -- THE ONE FACT. `custom.read_mask` is the whole of what this door used to work out privately.
  v_mask := custom.read_mask_at(v_now, v_known, (p_levels -> v_now::text ->> 'l')::public.permission_level, 'read')
            - 'all_key_ids';
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;

  v_out := custom.mask_document(v_doc, v_visible, v_mask -> 'notices', p_by_id,
                                v_mask -> 'key_ids', v_declared);

  -- CHOICE-VALUE. Rendered AFTER masking, so a field this reader may not see keeps its notice
  -- and is never resolved.
  if v_table is not null then
    v_ck := 'cr:' || p_organization_id::text || ':' || v_table::text;
    if not (o_cache ? v_ck) then
      o_cache := o_cache || jsonb_build_object(v_ck, custom.choice_render_plan(p_organization_id, v_table));
    end if;
    v_out := custom.choice_render_with(p_organization_id, v_table, v_out, o_cache -> v_ck);
  end if;

  -- BIG-VALUES-READERS. A value too big for one cell keeps its first words here and its whole
  -- text in a file; the pointer (`_values.<key>.src` -> `_sources.<ptr>`, the file fields only)
  -- rides along for the keys this reader may see, so a screen opens the file and an agent's
  -- context reads the whole text. Nothing else of the provenance block is carried.
  v_out := custom.with_whole_value_pointers(v_out, v_wv_values, v_wv_sources, v_visible, p_by_id,
                                            v_mask -> 'key_ids');

  -- T5 / REC-N-11. THE ALTERNATES THE MERGE KEPT — only for keys this reader may see.
  select jsonb_object_agg(k, alts) into v_alts
    from (
      select e.key as k,
             (select jsonb_agg(jsonb_build_object(
                       'value',  a -> 'value',
                       'rank',   a -> 'rank',
                       'source', r.data -> '_sources' -> (a ->> 'src'))
                     order by (a ->> 'rank')::int)
                from jsonb_array_elements(coalesce(e.value -> 'alternates', '[]'::jsonb)) a) as alts
        from custom.record r
        cross join lateral jsonb_each(coalesce(r.data -> '_values', '{}'::jsonb)) e
       where r.organization_id = p_organization_id and r.id = v_now
         and e.key = any (v_visible)
         and jsonb_array_length(coalesce(e.value -> 'alternates', '[]'::jsonb)) > 0
    ) x
   where x.alts is not null;

  if v_alts is not null and v_alts <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_alternates', v_alts);
  end if;

  -- SEAT-SUITES / T5+T12. THE VALUES THE STORE KEPT AND THE DOOR THREW AWAY, masked exactly
  -- like the value they used to be.
  select jsonb_agg(x order by x ->> 'key') into v_retired
    from custom.record r
    cross join lateral jsonb_array_elements(coalesce(r.data -> '_retired', '[]'::jsonb)) x
   where r.organization_id = p_organization_id and r.id = v_now
     and ((x ->> 'key') = any (v_visible) or not ((x ->> 'key') = any (v_declared)));

  if v_retired is not null and jsonb_array_length(v_retired) > 0 then
    v_out := v_out || jsonb_build_object('_retired', v_retired);
  end if;

  if v_now is distinct from p_record_id then
    v_out := v_out || jsonb_build_object(
      '_redirected_from', p_record_id,
      '_redirect_says', 'That record was merged into this one, so its id now answers with this record. REC-21: the merged id resolves to the survivor for good — undoing the merge puts both records and both ids back.');
  end if;

  o_doc := v_out;
end;
$function$;


create or replace function custom.read_record(p_organization_id uuid, p_record_id uuid, p_by_id boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  -- DOOR-1. The whole door — the organization wall, the merge redirect, the ladder before
  -- existence, the one mask, the choice words, the whole-value pointers, the alternates and the
  -- retired values — is custom._read_record_with; alone, nothing is handed in and it asks every
  -- question itself, exactly as this body did.
  return (select w.o_doc from custom._read_record_with(p_organization_id, p_record_id, p_by_id,
                                                       '{}'::jsonb, '{}'::jsonb) w);
end;
$function$;


-- ── 7. THE SET DOORS ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.read_records_by_ids(p_organization_id uuid, p_table_id uuid, p_record_ids uuid[], p_by_id boolean DEFAULT false)
 RETURNS TABLE(id uuid, document jsonb, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_set      record;
  v_mask     jsonb;
  v_visible  text[];
  v_declared text[];
  v_n        integer := coalesce(cardinality(p_record_ids), 0);
  v_rows     custom.record[];
  v_row      custom.record;
  v_levels   jsonb;
  v_cache    jsonb := '{}'::jsonb;
  v_vs       record;
  v_cr       jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records_by_ids');

  -- NOTHING ASKED FOR IS NOT AN ERROR — it is an empty answer, and it costs nothing.
  if v_n = 0 then
    return;
  end if;

  -- THE SAME CEILING THE PAGE DOORS DECLARE, and it refuses above it by name rather than
  -- handing back a short list the caller cannot tell from a complete one.
  perform custom.page_size(p_organization_id, 'custom.read_records_by_ids', v_n, 200);

  -- STEP 1, ONCE: THE ONE LADDER decides WHICH rows. Identical call, identical arguments to
  -- the page door's. This is the question that must never be asked twice in two ways.
  v_set := custom.visible_set(v_me, p_organization_id, p_table_id, 'viewer'::public.permission_level);

  if v_set.o_fallback then
    raise notice '%', v_set.o_note;
  end if;

  -- STORE-READ-PERF-2: the rows first, in the door's own order, so the ladder can be asked about
  -- the whole set at once (custom.levels_of) instead of once per row inside custom.read_mask.
  select coalesce(array_agg(r order by r.created_at desc, r.id), '{}'::custom.record[]) into v_rows
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = p_table_id
       and r.deleted_at is null
       and r.id = any (p_record_ids)
       and ( case
               -- The ladder could not answer in a bounded way, so each row is asked directly —
               -- `read_records`' fallback arm, and the same single call.
               when v_set.o_fallback then
                 custom.has_visibility(v_me, 'record', r.id, 'viewer')
               -- Every live row of this Table is hers.
               when v_set.o_all_visible then
                 true
               -- A class she holds, WITH EXCEPTIONS: a granted id is never answered by its
               -- class (VIS-19), and containment only ever adds (VIS-6).
               when coalesce(array_length(v_set.o_true_visibility, 1), 0) > 0 then
                 ( r.created_by = v_me
                   or (r.visibility = any (v_set.o_true_visibility)
                       and not (r.id = any (v_set.o_granted_all)))
                   or r.id = any (v_set.o_granted_visible)
                   or r.id = any (v_set.o_carried_visible) )
               -- Nothing by class — `shared_only`, or a Table nobody shared with her.
               else
                 ( r.created_by = v_me
                   or r.id = any (v_set.o_granted_visible)
                   or r.id = any (v_set.o_carried_visible) )
             end )
  ;
  v_levels := custom.levels_of(v_me, (select array_agg(x.id) from unnest(v_rows) x));

  foreach v_row in array v_rows
  loop
    select * into v_vs from custom.record_values_step(v_row, v_cache);
    v_cache := v_vs.o_cache;
    if v_cr is null then
      v_cr := custom.choice_render_plan(p_organization_id, p_table_id);
    end if;
    -- STEP 2, PER ROW: THE ONE MASK decides which FIELDS of it she may see, at the level she
    -- holds ON THIS RECORD. The same call `custom.read_record` makes for its one row.
    -- The row is in p_organization_id and p_table_id (the query above says so), which is the
    -- organization and Table custom.read_mask took the mask in; the rung is the set's answer.
    v_mask := custom.read_mask_for(v_me, p_organization_id, p_table_id,
                                   (v_levels -> v_row.id::text ->> 'l')::public.permission_level, 'read')
              - 'all_key_ids';
    select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
      from jsonb_array_elements(v_mask -> 'visible') x;
    select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
      from jsonb_array_elements(v_mask -> 'declared') x;

    id := v_row.id;
    document := custom.choice_render_with(p_organization_id, p_table_id,
                  custom.mask_document(v_vs.o_doc, v_visible, v_mask -> 'notices', p_by_id,
                                       v_mask -> 'key_ids', v_declared), v_cr);
    -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
    document := custom.with_whole_value_pointers(document, v_row.data -> '_values', v_row.data -> '_sources', v_visible, p_by_id, v_mask -> 'key_ids');
    level := (v_mask ->> 'level')::public.permission_level;
    return next;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.read_records_matching(p_organization_id uuid, p_table_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, document jsonb, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_mask     jsonb;
  v_limit    integer;
  v_sql      text;
  v_gone     jsonb;
  v_cache    jsonb := '{}'::jsonb;
  v_vs       record;
  v_cr       jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  -- THE ORGANIZATION WALL, FIRST, AND IN THIS DOOR'S OWN BODY. `custom.record_aggregate` —
  -- the door that COUNTS the number this one opens — asks exactly this on its first line, and
  -- its twin asking less would mean a number and its rows were judged by two different sets of
  -- questions. It also answers the store's own switch: a caller reaching a closed store is
  -- refused before a Table id is even looked at.
  --
  -- 🚨 AND IT IS WHAT MAKES THE ROW DECISION READABLE FROM THIS BODY (check:store-doors-decide,
  -- 2026-09-22). This door decides every row through `custom.visible_predicate_sql`, which asks
  -- `custom.visible_set` — the one ladder — and writes its four arms into this door's own WHERE.
  -- That is a real decision, but it happens through a helper and inside a generated statement,
  -- so a census reading this body found no ladder call in it and said so. A door whose access
  -- decision cannot be READ off it is one refactor away from a door that does not make one.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_records_matching');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records_matching');
  v_limit := custom.page_size(p_organization_id, 'custom.read_records_matching', p_limit, 200);

  -- STEP 2, once per request: which fields this caller may see, at which level. The level
  -- used for the field question is the caller's level on the TABLE, so a page of a hundred
  -- records asks the field question once, not a hundred times.
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);

  -- READ-MASK-ONCE: the field mask is the one door's answer, asked once per statement for this
  -- (person, organization, Table, level) and memoised — never worked out here a second way.
  v_mask := custom.read_mask_for(v_me, p_organization_id, p_table_id, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;
  -- Only the fields that are actually hidden carry a notice; every declared field carries its id.
  v_notices := v_mask -> 'notices';
  v_key_ids := v_mask -> 'all_key_ids';

  -- STEP 1, ONCE: Visibility, and the caller's question, in the SAME where clause.
  -- `custom.visible_predicate_sql` asks `custom.visible_set` once and writes out the same
  -- four arms `custom.read_records` branches on, as a predicate the planner can drive an
  -- index with. `custom.record_filter_sql` writes the caller's question the one way this
  -- database writes it. Neither the caller's keys nor the caller's values ever become SQL:
  -- a key is refused by shape (custom.agg_assert_key), a value is a quoted literal, and a
  -- moment in a window is cast to timestamptz in this transaction before the statement is
  -- built.
  v_sql := format($q$
    select r.id, r as rw, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources, r.data -> '_sources' as src
      from custom.record r
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %s
       and %s
     order by r.created_at desc, r.id
     limit %s offset %s
  $q$,
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r'),
    -- CHOICE-VALUE. A chart hands back the RENDERED word of a dropdown and the store holds
    -- the key, so the filter is normalised to what is STORED before the statement is built —
    -- the same one line `custom.record_aggregate` runs before it counts.
    --
    -- S2-PRIME FILTER-GROUPS: the question comes in either shape. A flat map is normalised as
    -- before; a Rule expression ({op, args}, ALL / ANY / NOT to any depth) is compiled by the
    -- same one fragment the aggregate and the board write, over this reader's visible columns.
    custom.record_filter_sql(p_organization_id, p_table_id,
      case when custom.filter_is_rule(p_filter) then p_filter
           else custom.choice_filter_normalize(custom.choice_field_map(p_organization_id, p_table_id), p_filter) end),
    v_limit, greatest(coalesce(p_offset, 0), 0));

  for v_rec in execute v_sql loop
    -- STORE-READ-PERF-2: custom.record_values_of(r) and custom.choice_render with the Table's
    -- plans carried from row to row instead of asked again on every row.
    select * into v_vs from custom.record_values_step(v_rec.rw, v_cache);
    v_cache := v_vs.o_cache;
    if v_cr is null then
      v_cr := custom.choice_render_plan(p_organization_id, p_table_id);
    end if;
    id := v_rec.id;
    document := custom.choice_render_with(p_organization_id, p_table_id,
                  custom.mask_document(v_vs.o_doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared), v_cr);
    -- GRID-TAILS: a relation to a record that no longer exists says so. `record_values_of`
    -- strips `_sources` (provenance is not a value), and with it went the one fact the grid
    -- needs: WHICH cell moved empty because what it pointed at was gone. Only that fact comes
    -- back, only for columns this reader may see, keyed the way the document is keyed.
    v_gone := custom.unresolved_sources_of(v_rec.src, v_visible, p_by_id, v_key_ids);
    if v_gone is not null then
      document := document || jsonb_build_object('_sources', v_gone);
    end if;
    -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
    document := custom.with_whole_value_pointers(document, v_rec.wv_values, v_rec.wv_sources, v_visible, p_by_id, v_key_ids);
    level := v_level;
    return next;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.read_records(p_organization_id uuid, p_table_id uuid, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, document jsonb, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_mask     jsonb;
  v_set      record;
  v_cache    jsonb := '{}'::jsonb;
  v_vs       record;
  v_cr       jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records');
  p_limit := custom.page_size(p_organization_id, 'custom.read_records', p_limit, 200);

  -- STEP 2, once per table per request: which fields this caller may see, at which level.
  -- The level used for the field question is the caller's level on the TABLE, so a page of
  -- a hundred records asks the field question once, not a hundred times (DOOR-10's shape).
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);

  -- READ-MASK-ONCE: the field mask is the one door's answer, asked once per statement for this
  -- (person, organization, Table, level) and memoised — never worked out here a second way.
  v_mask := custom.read_mask_for(v_me, p_organization_id, p_table_id, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;
  -- Only the fields that are actually hidden carry a notice; every declared field carries its id.
  v_notices := v_mask -> 'notices';
  v_key_ids := v_mask -> 'all_key_ids';

  -- STEP 1, ONCE: Visibility. `custom.visible_set` asks the ONE ladder a bounded number of
  -- times — once per visibility class, once per granted id, once per container — and hands back
  -- a predicate the planner can drive an index with. The comment this door used to carry is now
  -- true of the code under it (VIS-N-1; DOOR-10: filtered INSIDE the query, never post-filtered).
  v_set := custom.visible_set(v_me, p_organization_id, p_table_id, 'viewer'::public.permission_level);

  if v_set.o_fallback then
    raise notice '%', v_set.o_note;
    for v_rec in
      select r.id, r as rw, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources
        from custom.record r
       where custom.has_visibility(v_me, 'record', r.id, 'viewer')
         and r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
       order by r.created_at desc, r.id
       limit p_limit offset p_offset
    loop
      select * into v_vs from custom.record_values_step(v_rec.rw, v_cache);
      v_cache := v_vs.o_cache;
      if v_cr is null then
        v_cr := custom.choice_render_plan(p_organization_id, p_table_id);
      end if;
      id := v_rec.id;
      document := custom.choice_render_with(p_organization_id, p_table_id,
                    custom.mask_document(v_vs.o_doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared), v_cr);
      -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
      document := custom.with_whole_value_pointers(document, v_rec.wv_values, v_rec.wv_sources, v_visible, p_by_id, v_key_ids);
      level := v_level;
      return next;
    end loop;

  elsif v_set.o_all_visible then
    -- THE ORDINARY PAGE. Every live row of this Table is this caller's to see, so the scan
    -- carries no visibility predicate at all and the LIMIT stops it at p_limit rows.
    for v_rec in
      select r.id, r as rw, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
       order by r.created_at desc, r.id
       limit p_limit offset p_offset
    loop
      select * into v_vs from custom.record_values_step(v_rec.rw, v_cache);
      v_cache := v_vs.o_cache;
      if v_cr is null then
        v_cr := custom.choice_render_plan(p_organization_id, p_table_id);
      end if;
      id := v_rec.id;
      document := custom.choice_render_with(p_organization_id, p_table_id,
                    custom.mask_document(v_vs.o_doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared), v_cr);
      -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
      document := custom.with_whole_value_pointers(document, v_rec.wv_values, v_rec.wv_sources, v_visible, p_by_id, v_key_ids);
      level := v_level;
      return next;
    end loop;

  elsif coalesce(array_length(v_set.o_true_visibility, 1), 0) > 0 then
    -- A CLASS THIS CALLER HOLDS, WITH EXCEPTIONS. A granted id is never answered by its class:
    -- a grant addressed to this person on that record replaces what membership confers (VIS-19),
    -- so it is excluded from the class arm and admitted only by its own answer. Containment is a
    -- separate arm and only ever adds (VIS-6).
    for v_rec in
      select r.id, r as rw, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and ( r.created_by = v_me
            or (r.visibility = any (v_set.o_true_visibility) and not (r.id = any (v_set.o_granted_all)))
            or r.id = any (v_set.o_granted_visible)
            or r.id = any (v_set.o_carried_visible) )
       order by r.created_at desc, r.id
       limit p_limit offset p_offset
    loop
      select * into v_vs from custom.record_values_step(v_rec.rw, v_cache);
      v_cache := v_vs.o_cache;
      if v_cr is null then
        v_cr := custom.choice_render_plan(p_organization_id, p_table_id);
      end if;
      id := v_rec.id;
      document := custom.choice_render_with(p_organization_id, p_table_id,
                    custom.mask_document(v_vs.o_doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared), v_cr);
      -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
      document := custom.with_whole_value_pointers(document, v_rec.wv_values, v_rec.wv_sources, v_visible, p_by_id, v_key_ids);
      level := v_level;
      return next;
    end loop;

  else
    -- NOTHING THIS CALLER HOLDS BY CLASS — `shared_only`, or a Table nobody shared with them.
    -- What is left is small and named: the rows this person made, the rows somebody gave them,
    -- and the rows a container they reach carries.
    for v_rec in
      select r.id, r as rw, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and ( r.created_by = v_me
            or r.id = any (v_set.o_granted_visible)
            or r.id = any (v_set.o_carried_visible) )
       order by r.created_at desc, r.id
       limit p_limit offset p_offset
    loop
      select * into v_vs from custom.record_values_step(v_rec.rw, v_cache);
      v_cache := v_vs.o_cache;
      if v_cr is null then
        v_cr := custom.choice_render_plan(p_organization_id, p_table_id);
      end if;
      id := v_rec.id;
      document := custom.choice_render_with(p_organization_id, p_table_id,
                    custom.mask_document(v_vs.o_doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared), v_cr);
      -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
      document := custom.with_whole_value_pointers(document, v_rec.wv_values, v_rec.wv_sources, v_visible, p_by_id, v_key_ids);
      level := v_level;
      return next;
    end loop;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.resolve_context(p_entity_type text, p_entity_id uuid, p_record_ids uuid[] DEFAULT NULL::uuid[], p_table_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me          uuid := custom.query_principal();
  v_org_id      uuid;
  v_project_id  uuid;
  v_task_id     uuid;
  v_cands       jsonb := '[]'::jsonb;   -- [{record_id, via}] in contribution order
  v_checks      jsonb := '[]'::jsonb;   -- one row per candidate: admitted or refused, and why
  v_withheld    jsonb := '[]'::jsonb;   -- a field the person may not see on an admitted record
  v_admitted    jsonb := '[]'::jsonb;   -- [{record_id, organization_id, table_id, name, type_label, via}]
  v_tables      jsonb := '[]'::jsonb;
  v_scope_labels jsonb := '{}'::jsonb;
  v_variables   jsonb := '{}'::jsonb;
  v_sources     jsonb := '{}'::jsonb;
  v_cells       jsonb := '{}'::jsonb;
  v_cell        jsonb;
  v_where       jsonb;
  v_doc         jsonb;
  v_hidden      jsonb;
  v_table       custom.record;
  v_title_field text;
  v_label       text;
  v_name        text;
  v_inject      text;
  v_org         uuid;
  v_rec         uuid;
  v_via         text;
  v_versions    jsonb;
  c             jsonb;
  v_cap         bigint;
  v_val         jsonb;
  v_whole       jsonb;
  a             jsonb;
  f             record;
  rec           record;
  v_levels      jsonb;
  v_rcache      jsonb := '{}'::jsonb;
begin
  if v_me is null then
    raise exception 'custom.resolve_context resolves context for a person, and nobody is signed in.'
      using errcode = '42501',
            hint = 'The server calls this door acting as the person operating the agent (DOOR-1).';
  end if;

  -- ── THE ENTITY: where the turn lives (read exactly as public.resolve_full_context reads it) ─
  if p_entity_type = 'task' then
    select t.project_id, p.organization_id, t.id
      into v_project_id, v_org_id, v_task_id
      from workspace.tasks t left join workspace.projects p on t.project_id = p.id
     where t.id = p_entity_id;
  elsif p_entity_type = 'project' then
    select p.organization_id, p.id into v_org_id, v_project_id
      from workspace.projects p where p.id = p_entity_id;
  elsif p_entity_type = 'conversation' then
    select c2.organization_id,
           (select a2.target_id from platform.associations_live a2
             where a2.source_type = 'conversation' and a2.source_id = c2.id
               and a2.target_type = 'project' and a2.organization_id = c2.organization_id
             order by a2.position nulls last, a2.created_at, a2.id limit 1),
           c2.task_id
      into v_org_id, v_project_id, v_task_id
      from chat.conversation c2 where c2.id = p_entity_id;
  elsif p_entity_type = 'note' then
    select n.organization_id,
           (select a2.target_id from platform.associations_live a2
             where a2.source_type = 'note' and a2.source_id = n.id and a2.target_type = 'project'
             order by a2.position nulls last, a2.created_at, a2.id limit 1),
           (select a2.target_id from platform.associations_live a2
             where a2.source_type = 'note' and a2.source_id = n.id and a2.target_type = 'task'
             order by a2.position nulls last, a2.created_at, a2.id limit 1)
      into v_org_id, v_project_id, v_task_id
      from workbench.notes n where n.id = p_entity_id;
  end if;

  -- ── THE CANDIDATES, in the old resolver's own order: the entity's tags, else its project's,
  --    then the selection. A tag is read by its TARGET ID whichever token the edge carries —
  --    `scope` today, its copy `record` (SC-4 P4, role context_tag; `custom_record` is the retired
  --    tier-2 token, read too so an edge under either store token is the same tag: grouped by
  --    target id, one candidate) (same id, CUT-4) — and in
  --    ANY organization, because the edge belongs to the entity's organization and the record
  --    to its own (Brightline's task, Harborline's app).
  select coalesce(jsonb_agg(jsonb_build_object('record_id', t.target_id, 'via', 'entity_tag') order by t.first_at, t.target_id), '[]'::jsonb)
    into v_cands
    from (select a2.target_id, min(a2.created_at) as first_at
            from platform.associations_live a2
           where a2.source_type = p_entity_type and a2.source_id = p_entity_id
             and a2.target_type in ('scope', 'record', 'custom_record')
           group by a2.target_id) t;

  if jsonb_array_length(v_cands) = 0 and v_project_id is not null and p_entity_type <> 'project' then
    select coalesce(jsonb_agg(jsonb_build_object('record_id', t.target_id, 'via', 'project_tag') order by t.first_at, t.target_id), '[]'::jsonb)
      into v_cands
      from (select a2.target_id, min(a2.created_at) as first_at
              from platform.associations_live a2
             where a2.source_type = 'project' and a2.source_id = v_project_id
               and a2.target_type in ('scope', 'record', 'custom_record')
             group by a2.target_id) t;
  end if;

  if p_record_ids is not null then
    select v_cands || coalesce(jsonb_agg(jsonb_build_object('record_id', s.id, 'via', 'selection') order by s.ord), '[]'::jsonb)
      into v_cands
      from unnest(p_record_ids) with ordinality as s(id, ord)
     where s.id is not null
       and not (v_cands @> jsonb_build_array(jsonb_build_object('record_id', s.id)));
  end if;

  -- ── EVERY CANDIDATE CHECKED FOR THE PERSON — the one rule changed on purpose ──────────────
  -- The old resolver checked only the selection; a tag and a project's tag delivered every
  -- cell to whoever ran the turn. Here each record, however it arrived, is asked through
  -- custom.where_id_opens: organization members, direct and outside grants, and (P7's read
  -- arm) a scope membership on that record. What is refused is NAMED in `checks`, never
  -- dropped in silence.
  -- STORE-READ-PERF-2: the ladder is asked about every candidate at once, for the person the read
  -- door reads as (auth.uid(), as custom.read_record does), and each read below is handed its
  -- answer; the Table's value and choice plans ride from one record to the next in v_rcache.
  v_levels := custom.levels_of(auth.uid(),
                (select array_agg((e ->> 'record_id')::uuid) from jsonb_array_elements(v_cands) e));
  for c in select value from jsonb_array_elements(v_cands) loop
    v_rec := (c ->> 'record_id')::uuid;
    v_via := c ->> 'via';
    v_where := custom.where_id_opens(v_rec);
    if v_where is null then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'not_opened',
        'says', 'This scope is not one you may open in the record store — it has not been shared with you, or it has not been copied into the store yet.');
      continue;
    end if;
    if v_where ->> 'kind' <> 'record' then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'not_a_record', 'kind', v_where ->> 'kind',
        'says', 'That id opens something that is not a record, so it carries no context values.');
      continue;
    end if;
    if not coalesce((v_where ->> 'live')::boolean, true) then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'in_trash', 'organization_id', v_where -> 'organization_id',
        'says', 'This scope''s record is in the trash, so nothing is read from it until it is restored.');
      continue;
    end if;

    v_org := (v_where ->> 'organization_id')::uuid;
    begin
      select w.o_doc, w.o_cache into v_doc, v_rcache
        from custom._read_record_with(v_org, v_rec, false, v_levels, v_rcache) w;
    exception when others then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'door_refused', 'organization_id', v_org, 'sqlstate', sqlstate, 'says', sqlerrm);
      continue;
    end;

    select r.* into v_table
      from custom.record r
     where r.id = (select x.table_id from custom.record x where x.organization_id = v_org and x.id = v_rec)
       and r.table_id = custom.table_kernel_id()
     limit 1;
    v_title_field := coalesce(nullif(v_table.data ->> 'title_field', ''), 'name');
    v_label := coalesce(nullif(v_table.data ->> 'label_singular', ''), nullif(v_table.data ->> 'name', ''), 'record');
    v_name := coalesce(nullif(v_doc ->> v_title_field, ''), v_rec::text);
    v_hidden := coalesce(v_doc -> '_hidden', '{}'::jsonb);

    v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', true,
      'organization_id', v_org, 'table_id', v_table.id, 'name', v_name);
    -- THE TRIPLE, so the compare page can say which side is behind (copy lag) rather than
    -- merely that two values differ. INSPECTOR-TAILS (2026-09-25): read from the record this
    -- door has just opened for the person (custom.read_record above), the same `_values` /
    -- `_derived` / `_computed` metadata custom.record_values_versioned reads, for the same keys
    -- (the record's values plus its `_values` entries). It used to CALL that door once per
    -- record, and the door re-asked the organization wall, the record ladder and the whole field
    -- mask the read door had just answered — about 23 ms a record, 400 of the 850 ms a type of
    -- 17 scopes took. Proven identical on 70 live scope records before the swap.
    select coalesce(jsonb_object_agg(k.key, jsonb_build_object(
             'value_version', coalesce((x.data -> '_values' -> k.key ->> 'ver')::integer, 1),
             'written_at', coalesce((x.data -> '_values' -> k.key ->> 'at')::timestamptz,
                                    (x.data -> '_derived' -> k.key ->> 'at')::timestamptz,
                                    (x.data -> '_computed' -> k.key ->> 'at')::timestamptz))),
           '{}'::jsonb)
      into v_versions
      from custom.record x
      cross join lateral (
        select j.key from jsonb_object_keys(v_doc) j(key) where left(j.key, 1) <> '_'
        union
        select j.key from jsonb_object_keys(coalesce(x.data -> '_values', '{}'::jsonb)) j(key)
      ) k
     where x.organization_id = v_org and x.id = v_rec;
    -- BIG-VALUES-READERS: this organization's cap on one context value handed to an agent
    -- (0, the default, is no cap: the agent gets the whole text, exactly as the old path does).
    v_cap := custom.agent_context_value_cap(v_org);
    v_admitted := v_admitted || jsonb_build_object('record_id', v_rec, 'organization_id', v_org,
      'table_id', v_table.id, 'name', v_name, 'type_label', lower(v_label), 'via', v_via,
      'doc', v_doc - '_hidden' - '_alternates' - '_retired' - '_redirected_from' - '_redirect_says',
      'hidden', v_hidden, 'title_field', v_title_field, 'versions', v_versions, 'cap', v_cap);
  end loop;

  -- ── THE ACTIVE TABLES with no record chosen ("I'm working in Clients") — named, for the person ─
  if p_table_ids is not null then
    select coalesce(jsonb_agg(t.id), '[]'::jsonb) into v_tables
      from unnest(p_table_ids) t(id)
     where coalesce(custom.where_id_opens(t.id) ->> 'kind', '') = 'table';
  end if;

  -- ── SCOPE LABELS: every admitted record's name under its Table's singular label ────────────
  select coalesce(jsonb_object_agg(x.type_label, x.names), '{}'::jsonb)
    into v_scope_labels
    from (
      select e ->> 'type_label' as type_label,
             case when count(*) > 1 then jsonb_agg(e ->> 'name' order by e ->> 'name')
                  else to_jsonb(min(e ->> 'name')) end as names
        from jsonb_array_elements(v_admitted) e
       group by e ->> 'type_label'
    ) x;

  -- ── THE SYSTEM LANE, unchanged: System context stays its own table (§5 D10) ───────────────
  for rec in (
    select sci.id as context_item_id, sci.key, sci.description,
           sci.value_type::text as value_type, sci.value as value
      from context.deliverable_system_context_items() sci
     where sci.is_active = true and sci.deleted_at is null and sci.feed_type != 'dataset'
     order by sci.sort_order asc, sci.key asc
  ) loop
    continue when rec.value is null;
    v_cell := jsonb_build_object(
      'key', rec.key, 'value', rec.value, 'type', rec.value_type, 'description', rec.description,
      'context_item_id', rec.context_item_id,
      'scope_id', null, 'scope_name', 'System', 'scope_type_id', null, 'source', 'system');
    v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
      'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
      'source', 'system', 'description', rec.description,
      'cells', coalesce(v_variables -> rec.key -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell)));
    v_sources := v_sources || jsonb_build_object(rec.key, 'system');
    v_cells := v_cells || jsonb_build_object(rec.context_item_id::text,
      coalesce(v_cells -> rec.context_item_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
  end loop;

  for rec in (
    select sci.id as context_item_id, sci.key, sci.description, sci.display_name,
           sci.feed_config as feed_config
      from context.deliverable_system_context_items() sci
     where sci.is_active = true and sci.deleted_at is null and sci.feed_type = 'dataset'
       and sci.feed_config ? 'data_store_id'
     order by sci.sort_order asc, sci.key asc
  ) loop
    v_cell := jsonb_build_object(
      'key', rec.key,
      'value', jsonb_build_object('kind', 'dataset',
          'data_store_id', rec.feed_config->>'data_store_id',
          'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
          'short_code', rec.feed_config->>'data_store_short_code'),
      'type', 'dataset', 'description', rec.description,
      'context_item_id', rec.context_item_id,
      'scope_id', null, 'scope_name', 'System', 'scope_type_id', null, 'source', 'system');
    v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
      'value', jsonb_build_object('kind', 'dataset',
          'data_store_id', rec.feed_config->>'data_store_id',
          'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
          'short_code', rec.feed_config->>'data_store_short_code',
          'hint', 'Knowledge resource — query it with the RAG tools, e.g. knowledge_search(data_store_id=<data_store_id>).'),
      'type', 'dataset', 'inject_as', 'reference', 'source', 'system', 'description', rec.description,
      'cells', coalesce(v_variables -> rec.key -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell)));
    v_sources := v_sources || jsonb_build_object(rec.key, 'system');
    v_cells := v_cells || jsonb_build_object(rec.context_item_id::text,
      coalesce(v_cells -> rec.context_item_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
  end loop;

  -- ── THE RECORDS' FIELDS: every declared Field of each admitted record, except its title and a
  --    Field declared `exclude` — in Table, Field and record order, as the old resolver orders
  --    scope type, context item and scope. A Field this person may not see is WITHHELD and
  --    named; a relation (a reference) moves to the on-demand tier, where DYN-17 says it belongs
  --    — the one declared tier move.
  for rec in (
    select e.value as a, fr.id as field_id, fr.data ->> 'key' as fkey, fr.data ->> 'type' as ftype,
           fr.data ->> 'label' as flabel, fr.data ->> 'description' as fdesc,
           coalesce(nullif(fr.data ->> 'sort', '')::int, 0) as fsort
      from jsonb_array_elements(v_admitted) with ordinality e(value, ord)
      join custom.record fr
        on fr.organization_id = (e.value ->> 'organization_id')::uuid
       and fr.table_id = custom.field_kernel_id()
       and fr.deleted_at is null
       and (fr.data ->> 'entity_definition_id')::uuid = (e.value ->> 'table_id')::uuid
     where fr.data ->> 'key' is distinct from (e.value ->> 'title_field')
       and coalesce(fr.data ->> 'context_policy', 'include') <> 'exclude'
     order by e.value ->> 'type_label', coalesce(nullif(fr.data ->> 'sort', '')::int, 0),
              e.value ->> 'name', e.value ->> 'record_id'
  ) loop
    a := rec.a;
    if (a -> 'hidden') ? rec.fkey then
      v_withheld := v_withheld || jsonb_build_object(
        'record_id', a -> 'record_id', 'record_name', a -> 'name', 'key', rec.fkey,
        'reason', coalesce(a -> 'hidden' -> rec.fkey ->> 'reason', 'this field is not visible at your level'));
      continue;
    end if;
    continue when (a -> 'doc' -> rec.fkey) is null or jsonb_typeof(a -> 'doc' -> rec.fkey) = 'null';
    v_inject := case when rec.ftype in ('relation', 'entity_reference') then 'tool_accessible' else 'direct' end;
    -- BIG-VALUES-READERS: what the agent is handed for this value. A value kept as a file is
    -- its whole text (the store's client reads the file the door names in `whole_value`), or,
    -- under the organization's cap, its first words and the file to open — never the first
    -- words alone. A relation to files is the file reference the old path hands.
    v_val := custom.agent_context_value(a -> 'doc', rec.fkey, rec.ftype, (a ->> 'organization_id')::uuid,
                                        (a ->> 'record_id')::uuid, coalesce((a ->> 'cap')::bigint, 0));
    v_whole := v_val -> 'whole_value';
    v_val := v_val -> 'value';
    v_cell := jsonb_build_object(
      'key', rec.fkey, 'value', v_val, 'type', rec.ftype,
      'description', coalesce(rec.fdesc, rec.flabel),
      'context_item_id', rec.field_id,
      'scope_id', a -> 'record_id', 'scope_name', a -> 'name', 'scope_type_id', a -> 'table_id',
      'organization_id', a -> 'organization_id', 'via', a -> 'via',
      'value_version', a -> 'versions' -> rec.fkey -> 'value_version',
      'written_at', a -> 'versions' -> rec.fkey -> 'written_at',
      'source', 'scope:' || (a ->> 'name'))
      || case when v_whole is null then '{}'::jsonb else jsonb_build_object('whole_value', v_whole) end;
    v_variables := v_variables || jsonb_build_object(rec.fkey, jsonb_build_object(
      'value', v_val, 'type', rec.ftype, 'inject_as', v_inject,
      'source', 'scope:' || (a ->> 'name'), 'description', coalesce(rec.fdesc, rec.flabel),
      'cells', coalesce(v_variables -> rec.fkey -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell))
      || case when v_whole is null then '{}'::jsonb else jsonb_build_object('whole_value', v_whole) end);
    v_sources := v_sources || jsonb_build_object(rec.fkey, 'scope:' || (a ->> 'name'));
    v_cells := v_cells || jsonb_build_object(rec.field_id::text,
      coalesce(v_cells -> rec.field_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
  end loop;

  return jsonb_build_object(
    'scope_labels', v_scope_labels,
    'variables',    v_variables,
    'sources',      v_sources,
    'cell_values',  v_cells,
    'context', jsonb_build_object(
      'user_id', v_me, 'organization_id', v_org_id, 'project_id', v_project_id, 'task_id', v_task_id,
      'scope_ids', coalesce((select jsonb_agg(e -> 'record_id') from jsonb_array_elements(v_admitted) e), '[]'::jsonb),
      'table_ids', v_tables),
    'checks',       v_checks,
    'withheld',     v_withheld,
    'resolved_at',  extract(epoch from now()),
    'read_as',      'the person operating this agent',
    'through',      'custom.where_id_opens for every contributing record, then custom.read_record under that record''s own organization');
end;
$function$;

-- ── 8. THE THREE NEW DEFINERS ARE SERVER-ONLY DOORS (declared after they exist, DD-223) ──────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'levels_of', 'p_user_id uuid, p_ids uuid[]',
   array['uuid'::regtype, 'uuid[]'::regtype]::oid[],
   'p_user_id is the reader the CALLING door already resolved (auth.uid()); p_ids are records that door is about to read. It decides nothing on its own: for each id it answers exactly custom.effective_level and custom.has_visibility(viewer) for that reader, asking the ladder once per class of records the ladder cannot tell apart and once per record anything names.',
   'storereadperf2_the_rung_is_asked_once_per_class.sql',
   'server_only: called only inside the record store''s own definer doors (custom.read_records_by_ids, custom.resolve_context); a client reaches a record''s rung only through those doors and custom.read_record, so it needs no grant of its own.',
   false, false),
  ('custom', 'read_mask_at', 'p_record_id uuid, p_level_given boolean, p_level permission_level, p_action text',
   array['uuid'::regtype, 'boolean'::regtype, 'public.permission_level'::regtype, 'text'::regtype]::oid[],
   'p_record_id is a record the CALLING door has already admitted its reader to; p_level, when given, is the rung that door already worked out for it through custom.levels_of. It answers the field mask custom.read_mask answers, in the record''s own organization.',
   'storereadperf2_the_rung_is_asked_once_per_class.sql',
   'server_only: called only by custom.read_mask and custom._read_record_with; a client reaches the mask only through the read doors.',
   false, false),
  ('custom', '_read_record_with', 'p_organization_id uuid, p_record_id uuid, p_by_id boolean, p_levels jsonb, p_cache jsonb',
   array['uuid'::regtype, 'uuid'::regtype, 'boolean'::regtype, 'jsonb'::regtype, 'jsonb'::regtype]::oid[],
   'The body of custom.read_record (DOOR-1). p_levels carries rungs and viewer answers the calling door already asked custom.levels_of for; an id not in it is asked here exactly as custom.read_record always asked. p_cache carries the Table''s value and choice plans only.',
   'storereadperf2_the_rung_is_asked_once_per_class.sql',
   'server_only: called only by custom.read_record and custom.resolve_context; a client reads a record through custom.read_record.',
   false, false);
-- No client EXECUTE on the three definers: a new SECURITY DEFINER function is born with PUBLIC's
-- default EXECUTE cleared (ddl_guard definer_default_public_execute_cleared_at_birth) and nothing
-- here grants it.

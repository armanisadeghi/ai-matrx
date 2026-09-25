-- target: branch,production
-- additive: yes
--   It ADDS one function, custom.read_mask_for(uuid, uuid, uuid, permission_level, text)
--   (SECURITY DEFINER, STABLE, no client EXECUTE), and REPLACES nine function bodies with their
--   existing signatures, security, search_path and grants: custom.read_mask, custom.read_records,
--   custom.read_records_matching, custom.read_records_archived, custom.record_card,
--   custom.enrich_cells, custom.enrich_due, custom.record_filter_sql and
--   custom.agg_fields_readable_assert. No table, column, trigger, policy or grant is touched; no
--   row is written. Every answer is byte-identical (readmaskonce_green.sql, dev clone).
-- guard: custom/system_enabled
-- lane: READ-MASK-ONCE
-- lock: custom
--
-- WHY. custom.read_mask worked the field mask out again for EVERY record — iam.visible_field_ids
-- (one iam.may_touch_field per declared Field) plus two scans of the Table's Field records, about
-- 14 of its 18 ms — although the answer depends only on (person, organization, Table, level,
-- action). custom.resolve_context over the 17 scopes of AI Matrx -> Feature paid it 17 times
-- (INSPECTOR-TAILS § 5), and so did every custom.read_records_by_ids row, every
-- custom.record_values_versioned call and the history doors. Eight more bodies carried their own
-- copy of the same three statements.
--
-- THE FIX. ONE door, custom.read_mask_for, answers the mask for a (person, organization, Table,
-- level, action) and memoises it in the platform's statement memo (platform.memo_k_get/put): the
-- slot is stamped with the seat, the statement, the backend, the transaction id and the memo
-- generation, and the generation is bumped by the statement-level triggers already on
-- custom.record (every insert/update/delete — a Field's sensitivity, a new Field, an archived
-- Field), platform.entity_grants (a per-field share), the portal tables and the knob tables (a
-- sensitivity ceiling). So a mask is never served across a statement, a seat, a write that
-- assigned a transaction id, or a change to anything the mask reads. The LEVEL stays per record:
-- custom.read_mask still asks custom.effective_level for the record it was handed and passes that
-- level in, so a record shared at a higher rung gets that rung's mask. Every other caller now asks
-- the one door; none keeps its own copy of the visibility rule.
--
-- `key_ids` is the hidden Fields' ids (what read_mask always returned); `all_key_ids` is every
-- declared Field's id (what the page doors always used). Both are kept so no answer moves.
--
-- Inverse: migrations/inverse/readmaskonce_the_field_mask_is_asked_once_per_table_down.sql puts
-- the nine bodies back verbatim and drops custom.read_mask_for.
-- based-on: custom.read_mask(uuid, uuid, text) e513546a6ca986a30510acd487e7ceef9f8e6b78a0d0c4a065c0f2b0a09c1e71
-- based-on: custom.read_records(uuid, uuid, boolean, integer, integer) a26bb27de8a41c3dcf05982fac15c91731a313f3c153c193213ffd38e5182176
-- based-on: custom.read_records_matching(uuid, uuid, jsonb, boolean, integer, integer) 51804c15d93860a44a00c8bd727a6f5655baf8caa290124670dc6600dbb15e33
-- based-on: custom.read_records_archived(uuid, uuid, text, boolean, integer, integer) 2b5215cf56524fde8ccefa451e0632980d09184ca23f9b1b1e9e680f4b2003c5
-- based-on: custom.record_card(uuid, uuid, uuid) 9c1150e9a8de48650151b19073ad6bfd60d535440cdcca5f73e4ae52f3954504
-- based-on: custom.enrich_cells(uuid, uuid, text[], uuid[]) 942873ea61895c1dfc5f0983a97bddc469dff4d98c886fc113e57c88bf859c2d
-- based-on: custom.enrich_due(uuid, uuid, integer, boolean) de9e15e5dc9c6110bd7512c5017f66a1efa346432ec3de65c5f3e5ae10bb5067
-- based-on: custom.record_filter_sql(uuid, uuid, jsonb) d7194cb8598408aa49065dc8c3a9e79b595996bfe64afc2307b1fcecce0fde69
-- based-on: custom.agg_fields_readable_assert(uuid, uuid, text[], text) c69d8fa3f0d6007d11cf968e006119daf6f988f2ae1d0f29cc463a0afdc23f10

set local lock_timeout = '30s';

create function custom.read_mask_for(p_user_id uuid, p_organization_id uuid, p_table_id uuid,
                                                p_level public.permission_level, p_action text default 'read')
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_key      text;
  v_hit      text;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_all_ids  jsonb;
  v_out      jsonb;
begin
  if p_table_id is null then
    return jsonb_build_object('table_id', null, 'level', null,
                              'visible', '[]'::jsonb, 'declared', '[]'::jsonb,
                              'notices', '{}'::jsonb, 'key_ids', '{}'::jsonb,
                              'all_key_ids', '{}'::jsonb,
                              'undeclared_ride_along', true);
  end if;

  v_key := 'rmf:' || coalesce(p_user_id::text, '-') || ':' || coalesce(p_organization_id::text, '-')
        || ':' || p_table_id::text || ':' || coalesce(p_level::text, '-') || ':' || coalesce(p_action, '-');
  v_hit := platform.memo_k_get(v_key);
  if v_hit is not null then
    return v_hit::jsonb;
  end if;

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(p_user_id, p_organization_id, p_table_id, p_level, p_action) f;

  select coalesce(array_agg(f.data ->> 'key'), '{}'::text[]),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb)
    into v_declared, v_all_ids
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, p_action)), '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb)
    into v_notices, v_key_ids
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and not (f.data ->> 'key' = any (v_visible));

  v_out := jsonb_build_object(
    'table_id',    p_table_id,
    'level',       p_level,
    'visible',     to_jsonb(v_visible),
    'declared',    to_jsonb(v_declared),
    'notices',     v_notices,
    'key_ids',     v_key_ids,
    'all_key_ids', v_all_ids,
    'undeclared_ride_along', true);
  perform platform.memo_k_put(v_key, v_out::text);
  return v_out;
end;
$function$;
-- No client EXECUTE: a new SECURITY DEFINER function is born with PUBLIC's default EXECUTE cleared
-- (ddl_guard definer_default_public_execute_cleared_at_birth) and nothing here grants it. Only the
-- store's own definer doors call it.

create or replace function custom.read_mask(p_organization_id uuid, p_record_id uuid, p_action text default 'read')
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_me    uuid := auth.uid();
  v_table uuid;
  v_org   uuid;
begin
  -- THE MASK IS TAKEN IN THE RECORD'S OWN ORGANIZATION (2026-09-23). It used to look the record
  -- up inside p_organization_id and answer "nothing masked" when it was not there, so a person
  -- shared one record could pass THEIR OWN organization to custom.record_as_of and read every
  -- confidential field raw (found by independent review). The organization passed in no longer
  -- decides anything here; for a caller in the record's organization the answer is unchanged.
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

  -- READ-MASK-ONCE (2026-09-25). The LEVEL is this record's — a record shared at a higher rung
  -- gets that rung's mask — and the FIELDS at that level are the one door's answer, worked out
  -- once per statement for (person, organization, Table, level, action), never once per record.
  return custom.read_mask_for(v_me, v_org, v_table,
                              custom.effective_level(v_me, v_org, p_record_id), p_action)
         - 'all_key_ids';
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
      select r.id, custom.record_values_of(r) as doc, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources
        from custom.record r
       where custom.has_visibility(v_me, 'record', r.id, 'viewer')
         and r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
       order by r.created_at desc, r.id
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
      -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
      document := custom.with_whole_value_pointers(document, v_rec.wv_values, v_rec.wv_sources, v_visible, p_by_id, v_key_ids);
      level := v_level;
      return next;
    end loop;

  elsif v_set.o_all_visible then
    -- THE ORDINARY PAGE. Every live row of this Table is this caller's to see, so the scan
    -- carries no visibility predicate at all and the LIMIT stops it at p_limit rows.
    for v_rec in
      select r.id, custom.record_values_of(r) as doc, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
       order by r.created_at desc, r.id
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
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
      select r.id, custom.record_values_of(r) as doc, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources
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
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
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
      select r.id, custom.record_values_of(r) as doc, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources
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
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
      -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
      document := custom.with_whole_value_pointers(document, v_rec.wv_values, v_rec.wv_sources, v_visible, p_by_id, v_key_ids);
      level := v_level;
      return next;
    end loop;
  end if;
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
    select r.id, custom.record_values_of(r) as doc, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources, r.data -> '_sources' as src
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
    id := v_rec.id;
    document := custom.choice_render(p_organization_id, p_table_id,
                  custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
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

CREATE OR REPLACE FUNCTION custom.read_records_archived(p_organization_id uuid, p_table_id uuid, p_lane text DEFAULT 'org'::text, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, document jsonb, level permission_level, archived_at timestamp with time zone, archived_by uuid, archived_by_name text)
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
  v_lane     text := lower(coalesce(p_lane, 'org'));
  v_lane_sql text;
  v_sql      text;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;

  -- THE ORGANIZATION WALL, ASKED BY NAME, BEFORE ANYTHING IS READ. This door decided the
  -- organization through custom.assert_may_know_table and the row through a
  -- custom.visible_predicate_sql placeholder inside a `format`-built statement: both real,
  -- neither legible to a census that reads a body. custom.record_aggregate asks this same
  -- line before it builds its statement, for the same reason. The yes is memoised per
  -- transaction, so the member below pays nothing twice. (DOORS-DECIDE-3, 2026-09-22.)
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_records_archived');

  -- THE LANE IS VOCABULARY, NOT A FREE STRING. An unknown word is refused by name; answering
  -- it as 'org' would quietly show a person more than they asked for.
  if v_lane not in ('mine', 'org') then
    raise exception 'custom.read_records_archived: "%" is not a lane', p_lane
      using errcode = '22023',
            hint = 'Two lanes: "mine" (what I archived) and "org" (what anybody in this organization archived).';
  end if;

  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records_archived');
  v_limit := custom.page_size(p_organization_id, 'custom.read_records_archived', p_limit, 200);

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

  -- THE LANE, AS A PREDICATE OVER THE SET THE LADDER ALREADY ALLOWED. `mine` narrows; it
  -- cannot widen, because it is an additional conjunct beside custom.visible_predicate_sql.
  v_lane_sql := case when v_lane = 'mine'
                     then format('a.who = %L::uuid', v_me)
                     else 'true' end;

  -- ONE STATEMENT. Visibility, the lane, the archive test and the page in the same WHERE.
  -- Nothing here is built from a caller's bytes: the only interpolated values are two uuids
  -- this function resolved itself, two integers, and predicates this database wrote.
  v_sql := format($q$
    select r.id,
           custom.record_values_of(r) as doc, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources,
           r.deleted_at               as archived_at,
           a.who                      as archived_by,
           p.nm                       as archived_by_name
      from custom.record r
      cross join lateral (select custom.record_archiver(%1$L::uuid, r.id) as who) a
      left join lateral (
             select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                             nullif(u.raw_user_meta_data ->> 'full_name', ''),
                             split_part(u.email::text, '@', 1)) as nm
               from iam.organization_member m
               join auth.users u on u.id = m.user_id
              where m.organization_id = %1$L::uuid
                and m.user_id = a.who
              limit 1) p on true
     where r.organization_id = %1$L::uuid
       and r.table_id = %2$L::uuid
       and r.deleted_at is not null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %3$s
       and %4$s
     order by r.deleted_at desc, r.id
     limit %5$s offset %6$s
  $q$,
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r'),
    v_lane_sql,
    v_limit, greatest(coalesce(p_offset, 0), 0));

  for v_rec in execute v_sql loop
    id               := v_rec.id;
    document         := custom.choice_render(p_organization_id, p_table_id,
                          custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
    -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
    document := custom.with_whole_value_pointers(document, v_rec.wv_values, v_rec.wv_sources, v_visible, p_by_id, v_key_ids);
    level            := v_level;
    archived_at      := v_rec.archived_at;
    archived_by      := v_rec.archived_by;
    archived_by_name := v_rec.archived_by_name;
    return next;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.record_card(p_viewer uuid, p_organization_id uuid, p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- THE MASKED DOCUMENT FOR ONE READER, FOR ONE RECORD, WHEREVER THAT RECORD LIVES.
--
-- `custom.read_record` is the door a person opens a record of THEIR OWN organization
-- through, and it starts by asserting that organization. A record on the other side of the
-- wall fails that assertion by definition — the reader is not a member there — so following
-- a cross-organization link cannot go through it. What must NOT be re-implemented is the
-- part after the wall: the one ladder, then the level, then `iam.visible_field_ids` at that
-- level, then `custom.mask_document` with a notice per hidden key. That is this function,
-- byte for byte, and `custom.read_record` is untouched.
--
-- It decides. `custom.has_visibility` is asked about p_viewer and this record, and a reader
-- it says no to gets null rather than a document — including, and especially, a reader whose
-- only relationship to the owning organization is that somebody there linked to this record.
declare
  v_table    uuid;
  v_doc      jsonb;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_mask     jsonb;
begin
  if p_viewer is null or p_record_id is null then
    return null;
  end if;

  select r.table_id, custom.record_values(r.organization_id, r.id)
    into v_table, v_doc
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if not found then
    return null;
  end if;

  if not custom.has_visibility(p_viewer, 'record', p_record_id, 'viewer') then
    return null;
  end if;

  v_level := custom.effective_level(p_viewer, p_organization_id, p_record_id);

  -- READ-MASK-ONCE: the field mask is the one door's answer, asked once per statement for this
  -- (person, organization, Table, level) and memoised — never worked out here a second way.
  v_mask := custom.read_mask_for(p_viewer, p_organization_id, v_table, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;
  v_notices := v_mask -> 'notices';
  v_key_ids := v_mask -> 'key_ids';

  return custom.mask_document(v_doc, v_visible, v_notices, false, v_key_ids, v_declared);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.enrich_cells(p_organization_id uuid, p_table_id uuid, p_field_keys text[] DEFAULT NULL::text[], p_record_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(record_id uuid, field_key text, agent_owned boolean, value jsonb, value_version integer, actor text, on_behalf_of text, written_at timestamp with time zone, source jsonb, absent_reason text, alternates jsonb, pinned boolean, stale boolean, due_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := auth.uid();
  v_seen  text[];
  v_level public.permission_level;
  v_mask  jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.enrich_cells');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.enrich_cells');

  v_level := custom.my_level(p_organization_id, p_table_id, 'table');
  -- READ-MASK-ONCE: the columns this caller may read are the one mask's answer.
  v_mask := custom.read_mask_for(v_me, p_organization_id, p_table_id,
                                 coalesce(v_level, 'viewer'::public.permission_level), 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_seen
    from jsonb_array_elements(v_mask -> 'visible') x;

  return query
  with fields as (
    select f.data ->> 'key' as fkey,
           f.data ->> 'source' = 'agent' as owned,
           nullif(f.data ->> 'review_interval_days', '')::integer as every
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and nullif(f.data ->> 'key', '') is not null
       -- MASKED IS MASKED. A field this caller may not read carries no badge either: the
       -- badge names the source, and naming the source of a value is telling them it exists.
       and f.data ->> 'key' = any (v_seen)
       and (p_field_keys is null or f.data ->> 'key' = any (p_field_keys))
  )
  select r.id, fl.fkey, fl.owned,
         r.data -> fl.fkey,
         nullif(r.data -> '_values' -> fl.fkey ->> 'ver', '')::integer,
         r.data -> '_values' -> fl.fkey ->> 'actor',
         r.data -> '_values' -> fl.fkey ->> 'on_behalf_of',
         nullif(r.data -> '_values' -> fl.fkey ->> 'at', '')::timestamptz,
         r.data -> '_sources' -> (r.data -> '_values' -> fl.fkey ->> 'src'),
         nullif(r.data -> '_values' -> fl.fkey ->> 'absent', ''),
         -- Every alternate with its source resolved, the way custom.read_record resolves
         -- the ones it carries — a pointer is this store's bookkeeping, never an answer.
         (select jsonb_agg(jsonb_build_object('value', a -> 'value', 'rank', a -> 'rank',
                                              'source', r.data -> '_sources' -> (a ->> 'src'))
                           order by (a ->> 'rank')::int)
            from jsonb_array_elements(coalesce(r.data -> '_values' -> fl.fkey -> 'alternates', '[]'::jsonb)) a),
         coalesce((r.data -> '_values' -> fl.fkey ->> 'pinned')::boolean, false),
         (fl.every is not null
          and (r.data -> '_values' -> fl.fkey ->> 'at') is not null
          and (r.data -> '_values' -> fl.fkey ->> 'at')::timestamptz + make_interval(days => fl.every) < now()),
         case when fl.every is not null and (r.data -> '_values' -> fl.fkey ->> 'at') is not null
              then (r.data -> '_values' -> fl.fkey ->> 'at')::timestamptz + make_interval(days => fl.every) end
    from custom.record r
    cross join fields fl
   where r.organization_id = p_organization_id
     and r.table_id = p_table_id
     and r.deleted_at is null
     and r.data_class = 'record'
     and (p_record_ids is null or r.id = any (p_record_ids))
     and r.id in (select v from custom.query_visible_ids(p_organization_id, p_table_id) v)
     and (r.data ? fl.fkey or r.data -> '_values' ? fl.fkey)
   order by r.created_at, fl.fkey;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.enrich_due(p_organization_id uuid, p_field_id uuid, p_limit integer DEFAULT 50, p_include_fresh boolean DEFAULT false)
 RETURNS TABLE(record_id uuid, title text, inputs jsonb, current_value jsonb, written_at timestamp with time zone, reason text, trimmed_to integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := auth.uid();
  v_table  uuid;
  v_key    text;
  v_every  integer;
  v_cfg    jsonb;
  v_inputs text[];
  v_seen   text[];
  v_mask   jsonb;
  v_k      text;
  v_ceil   integer;
  v_take   integer;
  v_cap    numeric;
  v_spent  numeric;
  v_level  public.permission_level;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.enrich_due');

  select (f.data ->> 'entity_definition_id')::uuid, f.data ->> 'key',
         nullif(f.data ->> 'review_interval_days', '')::integer,
         coalesce(f.data -> 'source_config', '{}'::jsonb)
    into v_table, v_key, v_every, v_cfg
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.data ->> 'source' = 'agent';
  if v_table is null then
    raise exception 'There is no column here that a model fills in.'
      using errcode = '23503',
            hint = 'Either that field id belongs to another organization, or nobody has set an enrichment up on it yet — custom.enrich_declare does that.';
  end if;

  perform custom.assert_may_know_table(p_organization_id, v_table, 'custom.enrich_due');

  -- ── THE COST REFUSAL, asked BEFORE any work is handed out rather than after the money
  -- is spent. The figure and the cap are both said, because "there was nothing to do" and
  -- "you have spent your budget" look identical from a screen otherwise.
  v_cap := coalesce((platform.knob_resolve('custom', 'enrichment_cost_cap_cents', p_organization_id) #>> '{}')::numeric, 2000);
  select coalesce(sum(coalesce((x.data ->> 'cost_cents')::numeric, 0)), 0) into v_spent
    from custom.record x
   where x.organization_id = p_organization_id
     and x.table_id = custom.organization_kernel_id()
     and x.data_class = custom.enrich_run_class()
     and x.deleted_at is null
     and x.created_at >= date_trunc('month', now());
  if v_spent >= v_cap then
    raise exception 'This organization has spent % cents on filling columns in this month, and its budget is % cents, so nothing more was started.',
                    round(v_spent, 2), v_cap
      using errcode = '53400',
            hint = 'The budget is custom/enrichment_cost_cap_cents and an organization may change it. It resets on the first of the month. Nothing was written and nothing was charged.';
  end if;

  -- ── THE RATE REFUSAL. One run takes at most the organization's ceiling, and when the ask
  -- was larger every row says what it was trimmed to, so a scheduled pass over a big Table
  -- walks it in bounded batches instead of one unbounded sweep.
  v_ceil := coalesce((platform.knob_resolve('custom', 'enrichment_batch_ceiling', p_organization_id) #>> '{}')::integer, 200);
  v_take := least(greatest(coalesce(p_limit, 50), 1), v_ceil);

  -- ── FIELD-LEVEL SECURITY IS NOT SUSPENDED FOR AN AGENT (DOOR-5 / AGT-N-4). The run reads
  -- exactly what the operating person may read. An input this caller cannot see is refused
  -- BY NAME rather than quietly dropped, because an instruction that silently loses one of
  -- its inputs answers confidently out of half a record.
  select coalesce(array_agg(value), '{}'::text[]) into v_inputs
    from jsonb_array_elements_text(coalesce(v_cfg -> 'inputs', '[]'::jsonb));
  v_level := custom.my_level(p_organization_id, v_table, 'table');
  -- READ-MASK-ONCE: the columns this caller may read are the one mask's answer.
  v_mask := custom.read_mask_for(v_me, p_organization_id, v_table, coalesce(v_level, 'viewer'::public.permission_level), 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_seen
    from jsonb_array_elements(v_mask -> 'visible') x;
  foreach v_k in array (v_inputs || v_key) loop
    if not (v_k = any (v_seen)) then
      raise exception 'You cannot see the column "%", so this enrichment cannot be run by you.', v_k
        using errcode = '42501',
              hint = 'AGT-N-4: an agent reads exactly what the person operating it may read, never more. Ask somebody who holds that column to run it, or have it shared with you.';
    end if;
  end loop;

  return query
  select r.id,
         coalesce(nullif(r.data ->> 'title', ''), r.id::text),
         coalesce((select jsonb_object_agg(k, r.data -> k)
                     from unnest(v_inputs) k), '{}'::jsonb),
         r.data -> v_key,
         nullif(r.data -> '_values' -> v_key ->> 'at', '')::timestamptz,
         -- ONE FRESHNESS CEILING. This used to derive the age and the sentence here, which
         -- made it the THIRD copy of the same rule after `custom.context_resolve` and the
         -- merge resolver; `pnpm check:one-freshness-ceiling` is what found it.
         case when (r.data -> '_values' -> v_key ->> 'at') is null then 'never filled in'
              else coalesce(
                     custom.freshness_verdict(
                       nullif(r.data -> '_values' -> v_key ->> 'at', '')::timestamptz,
                       v_every * 86400) ->> 'stale_note',
                     'inside the freshness this column declares') end,
         case when p_limit is not null and p_limit > v_ceil then v_ceil end
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = v_table
     and r.deleted_at is null
     and r.data_class = 'record'
     and r.id in (select v from custom.query_visible_ids(p_organization_id, v_table) v)
     -- A CELL A PERSON PINNED IS NOT WORK. It is somebody's decision, and the run never
     -- sees it at all — not as a row it then skips, which is one bug away from overwriting.
     and not coalesce((r.data -> '_values' -> v_key ->> 'pinned')::boolean, false)
     and (p_include_fresh
          or (r.data -> '_values' -> v_key ->> 'at') is null
          -- The SAME verdict that writes the sentence above decides whether the row is work,
          -- so a row can never be listed as due with a reason that says it is fresh.
          or (custom.freshness_verdict(
                nullif(r.data -> '_values' -> v_key ->> 'at', '')::timestamptz,
                v_every * 86400) ->> 'freshness') = 'stale')
   order by (r.data -> '_values' -> v_key ->> 'at') nulls first, r.created_at
   limit v_take;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.record_filter_sql(p_organization_id uuid, p_table_id uuid, p_filter jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_who     uuid;
  v_level   public.permission_level;
  v_visible text[];
  v_mask    jsonb;
begin
  if not custom.filter_is_rule(p_filter) then
    -- S2-PRIME AGG-FIELD-READ: a flat question may not narrow by a column its reader may not read
    -- — "the jobs whose cost is 2,600" answers the cost. Refused by the column's name, as the
    -- aggregate refuses measuring it. (A Rule expression treats such a column as undecided.)
    if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
      perform custom.agg_fields_readable_assert(p_organization_id, p_table_id,
                array(select jsonb_object_keys(p_filter)), 'viewer');
    end if;
    return custom.record_filter_sql(p_filter);
  end if;

  -- WHICH COLUMNS THIS READER MAY SEE, asked the way the read door asks it: the reader's level
  -- on the TABLE, then the fields at that level. The server lane (no principal) sees every column.
  v_who := custom.query_principal();
  if v_who is not null then
    v_level := custom.effective_level(v_who, p_organization_id, p_table_id);
    -- READ-MASK-ONCE: the one mask's answer, memoised for the statement.
    v_mask := custom.read_mask_for(v_who, p_organization_id, p_table_id, v_level, 'read');
    select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
      from jsonb_array_elements(v_mask -> 'visible') x;
  end if;

  return format('(custom.rule_truth(%s) is true)',
                custom.rule_filter_node_sql(p_organization_id, p_table_id, p_filter,
                                            custom.choice_field_map(p_organization_id, p_table_id),
                                            v_visible));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.agg_fields_readable_assert(p_organization_id uuid, p_table_id uuid, p_keys text[], p_required text DEFAULT 'viewer'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- SECURITY INVOKER on purpose: it only ever refuses, and its callers (custom.agg_sql,
-- custom.record_filter_sql) run inside definer doors, so it reads as those doors do.
declare
  v_me    uuid := custom.query_principal();
  v_level public.permission_level;
  v_label text;
  v_visible text[];
begin
  if v_me is null or p_keys is null or cardinality(p_keys) = 0 then
    return;
  end if;
  -- THE FLOOR of what this reader holds on the records the question reads: each passed the
  -- door's own `p_required` test, and the table's level lifts them all.
  v_level := greatest(coalesce(custom.effective_level(v_me, p_organization_id, p_table_id), 'viewer'::public.permission_level),
                      coalesce(nullif(p_required, ''), 'viewer')::public.permission_level);
  -- READ-MASK-ONCE: the columns this reader may read are the one mask's answer.
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(custom.read_mask_for(v_me, p_organization_id, p_table_id, v_level, 'read') -> 'visible') x;
  select coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key')
    into v_label
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and f.data ->> 'key' = any (p_keys)
     and not (f.data ->> 'key' = any (v_visible))
   order by array_position(p_keys, f.data ->> 'key')
   limit 1;
  if v_label is not null then
    raise exception 'You cannot read the % column of this table, so it cannot be counted, added up, grouped or filtered here.', v_label
      using errcode = '42501',
            hint = 'Leave that column out of this question, or ask somebody who is Admin on the table to move you up.';
  end if;
end;
$function$;

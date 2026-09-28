-- draft: SCOPES-STORE-HOMES building; not rehearsed yet
-- chair-step: lane SCOPES-STORE-HOMES (L2 of SCOPES-CUTOVER-PLAN, step 0.2). Every column the old scope readers use gets a home in the record store: a scope type's description, sort order, max_assignments_per_entity and default_variable_keys become declared keys of its Table's own document; a context item's description, status, status note, category, tags, max_items, custom_component, reference_source and allowed_* become declared keys of its Field's document (no longer words carried in metadata); a scope's slug and sort order become two declared Fields of every scope Table (slug unique among the Table's live Records, as ctx_scopes_type_slug_uniq keeps it; sort order the Table's default sort, then name). custom._ctx_own_words (twin of scopes.own_words) says all of it; the store halves write it; custom._ctx_upsert_doc takes a cleared word off and compares lists exactly; the scopes switch's own_words_copied check compares every column; Switch back carries every word the copy has back, naming any the old table would refuse. Writes no scope data at apply.
-- based-on: custom._ctx_own_words(text, jsonb) 83e56de0b64a36c560583deb37a4d9eff556d52e72fb71aa81d2401d5f648f57
-- based-on: custom._ctx_store_type(uuid, uuid, jsonb) ec8b1609623a85e763843f979953e7d3802e724f885675287da8121b82688dab
-- based-on: custom._ctx_store_item(uuid, uuid, uuid, jsonb) af2d9a9d6fd0fb45ce45f6f2d98f6ce042f9e2191736d3f464765fb65d1e32d7
-- based-on: custom._ctx_store_scope(uuid, uuid, uuid, jsonb) 4f11098ad9d184cb0d673bf14186d3a7de50b6c4ac39d437b5ec1da115dec6cb
-- based-on: custom._ctx_upsert_doc(uuid, uuid, uuid, text, jsonb, jsonb, timestamp with time zone, uuid) ee97492288c9acd6cad77cf6ef5d3b892811a5b15b53c1ce4e8e7188326ecd3a
-- based-on: platform.cutover_scope_own_words(uuid) 1ea9c056557b6ad0499cc29be4fee8b25ace04a9b6bd8e97754f409233e77fe6
-- based-on: platform._cutover_scope_own_words_back(uuid) 62f3277b1f8e37930a5108f2134ced89b2f2edcd540cc67e8c5e00d72e4cf4b9
-- lane: SCOPES-STORE-HOMES
-- INVERSE: migrations/inverse/scopeshomes_every_column_a_scope_reader_uses_has_a_home_in_the_store_down.sql
-- window-class: function bodies and three new functions; no DDL on any table. Applied directly (owner, 2026-09-24).
--
-- THE USE CASE. Castellano & Reyes' "Matters" type says "Every open engagement, newest first", sits
-- second in its list and allows one matter per client; its "Opposing counsel" field is a stub the
-- partners described in a sentence; each matter has a slug the firm's links use and a place in the
-- list the paralegals chose. The old screens read every one of those words; the store kept none of
-- them where a reader could find them, so the day the readers move to the store they would be gone.

-- ── A SCOPE'S SLUG, MADE EXACTLY AS context.ensure_slug MAKES IT (context.slugify), in the store's
-- own schema so the store halves never read context.* for it. Twin: matrx_records.movers.scopes.scope_slug.
create or replace function custom._ctx_scope_slug(p text)
 returns text
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  select nullif(btrim(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'), '-{2,}', '-', 'g'), '-'), '')
$function$;
revoke all on function custom._ctx_scope_slug(text) from public, anon, authenticated;

-- ── WHAT A SCOPE TYPE, A CONTEXT ITEM OR A SCOPE SAYS ABOUT ITSELF (the mover's own_words, in SQL) ──
-- Each key is a declared key of the store document it lands in (lane SCOPES-STORE-HOMES):
--   type  → the Table:  description, sort_order, max_assignments_per_entity, default_variable_keys
--   item  → the Field:  description, status, status_note, category, tags, max_items, custom_component,
--                       reference_source, allowed_scope_type_ids, allowed_reference_types
--   scope → the Record: slug, sort_order (two declared Fields of every scope Table; always written)
-- A word that says nothing (empty text, empty list, null, a type's sort order 0, status `active`,
-- max_items 1) is not written, and a reader reads the default. Twin of
-- matrx_records.movers.scopes.own_words; the two agree key for key (aidream
-- packages/matrx-records/tests/test_a_scope_types_own_words_are_carried.py).
create or replace function custom._ctx_own_words(p_kind text, p_spec jsonb)
 returns jsonb
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  with said as (
    select case p_kind
      when 'type' then jsonb_build_object(
        'description', nullif(p_spec ->> 'description', ''),
        'sort_order', case when coalesce(nullif(p_spec ->> 'sort_order', '')::int, 0) <> 0 then (p_spec ->> 'sort_order')::int end,
        'max_assignments_per_entity', case when jsonb_typeof(p_spec -> 'max_assignments_per_entity') = 'number'
                                           then (p_spec ->> 'max_assignments_per_entity')::int end,
        'default_variable_keys', case when jsonb_typeof(p_spec -> 'default_variable_keys') = 'array' and jsonb_array_length(p_spec -> 'default_variable_keys') > 0
                                      then (select jsonb_agg(t order by o) from jsonb_array_elements_text(p_spec -> 'default_variable_keys') with ordinality e(t, o)) end)
      when 'item' then jsonb_build_object(
        'description', nullif(p_spec ->> 'description', ''),
        'status', case when coalesce(nullif(p_spec ->> 'status', ''), 'active') <> 'active' then p_spec ->> 'status' end,
        'status_note', nullif(p_spec ->> 'status_note', ''),
        'category', nullif(p_spec ->> 'category', ''),
        'tags', case when jsonb_typeof(p_spec -> 'tags') = 'array' and jsonb_array_length(p_spec -> 'tags') > 0
                     then (select jsonb_agg(t order by o) from jsonb_array_elements_text(p_spec -> 'tags') with ordinality e(t, o)) end,
        'max_items', case when jsonb_typeof(p_spec -> 'max_items') = 'number' and (p_spec ->> 'max_items')::int <> 1
                          then (p_spec ->> 'max_items')::int end,
        'custom_component', case when jsonb_typeof(p_spec -> 'custom_component') <> 'null' then p_spec -> 'custom_component' end,
        'reference_source', case when jsonb_typeof(p_spec -> 'reference_source') <> 'null' then p_spec -> 'reference_source' end,
        'allowed_scope_type_ids', case when jsonb_typeof(p_spec -> 'allowed_scope_type_ids') = 'array' and jsonb_array_length(p_spec -> 'allowed_scope_type_ids') > 0
                                       then (select jsonb_agg(t order by o) from jsonb_array_elements_text(p_spec -> 'allowed_scope_type_ids') with ordinality e(t, o)) end,
        'allowed_reference_types', case when jsonb_typeof(p_spec -> 'allowed_reference_types') = 'array' and jsonb_array_length(p_spec -> 'allowed_reference_types') > 0
                                        then (select jsonb_agg(t order by o) from jsonb_array_elements_text(p_spec -> 'allowed_reference_types') with ordinality e(t, o)) end)
      when 'scope' then jsonb_build_object(
        'slug', coalesce(custom._ctx_scope_slug(nullif(btrim(p_spec ->> 'slug'), '')), custom._ctx_scope_slug(p_spec ->> 'name')),
        'sort_order', coalesce(nullif(p_spec ->> 'sort_order', '')::int, 0))
      else '{}'::jsonb end as o)
  -- Only the top level is thinned: a null INSIDE custom_component or reference_source is the old
  -- side's own word and is kept.
  select coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(said.o) e where jsonb_typeof(e.value) <> 'null'), '{}'::jsonb)
    from said
$function$;
revoke all on function custom._ctx_own_words(text, jsonb) from public, anon, authenticated;

-- ── THE SCOPE'S OWN SLUG AND SORT ORDER, AS TWO DECLARED FIELDS OF ITS TABLE ──────────────────────
-- Same ids the mover plans (typemap.derived_id('scope-column-field', type, key)), sorts 2000 / 2001
-- (after every item and every setting), `exclude` (never handed to an agent: the old resolver never
-- handed the scope's own columns either). The Table declares each key before its Field is written.
create or replace function custom._ctx_scope_columns(p_org uuid, p_type uuid)
 returns void
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  c record;
begin
  for c in select * from (values ('slug', 'Slug', '{"behavior":"text"}'::jsonb, 2000),
                                 ('sort_order', 'Sort order', custom._ctx_item_shape('{"value_type":"number"}'::jsonb, false), 2001)) v(k, label, shape, sort)
  loop
    update custom.record t
       set data = t.data || jsonb_build_object('fields', (t.data -> 'fields') || jsonb_build_array(jsonb_build_object('name', c.k)))
     where t.organization_id = p_org and t.id = p_type
       and not exists (select 1 from jsonb_array_elements(t.data -> 'fields') e where e ->> 'name' = c.k);
    perform custom._ctx_upsert_doc(p_org, custom._ctx_id('scope-column-field', p_type::text, c.k),
      custom.field_kernel_id(), 'field',
      custom._ctx_field_doc(c.k, c.label, c.shape, p_type, false, c.sort, 'internal', 'exclude', 'manual', null, null, true),
      jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_type::text,
                         'note', format('the %s column, which was never a context item', c.k))), null);
  end loop;
end;
$function$;
revoke all on function custom._ctx_scope_columns(uuid, uuid) from public, anon, authenticated;

-- ── READINESS (own_words_copied): which copies do not say what the current screens show ───────────
-- Every column above, compared as its home holds it, for every live old row with a live twin (a row
-- with no twin is rows_copied's to count). Copying again brings each one; Switch back carries each back.
create or replace function platform.cutover_scope_own_words(p_org uuid)
 returns jsonb
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  with pairs as (
    select 'type'::text as kind, coalesce(nullif(t.label_plural, ''), t.label_singular) as what,
           custom._ctx_own_words('type', to_jsonb(t)) as said,
           coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(r.data) e
                      where e.key in ('description', 'sort_order', 'max_assignments_per_entity', 'default_variable_keys')), '{}'::jsonb) as kept
      from context.scope_types t
      join custom.record r on r.organization_id = p_org and r.id = t.id and r.deleted_at is null
     where t.organization_id = p_org and t.deleted_at is null
    union all
    select 'field', coalesce(nullif(t.label_plural, ''), t.label_singular) || ' · ' || coalesce(nullif(i.display_name, ''), i.key),
           custom._ctx_own_words('item', to_jsonb(i)),
           coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(r.data) e
                      where e.key in ('description', 'status', 'status_note', 'category', 'tags', 'max_items', 'custom_component',
                                      'reference_source', 'allowed_scope_type_ids', 'allowed_reference_types')), '{}'::jsonb)
      from context.context_items i
      join context.scope_types t on t.id = i.scope_type_id and t.organization_id = p_org and t.deleted_at is null
      join custom.record r on r.organization_id = p_org and r.id = i.id and r.deleted_at is null
     where i.deleted_at is null
    union all
    select 'scope', coalesce(nullif(t.label_singular, ''), 'Scope') || ' · ' || s.name,
           custom._ctx_own_words('scope', to_jsonb(s)),
           coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(r.data) e where e.key in ('slug', 'sort_order')), '{}'::jsonb)
      from context.scopes s
      join context.scope_types t on t.id = s.scope_type_id and t.deleted_at is null
      join custom.record r on r.organization_id = p_org and r.id = s.id and r.deleted_at is null
     where s.organization_id = p_org and s.deleted_at is null
  ), differ as (
    select kind, what,
           (select string_agg(k, ', ' order by k) from (select jsonb_object_keys(said) k union select jsonb_object_keys(kept)) ks
             where said -> k is distinct from kept -> k) as words
      from pairs where said is distinct from kept
  )
  select jsonb_build_object(
    'count', (select count(*) from differ),
    'by_kind', jsonb_build_object('types', (select count(*) from differ where kind = 'type'),
                                  'fields', (select count(*) from differ where kind = 'field'),
                                  'scopes', (select count(*) from differ where kind = 'scope')),
    'examples', coalesce((select jsonb_agg(x) from (select format('%s (%s)', what, words) as x from differ
                                                     order by case kind when 'type' then 0 when 'field' then 1 else 2 end, what limit 5) s), '[]'::jsonb))
$function$;
revoke all on function platform.cutover_scope_own_words(uuid) from public, anon, authenticated;

-- ── SWITCH BACK: every word the copy has, back to the current screens ─────────────────────────────
-- Only a word the copy HAS is carried: a copy that says nothing never erases what the screens show
-- (a copy made before this lane's Copy again says nothing yet). While the store is the writer a door
-- writes both sides in one transaction, so a word cleared in the store is cleared on the old side too.
-- A value the old table would refuse (a description over 500 characters, a status that is not one of
-- the fifteen, a sort order outside smallint, a malformed slug or id) is never written half-way: it is
-- left as the screens have it and NAMED in the answer (not_carried), so the press says what it kept.
-- Written under the bridge's mark: the store already holds these words, so nothing is copied back.
create or replace function platform._cutover_scope_own_words_back(p_org uuid)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_types int; v_items int; v_scopes int;
  v_was text := custom._ctx_mark('bridge');
  v_skipped jsonb;
  c_statuses constant text[] := enum_range(null::public.context_item_status)::text[];
begin
  -- WHAT THE OLD TABLES WOULD REFUSE, named first and then left alone.
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_skipped from (
    select format('scope type %s: %s', t.id, string_agg(w, ', ')) as x
      from context.scope_types t join custom.record r on r.organization_id = p_org and r.id = t.id,
           lateral (select 'sort_order' w where r.data ? 'sort_order' and (jsonb_typeof(r.data -> 'sort_order') <> 'number' or abs((r.data ->> 'sort_order')::numeric) > 32767)
                    union all select 'max_assignments_per_entity' where r.data ? 'max_assignments_per_entity' and (jsonb_typeof(r.data -> 'max_assignments_per_entity') <> 'number' or abs((r.data ->> 'max_assignments_per_entity')::numeric) > 32767)) b
     where t.organization_id = p_org group by t.id
    union all
    select format('context field %s: %s', i.id, string_agg(w, ', '))
      from context.context_items i join context.scope_types t on t.id = i.scope_type_id and t.organization_id = p_org
      join custom.record r on r.organization_id = p_org and r.id = i.id,
           lateral (select 'description' w where char_length(r.data ->> 'description') > 500
                    union all select 'status' where r.data ? 'status' and not (r.data ->> 'status' = any (c_statuses))
                    union all select 'max_items' where r.data ? 'max_items' and (jsonb_typeof(r.data -> 'max_items') <> 'number' or (r.data ->> 'max_items')::numeric < 1)
                    union all select 'allowed_scope_type_ids' where r.data ? 'allowed_scope_type_ids' and exists (
                        select 1 from jsonb_array_elements_text(r.data -> 'allowed_scope_type_ids') a
                         where a !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) b
     group by i.id
    union all
    select format('scope %s: %s', s.id, string_agg(w, ', '))
      from context.scopes s join custom.record r on r.organization_id = p_org and r.id = s.id,
           lateral (select 'slug' w where r.data ? 'slug' and coalesce(r.data ->> 'slug', '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
                    union all select 'sort_order' where r.data ? 'sort_order' and (jsonb_typeof(r.data -> 'sort_order') <> 'number' or abs((r.data ->> 'sort_order')::numeric) > 32767)) b
     where s.organization_id = p_org group by s.id
  ) z;

  with kept as (
    select t.id, r.data as c
      from context.scope_types t
      join custom.record r on r.organization_id = p_org and r.id = t.id
     where t.organization_id = p_org
       and r.data ?| array['description', 'sort_order', 'max_assignments_per_entity', 'default_variable_keys']
       and not exists (select 1 from jsonb_array_elements_text(v_skipped) x where x like 'scope type ' || t.id::text || ':%')
  ), want as (
    select k.id,
           case when k.c ? 'description' then k.c ->> 'description' end as description,
           case when k.c ? 'sort_order' then (k.c ->> 'sort_order')::smallint end as sort_order,
           case when k.c ? 'max_assignments_per_entity' then (k.c ->> 'max_assignments_per_entity')::smallint end as max_a,
           case when k.c ? 'default_variable_keys' then array(select jsonb_array_elements_text(k.c -> 'default_variable_keys')) end as dvk,
           k.c
      from kept k
  )
  update context.scope_types t
     set description = case when w.c ? 'description' then w.description else t.description end,
         sort_order  = case when w.c ? 'sort_order' then w.sort_order else t.sort_order end,
         max_assignments_per_entity = case when w.c ? 'max_assignments_per_entity' then w.max_a else t.max_assignments_per_entity end,
         default_variable_keys = case when w.c ? 'default_variable_keys' then w.dvk else t.default_variable_keys end
    from want w
   where t.id = w.id
     and ((w.c ? 'description' and t.description is distinct from w.description)
       or (w.c ? 'sort_order' and t.sort_order is distinct from w.sort_order)
       or (w.c ? 'max_assignments_per_entity' and t.max_assignments_per_entity is distinct from w.max_a)
       or (w.c ? 'default_variable_keys' and t.default_variable_keys is distinct from w.dvk));
  get diagnostics v_types = row_count;

  with kept as (
    select i.id, r.data as c
      from context.context_items i
      join context.scope_types t on t.id = i.scope_type_id and t.organization_id = p_org
      join custom.record r on r.organization_id = p_org and r.id = i.id
     where r.data ?| array['description', 'status', 'status_note', 'category', 'tags', 'max_items', 'custom_component',
                           'reference_source', 'allowed_scope_type_ids', 'allowed_reference_types']
       and not exists (select 1 from jsonb_array_elements_text(v_skipped) x where x like 'context field ' || i.id::text || ':%')
  ), want as (
    select k.id, k.c,
           k.c ->> 'description' as description,
           (k.c ->> 'status')::public.context_item_status as status,
           k.c ->> 'status_note' as status_note,
           k.c ->> 'category' as category,
           case when k.c ? 'tags' then array(select jsonb_array_elements_text(k.c -> 'tags')) end as tags,
           (k.c ->> 'max_items')::int as max_items,
           case when k.c ? 'allowed_scope_type_ids' then array(select (jsonb_array_elements_text(k.c -> 'allowed_scope_type_ids'))::uuid) end as ast,
           case when k.c ? 'allowed_reference_types' then array(select jsonb_array_elements_text(k.c -> 'allowed_reference_types')) end as art
      from kept k
  )
  update context.context_items i
     set description = case when w.c ? 'description' then w.description else i.description end,
         status      = case when w.c ? 'status' then w.status else i.status end,
         status_note = case when w.c ? 'status_note' then w.status_note else i.status_note end,
         category    = case when w.c ? 'category' then w.category else i.category end,
         tags        = case when w.c ? 'tags' then w.tags else i.tags end,
         max_items   = case when w.c ? 'max_items' then w.max_items else i.max_items end,
         custom_component = case when w.c ? 'custom_component' then w.c -> 'custom_component' else i.custom_component end,
         reference_source = case when w.c ? 'reference_source' then w.c -> 'reference_source' else i.reference_source end,
         allowed_scope_type_ids  = case when w.c ? 'allowed_scope_type_ids' then w.ast else i.allowed_scope_type_ids end,
         allowed_reference_types = case when w.c ? 'allowed_reference_types' then w.art else i.allowed_reference_types end
    from want w
   where i.id = w.id
     and ((w.c ? 'description' and i.description is distinct from w.description)
       or (w.c ? 'status' and i.status is distinct from w.status)
       or (w.c ? 'status_note' and i.status_note is distinct from w.status_note)
       or (w.c ? 'category' and i.category is distinct from w.category)
       or (w.c ? 'tags' and i.tags is distinct from w.tags)
       or (w.c ? 'max_items' and i.max_items is distinct from w.max_items)
       or (w.c ? 'custom_component' and i.custom_component is distinct from w.c -> 'custom_component')
       or (w.c ? 'reference_source' and i.reference_source is distinct from w.c -> 'reference_source')
       or (w.c ? 'allowed_scope_type_ids' and i.allowed_scope_type_ids is distinct from w.ast)
       or (w.c ? 'allowed_reference_types' and i.allowed_reference_types is distinct from w.art));
  get diagnostics v_items = row_count;

  with kept as (
    select s.id, r.data as c
      from context.scopes s
      join custom.record r on r.organization_id = p_org and r.id = s.id
     where s.organization_id = p_org
       and r.data ?| array['slug', 'sort_order']
       and not exists (select 1 from jsonb_array_elements_text(v_skipped) x where x like 'scope ' || s.id::text || ':%')
  )
  update context.scopes s
     set slug       = case when k.c ? 'slug' then k.c ->> 'slug' else s.slug end,
         sort_order = case when k.c ? 'sort_order' then (k.c ->> 'sort_order')::smallint else s.sort_order end
    from kept k
   where s.id = k.id
     and ((k.c ? 'slug' and s.slug is distinct from k.c ->> 'slug')
       or (k.c ? 'sort_order' and s.sort_order is distinct from (k.c ->> 'sort_order')::smallint));
  get diagnostics v_scopes = row_count;

  perform custom._ctx_mark(v_was);
  return jsonb_build_object('scope_types', v_types, 'context_fields', v_items, 'scopes', v_scopes,
                            'not_carried', v_skipped);
end;
$function$;
revoke all on function platform._cutover_scope_own_words_back(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION custom._ctx_upsert_doc(p_org uuid, p_id uuid, p_kernel uuid, p_class text, p_doc jsonb, p_stamp jsonb, p_deleted timestamp with time zone, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_dropped text[] := array(select k from unnest(array['format', 'display_format', 'unit', 'default', 'review_interval_days',
                                                        'relation_target', 'relation_max', 'on_target_delete', 'compute_on',
                                                        'parity_type', 'table_token',
                                                        -- WHAT A SCOPE TYPE OR AN ITEM SAYS ABOUT ITSELF (lane
                                                        -- SCOPES-STORE-HOMES): a word the old side stopped saying comes off.
                                                        'description', 'sort_order', 'max_assignments_per_entity',
                                                        'default_variable_keys', 'status', 'status_note', 'category', 'tags',
                                                        'max_items', 'custom_component', 'reference_source',
                                                        'allowed_scope_type_ids', 'allowed_reference_types']) k
                            where not (p_doc ? k));
  v_touched boolean;
begin
  if exists (select 1 from custom.record r where r.organization_id = p_org and r.id = p_id) then
    update custom.record r
       set data = (r.data - v_dropped) || p_doc,
           deleted_at = p_deleted,
           metadata = r.metadata || p_stamp
     where r.organization_id = p_org and r.id = p_id
       and (not (r.data @> p_doc) or r.deleted_at is distinct from p_deleted
            or not (r.metadata @> p_stamp) or r.data ?| v_dropped
            -- A WORD THE OLD SIDE CLEARED COMES OFF THE COPY TOO (lane SCOPES-TAILS): containment never
            -- sees a carried key the stamp no longer has, so a Table's or a Field's carried words are
            -- compared exactly.
            or (p_class in ('table', 'field')
                and coalesce(r.metadata -> 'moved_from' -> 'carried', '{}'::jsonb)
                    is distinct from coalesce(p_stamp -> 'moved_from' -> 'carried', '{}'::jsonb))
            -- ...AND A LIST OR AN OBJECT A TABLE OR A FIELD SAYS ABOUT ITSELF IS COMPARED EXACTLY (lane
            -- SCOPES-STORE-HOMES): containment says {"tags": ["a", "b"]} holds {"tags": ["a"]}, so a tag
            -- removed, a list reordered or a key dropped inside custom_component would never reach the copy.
            or (p_class in ('table', 'field')
                and exists (select 1 from unnest(array['default_variable_keys', 'tags', 'custom_component', 'reference_source',
                                                       'allowed_scope_type_ids', 'allowed_reference_types']) k
                             where p_doc ? k and r.data -> k is distinct from p_doc -> k)))
    returning true into v_touched;
    return case when v_touched then 'updated' else 'current' end;
  end if;
  insert into custom.record (id, organization_id, table_id, data_class, data, metadata, deleted_at, created_by)
  values (p_id, p_org, p_kernel, p_class, p_doc, p_stamp, p_deleted, coalesce(p_created_by, auth.uid()));
  return 'made';
end;
$function$

;

CREATE OR REPLACE FUNCTION custom._ctx_store_type(p_org uuid, p_type uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_home     uuid := custom._ctx_id('organization-home', p_org::text);
  v_singular text := coalesce(nullif(p_spec ->> 'label_singular', ''), nullif(p_spec ->> 'label_plural', ''), 'Record');
  v_deleted  timestamptz := nullif(p_spec ->> 'deleted_at', '')::timestamptz;
  v_carried  jsonb := '{}'::jsonb;
  v_stamp    jsonb;
  v_doc      jsonb;
  v_fields   jsonb;
  v_desc     text;
  v_live     boolean;
  v_did      text;
begin
  -- THE ORGANIZATION'S HOME (common.home_record): every Table of the context copy lives inside it.
  insert into custom.record (id, organization_id, table_id, data_class, data, metadata)
  select v_home, p_org, '11111111-0000-4000-8000-000000000004'::uuid, 'record',
         jsonb_build_object('name', coalesce(nullif(o.name, ''), 'This organization')),
         jsonb_build_object('moved_from', jsonb_build_object('table', 'iam.organizations', 'id', p_org::text,
                            'note', 'the organization''s own home for everything moved out of the old stores'))
    from iam.organizations o where o.id = p_org
  on conflict do nothing;

  -- WHAT THE TYPE SAYS ABOUT ITSELF HAS ITS HOME IN THE TABLE'S OWN DOCUMENT (lane SCOPES-STORE-HOMES):
  -- description, sort order, max_assignments_per_entity and default_variable_keys are declared keys
  -- of the Table (custom._ctx_own_words, the mover's twin), no longer words carried beside the pointer.
  v_stamp := jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scope_types', 'id', p_type::text)
                                || case when v_carried <> '{}'::jsonb then jsonb_build_object('carried', v_carried) else '{}'::jsonb end);

  v_live := exists (select 1 from custom.record r where r.organization_id = p_org and r.id = p_type);
  v_fields := case when v_live then custom._ctx_table_fields(p_org, p_type) else '[]'::jsonb end;
  if jsonb_array_length(v_fields) = 0 then
    v_fields := '[{"name": "name"}, {"name": "description"}]'::jsonb;
  end if;

  v_doc := jsonb_build_object(
    'name', v_singular,
    'slug', custom._ctx_slug(coalesce(nullif(p_spec ->> 'slug', ''), v_singular), 'table'),
    'label_singular', v_singular,
    'label_plural', coalesce(nullif(p_spec ->> 'label_plural', ''), v_singular || 's'),
    'icon', p_spec -> 'icon', 'color', p_spec -> 'color',
    'type', 'entity', 'display', 'page', 'ordered', false, 'weight', 'light',
    'retention_days', greatest(30, coalesce(history.retention_floor_days(p_org), 0)),
    -- THE OLD SCREENS' ORDER (get_scope_tree, list_scopes: sort order, then name) — the scope's own
    -- sort_order is a declared Field of every scope Table (lane SCOPES-STORE-HOMES).
    'default_sort', '[{"field": "sort_order", "direction": "asc"}, {"field": "name", "direction": "asc"}]'::jsonb,
    'row_order', 'sorted', 'agent_writable', true,
    'fields', v_fields, 'title_field', 'name', 'parent_id', v_home::text,
    'kept_by_the_app', true, 'kept_for', 'context', 'offered_as_context', true)
    || custom._ctx_own_words('type', p_spec);
  if v_doc -> 'icon' is null then v_doc := v_doc || '{"icon": null}'::jsonb; end if;
  if v_doc -> 'color' is null then v_doc := v_doc || '{"color": null}'::jsonb; end if;

  -- A LIVE TABLE BEFORE ITS FIELDS; an archived one after them (a Field is judged against its Table).
  if v_deleted is null then
    v_did := custom._ctx_upsert_doc(p_org, p_type, custom.table_kernel_id(), 'table', v_doc, v_stamp, null,
                                    nullif(p_spec ->> 'created_by', '')::uuid);
  end if;

  -- THE TWO FIELDS EVERY SCOPE RECORD HAS AS COLUMNS (name, and description or scope_description).
  select case when exists (select 1 from custom.record f
                            where f.organization_id = p_org and f.table_id = custom.field_kernel_id()
                              and f.data ->> 'entity_definition_id' = p_type::text
                              and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items'
                              and f.data ->> 'key' = 'description')
              then 'scope_description' else 'description' end into v_desc;
  if v_deleted is null then
    perform custom._ctx_upsert_doc(p_org, custom._ctx_id('scope-column-field', p_type::text, 'name'),
      custom.field_kernel_id(), 'field',
      custom._ctx_field_doc('name', 'Name', '{"behavior":"text"}'::jsonb, p_type, true, 0, 'internal', 'exclude', 'manual', null, null, false),
      jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_type::text,
                         'note', 'the name column, which was never a context item')), null);
    perform custom._ctx_upsert_doc(p_org, custom._ctx_id('scope-column-field', p_type::text, 'description'),
      custom.field_kernel_id(), 'field',
      custom._ctx_field_doc(v_desc, 'Description', '{"behavior":"text"}'::jsonb, p_type, false, 1, 'internal', 'exclude', 'manual', null, null, false),
      jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_type::text,
                         'note', format('the %s column, which was never a context item', v_desc))), null);
    -- THE SCOPE'S SLUG AND SORT ORDER (lane SCOPES-STORE-HOMES): two more columns every scope Record has.
    perform custom._ctx_scope_columns(p_org, p_type);
    -- The field list, now that every Field exists.
    v_doc := v_doc || jsonb_build_object('fields', custom._ctx_table_fields(p_org, p_type));
    perform custom._ctx_upsert_doc(p_org, p_type, custom.table_kernel_id(), 'table', v_doc, v_stamp, null);
  else
    -- ARCHIVED: what the old side's cascade took with it is archived by its own rows; the Table last.
    update custom.record f set deleted_at = v_deleted
     where f.organization_id = p_org and f.table_id = custom.field_kernel_id()
       and f.data ->> 'entity_definition_id' = p_type::text
       and f.id in (custom._ctx_id('scope-column-field', p_type::text, 'name'),
                    custom._ctx_id('scope-column-field', p_type::text, 'description'),
                    custom._ctx_id('scope-column-field', p_type::text, 'slug'),
                    custom._ctx_id('scope-column-field', p_type::text, 'sort_order'))
       and f.deleted_at is null;
    v_did := custom._ctx_upsert_doc(p_org, p_type, custom.table_kernel_id(), 'table',
                                    v_doc || jsonb_build_object('fields', case when v_live then custom._ctx_table_fields(p_org, p_type) else v_fields end),
                                    v_stamp, v_deleted);
  end if;
  return jsonb_build_object('table', p_type, 'did', v_did);
end;
$function$

;

CREATE OR REPLACE FUNCTION custom._ctx_store_item(p_org uuid, p_type uuid, p_item uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_old      custom.record;
  v_as_text  boolean;
  v_shape    jsonb;
  v_base     text := custom._ctx_slug(coalesce(nullif(p_spec ->> 'key', ''), nullif(p_spec ->> 'slug', ''), 'field'));
  v_key      text;
  v_n        int;
  v_used     text[];
  v_carried  jsonb := '{}'::jsonb;
  v_active   boolean := coalesce((p_spec ->> 'is_active')::boolean, true);
  v_archived timestamptz;
  v_doc      jsonb;
  v_did      text;
  v_col      uuid := custom._ctx_id('scope-column-field', p_type::text, 'description');
  v_colkey   text;
  v_tdoc     jsonb;
begin
  if not custom._ctx_table_live(p_org, p_type) then
    -- A Field of an archived Table is left as it was archived (context_follow._old_wins_documents).
    return jsonb_build_object('field', p_item, 'did', 'table_archived');
  end if;
  select * into v_old from custom.record r where r.organization_id = p_org and r.id = p_item;
  v_as_text := coalesce((v_old.metadata -> 'moved_from' -> 'carried' ->> 'as_text')::boolean, false);
  v_shape := custom._ctx_item_shape(p_spec, v_as_text);

  -- ONE KEY PER FIELD IN A TABLE (scopes._item_keys). A Field keeps the key it has — a key is how
  -- every saved value finds it — unless the item's own key changed.
  if v_old.id is not null and (v_old.data ->> 'key' = v_base or v_old.data ->> 'key' ~ ('^' || v_base || '_[0-9]+$')) then
    v_key := v_old.data ->> 'key';
  else
    select array_agg(f.data ->> 'key') into v_used
      from custom.record f
     where f.organization_id = p_org and f.table_id = custom.field_kernel_id()
       and f.data ->> 'entity_definition_id' = p_type::text and f.id <> p_item
       and f.id <> v_col;
    -- A SCOPE RECORD'S OWN COLUMNS ARE RESERVED (lane SCOPES-STORE-HOMES): name, slug and sort order,
    -- whether or not this Table's column Fields exist yet (scopes._item_keys says the same).
    v_used := coalesce(v_used, '{}') || array['name', 'slug', 'sort_order'];
    v_key := v_base; v_n := 2;
    while v_key = any (v_used) loop
      v_key := v_base || '_' || v_n; v_n := v_n + 1;
    end loop;
  end if;

  -- AN ITEM CALLED "description" KEEPS ITS KEY; the scope's own column steps aside to
  -- scope_description on that Table, and every Record's value moves with it.
  select f.data ->> 'key' into v_colkey from custom.record f where f.organization_id = p_org and f.id = v_col;
  if v_key = 'description' and v_colkey = 'description' then
    select r.data into v_tdoc from custom.record r where r.organization_id = p_org and r.id = p_type;
    update custom.record set data = data || jsonb_build_object('fields',
             (data -> 'fields') || '[{"name": "scope_description"}]'::jsonb)
     where organization_id = p_org and id = p_type;
    update custom.record set data = data || '{"key": "scope_description"}'::jsonb,
                             metadata = metadata || jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_type::text,
                                        'note', 'the scope_description column, which was never a context item'))
     where organization_id = p_org and id = v_col;
    perform custom._ctx_rekey(p_org, p_type, 'description', 'scope_description');
  end if;

  if not v_active then
    v_carried := v_carried || '{"is_active": false}'::jsonb;
  end if;
  if coalesce((v_shape ->> 'as_text')::boolean, false) then
    v_carried := v_carried || jsonb_build_object('as_text', true, 'value_type', coalesce(p_spec ->> 'value_type', 'string'));
  end if;
  v_archived := nullif(p_spec ->> 'deleted_at', '')::timestamptz;
  if v_archived is null and not v_active then
    v_archived := coalesce(v_old.deleted_at, nullif(p_spec ->> 'updated_at', '')::timestamptz, now());
  end if;

  v_doc := custom._ctx_field_doc(
    v_key, coalesce(nullif(p_spec ->> 'display_name', ''), v_key), v_shape, p_type, false,
    coalesce((p_spec ->> 'sort_order')::int, 0) + 2,
    custom._ctx_word('sensitivity', p_spec ->> 'sensitivity'),
    custom._ctx_word('policy', p_spec ->> 'fetch_hint'),
    custom._ctx_word('source', p_spec ->> 'source_type'),
    nullif(p_spec ->> 'review_interval_days', '')::int,
    coalesce((select jsonb_agg(d) from jsonb_array_elements_text(coalesce(p_spec -> 'depends_on', '[]'::jsonb)) d), '[]'::jsonb),
    true)
    -- WHAT THE ITEM SAYS ABOUT ITSELF HAS ITS HOME IN THE FIELD'S OWN DOCUMENT (lane SCOPES-STORE-HOMES):
    -- description, status, status note, category, tags, max_items, custom_component, reference_source,
    -- allowed_scope_type_ids and allowed_reference_types (custom._ctx_own_words, the mover's twin).
    || custom._ctx_own_words('item', p_spec);

  -- THE TABLE DECLARES THE KEY FIRST.
  update custom.record t
     set data = t.data || jsonb_build_object('fields', (t.data -> 'fields') || jsonb_build_array(jsonb_build_object('name', v_key)))
   where t.organization_id = p_org and t.id = p_type
     and not exists (select 1 from jsonb_array_elements(t.data -> 'fields') e where e ->> 'name' = v_key);

  v_did := custom._ctx_upsert_doc(p_org, p_item, custom.field_kernel_id(), 'field', v_doc,
             jsonb_build_object('moved_from', jsonb_build_object('table', 'context.context_items', 'id', p_item::text)
                                || case when v_carried <> '{}'::jsonb then jsonb_build_object('carried', v_carried) else '{}'::jsonb end),
             v_archived, nullif(p_spec ->> 'created_by', '')::uuid);

  -- A KEY THE ITEM STOPPED USING: its values move with it.
  if v_old.id is not null and v_old.data ->> 'key' is distinct from v_key then
    perform custom._ctx_rekey(p_org, p_type, v_old.data ->> 'key', v_key);
  end if;

  -- The field list in the mover's order, now that the Field exists.
  update custom.record t set data = t.data || jsonb_build_object('fields', custom._ctx_table_fields(p_org, p_type))
   where t.organization_id = p_org and t.id = p_type
     and t.data -> 'fields' is distinct from custom._ctx_table_fields(p_org, p_type);
  return jsonb_build_object('field', p_item, 'key', v_key, 'did', v_did);
end;
$function$

;

CREATE OR REPLACE FUNCTION custom._ctx_store_scope(p_org uuid, p_type uuid, p_scope uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_desc     text;
  v_data     jsonb;
  v_set      record;
  v_fid      uuid;
  v_fkey     text;
  v_shape    jsonb;
  v_taken    text[];
  v_existing custom.record;
  v_patch    jsonb := '{}'::jsonb;
  v_deleted  timestamptz := nullif(p_spec ->> 'deleted_at', '')::timestamptz;
  v_vis      text := coalesce(nullif(p_spec ->> 'visibility', ''), 'internal');
  v_k        text;
  v_v        jsonb;
  v_did      text;
  v_own      jsonb;
begin
  if not custom._ctx_table_live(p_org, p_type) then
    return jsonb_build_object('record', p_scope, 'did', 'table_archived');
  end if;
  select f.data ->> 'key' into v_desc from custom.record f
   where f.organization_id = p_org and f.id = custom._ctx_id('scope-column-field', p_type::text, 'description');
  v_desc := coalesce(v_desc, 'description');

  v_data := jsonb_build_object('name', p_spec -> 'name', v_desc, p_spec -> 'description');

  -- THE SCOPE'S SLUG AND SORT ORDER HAVE THEIR HOME IN THE RECORD (lane SCOPES-STORE-HOMES): two
  -- declared Fields of every scope Table (made here if this Table predates them). The slug is the old
  -- row's own (context.ensure_slug has already run), or made from the name exactly as ensure_slug makes
  -- it; it stays unique among the Table's live Records, as ctx_scopes_type_slug_uniq keeps it today.
  if not exists (select 1 from custom.record f
                  where f.organization_id = p_org and f.id = custom._ctx_id('scope-column-field', p_type::text, 'slug')) then
    perform custom._ctx_scope_columns(p_org, p_type);
  end if;
  v_own := custom._ctx_own_words('scope', p_spec);
  if v_own ->> 'slug' is null then
    raise exception 'ensure_slug: could not derive slug from "%" (empty after normalization)', coalesce(p_spec ->> 'name', '<null>')
      using errcode = '22023';
  end if;
  if v_deleted is null and exists (
       select 1 from custom.record x
        where x.organization_id = p_org and x.table_id = p_type and x.deleted_at is null and x.id <> p_scope
          and x.data @> jsonb_build_object('slug', v_own ->> 'slug')) then
    raise exception 'Another % here already has the slug "%"; a slug is different on every live scope of a type.',
                    coalesce((select nullif(t.data ->> 'label_singular', '') from custom.record t where t.organization_id = p_org and t.id = p_type), 'scope'),
                    v_own ->> 'slug'
      using errcode = '23505',
            hint = 'Give this one another name or slug, or archive the one that holds it. Nothing was written.';
  end if;
  v_data := v_data || v_own;
  if nullif(p_spec ->> 'parent_scope_id', '') is not null then
    v_data := v_data || jsonb_build_object('parent_id', p_spec ->> 'parent_scope_id');
  end if;

  -- EVERY SETTINGS KEY IS A DECLARED FIELD (SC-2', attack H2): the class checkout reads them.
  if jsonb_typeof(p_spec -> 'settings') = 'object' then
    for v_set in select e.key, e.value from jsonb_each(p_spec -> 'settings') e order by e.key loop
      continue when v_set.value is null or jsonb_typeof(v_set.value) = 'null';
      v_fid := custom._ctx_id('scope-setting-field', p_type::text, v_set.key);
      select f.data ->> 'key', jsonb_build_object('behavior', f.data ->> 'type', 'multi', coalesce((f.data ->> 'multi')::boolean, false))
        into v_fkey, v_shape
        from custom.record f where f.organization_id = p_org and f.id = v_fid;
      if v_fkey is null then
        select array_agg(f.data ->> 'key') into v_taken from custom.record f
         where f.organization_id = p_org and f.table_id = custom.field_kernel_id()
           and f.data ->> 'entity_definition_id' = p_type::text;
        v_taken := coalesce(v_taken, '{}') || array['name', 'description', 'slug', 'sort_order'];
        v_fkey := custom._ctx_slug(v_set.key);
        if v_fkey = any (v_taken) then
          v_fkey := custom._ctx_slug('setting_' || v_set.key);
        end if;
        -- typemap.infer_shape, from the value this write carries.
        v_shape := case jsonb_typeof(v_set.value)
                     when 'boolean' then '{"behavior":"boolean","parity":"checkbox","multi":false}'
                     when 'number'  then '{"behavior":"range","config":{"kind":"number"},"multi":false}'
                     when 'array'   then '{"behavior":"text","multi":true}'
                     when 'object'  then '{"behavior":"text","format":"json","multi":false}'
                     else '{"behavior":"text","multi":false}' end::jsonb;
        update custom.record t
           set data = t.data || jsonb_build_object('fields', (t.data -> 'fields') || jsonb_build_array(jsonb_build_object('name', v_fkey)))
         where t.organization_id = p_org and t.id = p_type;
        perform custom._ctx_upsert_doc(p_org, v_fid, custom.field_kernel_id(), 'field',
          custom._ctx_field_doc(v_fkey,
                                coalesce(nullif(upper(left(btrim(replace(v_set.key, '_', ' ')), 1)) || lower(substr(btrim(replace(v_set.key, '_', ' ')), 2)), ''), v_fkey),
                                v_shape, p_type, false,
                                1000 + (select count(*)::int from custom.record f where f.organization_id = p_org
                                          and f.table_id = custom.field_kernel_id() and f.data ->> 'entity_definition_id' = p_type::text
                                          and f.metadata -> 'moved_from' ->> 'note' like 'the % key of this type''s scopes'' settings%'),
                                'internal', 'exclude', 'manual', null, null, false),
          jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_type::text,
                             'note', format('the ''%s'' key of this type''s scopes'' settings, which was never a context item', v_set.key))),
          null);
      end if;
      v_data := v_data || jsonb_build_object(v_fkey,
                  case when v_shape ->> 'behavior' = 'text' then custom._ctx_words(coalesce((v_shape ->> 'multi')::boolean, false), v_set.value)
                       else v_set.value end);
    end loop;
  end if;

  select * into v_existing from custom.record r where r.organization_id = p_org and r.id = p_scope;
  if v_existing.id is null then
    insert into custom.record (id, organization_id, table_id, data_class, data, created_by, visibility, metadata, deleted_at)
    values (p_scope, p_org, p_type, 'record', v_data, coalesce(nullif(p_spec ->> 'created_by', '')::uuid, auth.uid()),
            v_vis::platform.visibility,
            jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_scope::text)),
            v_deleted);
    v_did := 'made';
  else
    if (v_existing.deleted_at is null) <> (v_deleted is null) or v_existing.visibility::text <> v_vis then
      update custom.record set deleted_at = v_deleted, visibility = v_vis::platform.visibility
       where organization_id = p_org and id = p_scope;
      v_did := case when v_deleted is null then 'restored' else 'archived' end;
    end if;
    for v_k, v_v in select e.key, e.value from jsonb_each(v_data) e loop
      if (v_existing.data -> v_k) is distinct from v_v then
        v_patch := v_patch || jsonb_build_object(v_k, v_v);
      end if;
    end loop;
    if v_patch <> '{}'::jsonb then
      update custom.record set data = data || v_patch where organization_id = p_org and id = p_scope;
      v_did := coalesce(v_did, 'updated');
    end if;
  end if;
  return jsonb_build_object('record', p_scope, 'did', coalesce(v_did, 'current'));
end;
$function$

;

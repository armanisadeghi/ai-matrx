-- INVERSE of migrations/campaign/scopeshomes_every_column_a_scope_reader_uses_has_a_home_in_the_store.sql (lane SCOPES-STORE-HOMES).
-- chair-step: puts back the seven bodies it replaced, byte for byte as production held them (own words kept in metadata.moved_from.carried, the store halves without the scope's slug and sort order Fields, custom._ctx_upsert_doc without the exact list compare, own_words_copied and Switch back over the SCOPES-TAILS words only), then drops the two functions it added. Keys already written into Tables', Fields' and Records' documents stay (the slug and sort order Fields stay declared; harmless, and the next copy under the old bodies leaves them).
-- based-on: custom._ctx_own_words(text, jsonb) 4b7784a7b3753c5dbf68e2aeb70668f62215cc6cf5b0adc85eaea0aa9e6eb746
-- based-on: platform.cutover_scope_own_words(uuid) fae490e119d124dd6ecd2f5f57054ae0f53d2ecca11eb4a18e0c795add6a3cf4
-- based-on: platform._cutover_scope_own_words_back(uuid) 1b1e8fb54ad1401f72d527ccd413dd9357c666c8f6b84c38947e18420162c576
-- based-on: custom._ctx_upsert_doc(uuid, uuid, uuid, text, jsonb, jsonb, timestamp with time zone, uuid) 4305aac925f1f57cbb20b71eae8424eb782c88c4f4cd287150b8375230368039
-- based-on: custom._ctx_store_type(uuid, uuid, jsonb) 8d7d1d0ae47bcbab2cdafb8dd5ce15bc16815ef84ebe20802f513afbfaf8a889
-- based-on: custom._ctx_store_item(uuid, uuid, uuid, jsonb) 4fbd5b0c5c2988af733315d0dac1ea393037e89d681d682d408019bdb81aa94d
-- based-on: custom._ctx_store_scope(uuid, uuid, uuid, jsonb) 08b5825e5e7eabe5066972620b5206ad6df24c6f0240f76c0021be6cc7c47025

CREATE OR REPLACE FUNCTION custom._ctx_own_words(p_kind text, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select case when p_kind = 'type' then
    jsonb_strip_nulls(jsonb_build_object(
      'description', nullif(p_spec ->> 'description', ''),
      'sort_order', case when coalesce(nullif(p_spec ->> 'sort_order', '')::int, 0) <> 0 then (p_spec ->> 'sort_order')::int end))
  else
    jsonb_strip_nulls(jsonb_build_object(
      'category', nullif(p_spec ->> 'category', ''),
      'tags', case when jsonb_typeof(p_spec -> 'tags') = 'array' and jsonb_array_length(p_spec -> 'tags') > 0
                   then (select jsonb_agg(t order by o) from jsonb_array_elements_text(p_spec -> 'tags') with ordinality e(t, o)) end,
      'status_note', nullif(p_spec ->> 'status_note', '')))
  end
$function$

;

CREATE OR REPLACE FUNCTION platform.cutover_scope_own_words(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with pairs as (
    select 'type'::text as kind, coalesce(nullif(t.label_plural, ''), t.label_singular) as what,
           custom._ctx_own_words('type', to_jsonb(t)) as said,
           coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(coalesce(r.metadata -> 'moved_from' -> 'carried', '{}'::jsonb)) e
                      where e.key in ('description', 'sort_order')), '{}'::jsonb) as kept
      from context.scope_types t
      join custom.record r on r.organization_id = p_org and r.id = t.id and r.deleted_at is null
     where t.organization_id = p_org and t.deleted_at is null
    union all
    select 'field', coalesce(nullif(t.label_plural, ''), t.label_singular) || ' · ' || coalesce(nullif(i.display_name, ''), i.key),
           custom._ctx_own_words('item', to_jsonb(i)),
           coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(coalesce(r.metadata -> 'moved_from' -> 'carried', '{}'::jsonb)) e
                      where e.key in ('category', 'tags', 'status_note')), '{}'::jsonb)
      from context.context_items i
      join context.scope_types t on t.id = i.scope_type_id and t.organization_id = p_org and t.deleted_at is null
      join custom.record r on r.organization_id = p_org and r.id = i.id and r.deleted_at is null
     where i.deleted_at is null
  ), differ as (
    select kind, what,
           (select string_agg(k, ', ' order by k) from (select jsonb_object_keys(said) k union select jsonb_object_keys(kept)) ks
             where said -> k is distinct from kept -> k) as words
      from pairs where said is distinct from kept
  )
  select jsonb_build_object(
    'count', (select count(*) from differ),
    'by_kind', jsonb_build_object('types', (select count(*) from differ where kind = 'type'),
                                  'fields', (select count(*) from differ where kind = 'field')),
    'examples', coalesce((select jsonb_agg(x) from (select format('%s (%s)', what, words) as x from differ order by kind desc, what limit 5) s), '[]'::jsonb))
$function$

;

CREATE OR REPLACE FUNCTION platform._cutover_scope_own_words_back(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_types int; v_items int;
begin
  with kept as (
    select t.id, r.metadata -> 'moved_from' -> 'carried' as c
      from context.scope_types t
      join custom.record r on r.organization_id = p_org and r.id = t.id
     where t.organization_id = p_org
       and r.metadata -> 'moved_from' -> 'carried' ?| array['description', 'sort_order']
  )
  update context.scope_types t
     set description = case when k.c ? 'description' then k.c ->> 'description' else t.description end,
         sort_order  = case when k.c ? 'sort_order' then (k.c ->> 'sort_order')::smallint else t.sort_order end
    from kept k
   where t.id = k.id
     and ((k.c ? 'description' and t.description is distinct from k.c ->> 'description')
       or (k.c ? 'sort_order' and t.sort_order is distinct from (k.c ->> 'sort_order')::smallint));
  get diagnostics v_types = row_count;

  with kept as (
    select i.id, r.metadata -> 'moved_from' -> 'carried' as c
      from context.context_items i
      join context.scope_types t on t.id = i.scope_type_id and t.organization_id = p_org
      join custom.record r on r.organization_id = p_org and r.id = i.id
     where r.metadata -> 'moved_from' -> 'carried' ?| array['category', 'tags', 'status_note']
  )
  update context.context_items i
     set category    = case when k.c ? 'category' then k.c ->> 'category' else i.category end,
         tags        = case when k.c ? 'tags' then array(select jsonb_array_elements_text(k.c -> 'tags')) else i.tags end,
         status_note = case when k.c ? 'status_note' then k.c ->> 'status_note' else i.status_note end
    from kept k
   where i.id = k.id
     and ((k.c ? 'category' and i.category is distinct from k.c ->> 'category')
       or (k.c ? 'tags' and i.tags is distinct from array(select jsonb_array_elements_text(k.c -> 'tags')))
       or (k.c ? 'status_note' and i.status_note is distinct from k.c ->> 'status_note'));
  get diagnostics v_items = row_count;
  return jsonb_build_object('scope_types', v_types, 'context_fields', v_items);
end;
$function$

;

CREATE OR REPLACE FUNCTION custom._ctx_upsert_doc(p_org uuid, p_id uuid, p_kernel uuid, p_class text, p_doc jsonb, p_stamp jsonb, p_deleted timestamp with time zone, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_dropped text[] := array(select k from unnest(array['format', 'display_format', 'unit', 'default', 'review_interval_days',
                                                        'relation_target', 'relation_max', 'on_target_delete', 'compute_on',
                                                        'parity_type', 'table_token']) k
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
                    is distinct from coalesce(p_stamp -> 'moved_from' -> 'carried', '{}'::jsonb)))
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

  if (p_spec -> 'max_assignments_per_entity') is not null and jsonb_typeof(p_spec -> 'max_assignments_per_entity') <> 'null' then
    v_carried := v_carried || jsonb_build_object('max_assignments_per_entity', p_spec -> 'max_assignments_per_entity');
  end if;
  if jsonb_typeof(p_spec -> 'default_variable_keys') = 'array' and jsonb_array_length(p_spec -> 'default_variable_keys') > 0 then
    v_carried := v_carried || jsonb_build_object('default_variable_keys', p_spec -> 'default_variable_keys');
  end if;
  -- WHAT THE TYPE SAYS ABOUT ITSELF THAT A TABLE HAS NO COLUMN FOR YET (lane SCOPES-TAILS): its
  -- description and its sort order, kept whole beside the pointer (scopes.own_words, the mover's twin).
  v_carried := v_carried || custom._ctx_own_words('type', p_spec);
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
    'default_sort', '[{"field": "name", "direction": "asc"}]'::jsonb,
    'row_order', 'sorted', 'agent_writable', true,
    'fields', v_fields, 'title_field', 'name', 'parent_id', v_home::text,
    'kept_by_the_app', true, 'kept_for', 'context', 'offered_as_context', true);
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
    -- The field list, now that every Field exists.
    v_doc := v_doc || jsonb_build_object('fields', custom._ctx_table_fields(p_org, p_type));
    perform custom._ctx_upsert_doc(p_org, p_type, custom.table_kernel_id(), 'table', v_doc, v_stamp, null);
  else
    -- ARCHIVED: what the old side's cascade took with it is archived by its own rows; the Table last.
    update custom.record f set deleted_at = v_deleted
     where f.organization_id = p_org and f.table_id = custom.field_kernel_id()
       and f.data ->> 'entity_definition_id' = p_type::text
       and f.id in (custom._ctx_id('scope-column-field', p_type::text, 'name'),
                    custom._ctx_id('scope-column-field', p_type::text, 'description'))
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
    v_used := coalesce(v_used, '{}') || array['name'];
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

  if coalesce(p_spec ->> 'status', 'active') <> 'active' then
    v_carried := v_carried || jsonb_build_object('status', p_spec ->> 'status');
  end if;
  if not v_active then
    v_carried := v_carried || '{"is_active": false}'::jsonb;
  end if;
  -- WHAT THE ITEM SAYS ABOUT ITSELF THAT A FIELD HAS NO COLUMN FOR YET (lane SCOPES-TAILS): its
  -- category, its tags and its status note, kept whole beside the pointer (scopes.own_words).
  v_carried := v_carried || custom._ctx_own_words('item', p_spec);
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
    true);

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
begin
  if not custom._ctx_table_live(p_org, p_type) then
    return jsonb_build_object('record', p_scope, 'did', 'table_archived');
  end if;
  select f.data ->> 'key' into v_desc from custom.record f
   where f.organization_id = p_org and f.id = custom._ctx_id('scope-column-field', p_type::text, 'description');
  v_desc := coalesce(v_desc, 'description');

  v_data := jsonb_build_object('name', p_spec -> 'name', v_desc, p_spec -> 'description');
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
        v_taken := coalesce(v_taken, '{}') || array['name', 'description'];
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

drop function if exists custom._ctx_scope_columns(uuid, uuid);
drop function if exists custom._ctx_scope_slug(text);

-- chair-step: lane SCOPES-STORE-HOMES, second file. scopessidefx_the_store_halves_refuse_what_the_old_triggers_refused.sql (applied 19:20Z) replaced custom._ctx_store_item and custom._ctx_store_scope from their pre-SCOPES-STORE-HOMES bodies, so the item's own words went back into metadata and the scope's slug and sort order stopped landing. This puts SCOPES-STORE-HOMES' lines back onto the CURRENT bodies, keeping every SCOPES-SIDE-EFFECTS check (parent of the right type, dataset-template field). Writes no scope data at apply.
-- based-on: custom._ctx_store_item(uuid, uuid, uuid, jsonb) 20fffb9e35c620f9339550b8e03fee1974e537ddda8672e7d9f480e1cd3ee8b3
-- based-on: custom._ctx_store_scope(uuid, uuid, uuid, jsonb) d410e8434da898a14e7006ed7e03a1f2ef0de06bd02291f0d961b31567df1ebe
-- lane: SCOPES-STORE-HOMES
-- INVERSE: migrations/inverse/scopeshomes_the_store_halves_keep_the_scope_columns_beside_the_side_effect_checks_down.sql
-- window-class: two function bodies; no DDL on any table. Applied directly (owner, 2026-09-24).

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
  -- THE OLD DATASET-TEMPLATE RULE (context.enforce_context_item_reference_source), read from the store
  -- (lane SCOPES-SIDE-EFFECTS). An archive is never refused.
  perform custom._ctx_dataset_field_holds(p_org, p_spec);
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
  -- THE OLD PARENT RULE (public.ctx_validate_scope_parent), read from the store (lane SCOPES-SIDE-EFFECTS).
  -- An archive is never refused.
  if nullif(p_spec ->> 'deleted_at', '') is null then
    perform custom._ctx_scope_parent_holds(p_org, p_type, nullif(p_spec ->> 'parent_scope_id', '')::uuid);
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

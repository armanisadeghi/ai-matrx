-- INVERSE of migrations/campaign/scopeshomes_a_copied_scope_type_field_and_scope_keep_their_author.sql (lane SCOPES-STORE-HOMES).
-- chair-step: puts back the three bodies as production held them (authors stamped on insert only). Authors already re-stamped stay.
-- ground-standing-ok: b — this inverse undoes only the author carry and is meant to run ALONE, newest first: the bodies it restores call custom._ctx_scope_columns, which stays standing until the older sibling scopeshomes_every_column_a_scope_reader_uses_has_a_home_in_the_store_down.sql runs, and that inverse restores a _ctx_store_type that no longer calls it before dropping it.
-- based-on: custom._ctx_upsert_doc(uuid, uuid, uuid, text, jsonb, jsonb, timestamp with time zone, uuid) 573681e1f91eaadf6ddf6cce40de8f1672372df007356534d1fa505778812fb9
-- based-on: custom._ctx_store_type(uuid, uuid, jsonb) 13fe3ea5c32a863c412711bb46fd83e06e35cb250c5158320b45f235972d0eec
-- based-on: custom._ctx_store_scope(uuid, uuid, uuid, jsonb) 852b4a6101e06fcce113a4b85d11edcd233306d2fc2b90e7dc03d4d8f18eedaa

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
  -- A SETTINGS KEY THE OLD ROW NO LONGER CARRIES IS CLEARED ON THE RECORD TOO (lane SCOPES-READS-ACCESS).
  -- The loop above writes only the keys the row still says, so a key it removed (a class's join code
  -- disabled by edu_class_join_code, a teacher emptied in the class settings) stayed on the Record: a
  -- reader of the store would admit a person with a join code its owner had disabled. Every caller
  -- (the bridge, custom._ctx_store_value) hands this half the WHOLE old row, so a settings key absent
  -- from it is a key the row no longer has. Only the Fields this half made for settings keys are
  -- touched — each named by its note and proved by its id, the one both twins derive — never a
  -- context item's Field, never name / description / slug / sort order.
  if v_existing.id is not null and p_spec ? 'settings' then
    for v_k in
      select f.data ->> 'key'
        from custom.record f
        cross join lateral regexp_match(f.metadata -> 'moved_from' ->> 'note',
                                        '^the ''(.*)'' key of this type''s scopes'' settings') m
       where f.organization_id = p_org
         and f.table_id = custom.field_kernel_id()
         and f.data ->> 'entity_definition_id' = p_type::text
         and f.metadata -> 'moved_from' ->> 'table' = 'context.scopes'
         and f.data ? 'key'
         and f.id = custom._ctx_id('scope-setting-field', p_type::text, m[1])
         and (jsonb_typeof(p_spec -> 'settings') is distinct from 'object'
              or jsonb_typeof(coalesce(p_spec -> 'settings' -> m[1], 'null'::jsonb)) = 'null')
    loop
      if jsonb_typeof(coalesce(v_existing.data -> v_k, 'null'::jsonb)) <> 'null' then
        v_data := v_data || jsonb_build_object(v_k, null);
      end if;
    end loop;
  end if;
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


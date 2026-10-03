-- draft: claude-w2w clone-proven only; production apply waits on the lane manager (W2-W round 2)
-- chair-step: it REPLACES the bodies of two lane-9 scope helpers (no door, no grant, no change to the chair's record doors or the access ladder). custom._ctx_store_type — the write-through half that copies a scope type into its store Table — now carries the old row's parent_type_id into the Table's document, the key custom._ctx_scope_parent_holds already reads for the type-level parent rule; until now it dropped it, so the store refused every scope of an inner type filed under a scope of its parent type ("Cross-type nesting is not allowed for this type") although the old tables accepted it. custom.scope_type_row_of reports that parent instead of a hard-coded null.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom._ctx_store_type(uuid, uuid, jsonb) 3f32377da3012543367381843fa070391b2d41aa11010560fe0a6f399e67a694
-- based-on: custom.scope_type_row_of(custom.record) 9cbc65832ddadcf59c49eb10c756220e7ab38c8e52fc26c2a248e74b8eed480a
-- lock: custom
--
-- Inverse: migrations/inverse/scopesw2w_a_scope_type_under_a_type_keeps_its_parent_in_the_store_down.sql.
--
-- THE USE CASE. Alex Hart's Workspace keeps a Brand Color scope type (Red, Blue) and, filed under it, a
-- Shade type: Crimson and Scarlet are shades of Red, Navy of Blue. Filing Crimson under Red is refused by
-- the store today and accepted by the old tables; after this file both accept it, and both refuse Crimson
-- filed under a scope of any other type.
-- Guard: scripts/campaign-tests/scopesw2w_a_scope_type_under_a_type_keeps_its_parent_red_green.sql.

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
    || custom._ctx_own_words('type', p_spec)
    -- LANE 9 W2-W: A SCOPE TYPE FILED UNDER ANOTHER KEEPS ITS PARENT TYPE IN THE STORE. The old row's
    -- parent_type_id is the type-level parent rule custom._ctx_scope_parent_holds already reads from the
    -- Table's document; until now it was never written there, so the store refused every scope of an
    -- inner type under a scope of its parent type ("Cross-type nesting is not allowed for this type").
    || case when nullif(p_spec ->> 'parent_type_id', '') is not null
            then jsonb_build_object('parent_type_id', p_spec ->> 'parent_type_id') else '{}'::jsonb end;
  if v_doc -> 'icon' is null then v_doc := v_doc || '{"icon": null}'::jsonb; end if;
  if v_doc -> 'color' is null then v_doc := v_doc || '{"color": null}'::jsonb; end if;
  -- A MEMBER EDITS A SCOPE AS SHE DOES TODAY (lane SCOPES-READS-ACCESS; chair ruling 2026-09-29 (5)). The old
  -- scope rules give every member of the organization editor on every internal scope (the access kernel's
  -- organization lane for `scope`); the store's member default is viewer. The Table's own knob
  -- `member_default_level` (read by iam.member_default_level, above the organization's knob) carries editor —
  -- written only when the Table does not already say a level, so an owner's own choice is never overwritten.
  if not exists (select 1 from custom.record t
                  where t.organization_id = p_org and t.id = p_type and t.data ? 'member_default_level') then
    v_doc := v_doc || '{"member_default_level": "editor"}'::jsonb;
  end if;

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
    perform custom._ctx_upsert_doc(p_org, p_type, custom.table_kernel_id(), 'table', v_doc, v_stamp, null,
                                   nullif(p_spec ->> 'created_by', '')::uuid);
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
                                    v_stamp, v_deleted, nullif(p_spec ->> 'created_by', '')::uuid);
  end if;
  -- AN OLD ROW THAT NAMES NOBODY IS COPIED NAMING NOBODY (lane SCOPES-STORE-HOMES, chair ruling from L7,
  -- 2026-09-29): the writer's uid or the organization owner the store's fallback filled in would hand that
  -- person an owner's reach over this row that nobody has today. The stamp is the copy's own.
  if p_spec ? 'created_by' and jsonb_typeof(p_spec -> 'created_by') = 'null' then
    update custom.record set created_by = null where organization_id = p_org and id = p_type and created_by is not null;
  end if;
  -- A parent type taken away comes off the Table too (the old row says no parent).
  if p_spec ? 'parent_type_id' and nullif(p_spec ->> 'parent_type_id', '') is null then
    update custom.record set data = data - 'parent_type_id'
     where organization_id = p_org and id = p_type and data ? 'parent_type_id';
    if found then v_did := coalesce(v_did, 'updated'); end if;
  end if;
  return jsonb_build_object('table', p_type, 'did', v_did);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.scope_type_row_of(p_table custom.record)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select jsonb_build_object(
    'id', p_table.id,
    'organization_id', p_table.organization_id,
    -- The Table's parent_id is its home; a type filed under another type says so in parent_type_id
    -- (lane 9 W2-W, written by custom._ctx_store_type from the old row).
    'parent_type_id', coalesce(p_table.data -> 'parent_type_id', 'null'::jsonb),
    'label_singular', p_table.data -> 'label_singular',
    'label_plural', p_table.data -> 'label_plural',
    'icon', coalesce(p_table.data -> 'icon', 'null'::jsonb),
    'description', coalesce(p_table.data ->> 'description', ''),
    'color', coalesce(p_table.data -> 'color', 'null'::jsonb),
    'sort_order', coalesce(nullif(p_table.data ->> 'sort_order', '')::int, 0),
    'max_assignments_per_entity', coalesce(p_table.data -> 'max_assignments_per_entity', 'null'::jsonb),
    'default_variable_keys', coalesce(p_table.data -> 'default_variable_keys', '[]'::jsonb),
    'created_at', p_table.created_at,
    'updated_at', p_table.updated_at,
    -- The store's slug grammar writes `_` where the old one wrote `-` (no old type slug has `_`).
    'slug', replace(p_table.data ->> 'slug', '_', '-'),
    'deleted_at', p_table.deleted_at,
    'version', p_table.version,
    'updated_by', p_table.updated_by,
    'metadata', '{}'::jsonb,
    'created_by', p_table.created_by,
    'custom_fields', p_table.custom_fields)
$function$;

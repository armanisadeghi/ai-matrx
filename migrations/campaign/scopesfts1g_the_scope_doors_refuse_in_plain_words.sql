-- chair-step: the scope store halves refuse duplicates and malformed fields in plain words ("A scope named “Dr. Maya Ellison” already exists in Referring Physicians.") instead of the old constraint sentences; same SQLSTATEs (23505 / 23514), the constraint name moves to DETAIL. Also rewords one comment in public.__scope_access_membrane_conformance that named the old value table.
-- lane: FINISH-THE-SWITCH (FTS-1g, scopes to zero, item 5)
-- based-on: __scope_access_membrane_conformance() 96bc9d4dc0df061151aff2045a928f583153eeac349e67b285e423ca918ce068
-- based-on: custom._ctx_store_item(uuid,uuid,uuid,jsonb) 05345b194b60acf5ab92cd64cf98084d3d23b52c290eebf537b4f123835b4166
-- based-on: custom._ctx_store_scope(uuid,uuid,uuid,jsonb) 305cbef49e59479e5a5fc7f110423517d6efc26a99cb7735cf77bda097cff065
-- based-on: custom._ctx_store_type(uuid,uuid,jsonb) def691f5c02e4b63bbcaf1c32e7f56ed6356fdf3d6951d663ed24f35d2147d51
-- lock: custom,public
-- window-class: none — four function bodies; no DDL on any table.
--
-- Inverse: migrations/inverse/scopesfts1g_the_scope_doors_refuse_in_plain_words_down.sql.
--
-- THE USE CASE. Cedar Ridge Physical Therapy adds "Dr. Maya Ellison" to Referring Physicians a second time; the screen says
-- "A scope named “Dr. Maya Ellison” already exists in Referring Physicians." instead of a database sentence.

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
  -- THE OLD TABLE'S UNIQUE RULES, ASKED BY THE STORE (FTS-1d): unique_type_per_org (one live type per label) and
  -- ctx_scope_types_org_slug_uniq (one live type per slug) refused through the image row; the store half now asks
  -- them itself, in the same class and the same words, so they hold when the old row is no longer written.
  if v_deleted is null then
    if exists (select 1 from custom.record t
                where t.organization_id = p_org and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
                  and t.deleted_at is null and t.id <> p_type and t.data ->> 'label_singular' = p_spec ->> 'label_singular') then
      raise exception 'A scope type named “%” already exists.', p_spec ->> 'label_singular' using errcode = '23505',
        detail = format('unique_type_per_org: Key (organization_id, label_singular)=(%s, %s) already exists.', p_org, p_spec ->> 'label_singular');
    end if;
    if nullif(p_spec ->> 'slug', '') is not null and exists (select 1 from custom.record t
                where t.organization_id = p_org and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
                  and t.deleted_at is null and t.id <> p_type and replace(t.data ->> 'slug', '_', '-') = p_spec ->> 'slug') then
      raise exception 'A scope type with the key “%” already exists.', p_spec ->> 'slug' using errcode = '23505',
        detail = format('ctx_scope_types_org_slug_uniq: Key (organization_id, slug)=(%s, %s) already exists.', p_org, p_spec ->> 'slug');
    end if;
  end if;
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
  -- CD-LADDER (2026-10-03): a custom record is never 'personal' (every Table starts at Organization);
  -- a spec that says so means "Only me", which is Shown to (written on insert below).
  v_vis      text := case when nullif(p_spec ->> 'visibility', '') = 'personal' then 'internal'
                          else coalesce(nullif(p_spec ->> 'visibility', ''), 'internal') end;
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
    raise exception 'A scope needs a name with letters or numbers in it, and "%" has none.', coalesce(p_spec ->> 'name', '<null>')
      using errcode = '22023', detail = 'ensure_slug: could not derive a slug (empty after normalization).';
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
  -- ONE LIVE SCOPE PER NAME UNDER ONE PARENT IN A TYPE (FTS-1d): idx_scope_unique_top / idx_scope_unique_nested
  -- refused through the image row; the store half asks it itself, in the same class and words.
  if v_deleted is null and exists (
       select 1 from custom.record x
        where x.organization_id = p_org and x.table_id = p_type and x.data_class = 'record' and x.deleted_at is null
          and x.id <> p_scope and x.data ->> 'name' = p_spec ->> 'name'
          and coalesce(x.data ->> 'parent_id', '') = coalesce(p_spec ->> 'parent_scope_id', '')) then
    if nullif(p_spec ->> 'parent_scope_id', '') is null then
      raise exception 'A scope named “%” already exists in %.', p_spec ->> 'name', (select coalesce(t.data ->> 'label_plural', t.data ->> 'label_singular', 'this type') from custom.record t where t.organization_id = p_org and t.id = p_type) using errcode = '23505',
        detail = format('idx_scope_unique_top: Key (organization_id, scope_type_id, name)=(%s, %s, %s) already exists.', p_org, p_type, p_spec ->> 'name');
    end if;
    raise exception 'A scope named “%” already exists under “%” in %.', p_spec ->> 'name',
      (select coalesce(x.data ->> 'name', 'its parent') from custom.record x where x.organization_id = p_org and x.id::text = p_spec ->> 'parent_scope_id'),
      (select coalesce(t.data ->> 'label_plural', t.data ->> 'label_singular', 'this type') from custom.record t where t.organization_id = p_org and t.id = p_type) using errcode = '23505',
      detail = format('idx_scope_unique_nested: Key (organization_id, scope_type_id, parent_scope_id, name)=(%s, %s, %s, %s) already exists.',
                      p_org, p_type, p_spec ->> 'parent_scope_id', p_spec ->> 'name');
  end if;
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
    insert into custom.record (id, organization_id, table_id, data_class, data, created_by, published_to_web, shown_to, metadata, deleted_at)
    values (p_scope, p_org, p_type, 'record', v_data, coalesce(nullif(p_spec ->> 'created_by', '')::uuid, auth.uid()),
            (v_vis = 'public'),
            case when p_spec ->> 'visibility' = 'personal' then 'only_me'::platform.shown_to end,
            jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_scope::text)),
            v_deleted);
    v_did := 'made';
  else
    if (v_existing.deleted_at is null) <> (v_deleted is null) or v_existing.published_to_web is distinct from (v_vis = 'public') then
      update custom.record set deleted_at = v_deleted, published_to_web = (v_vis = 'public')
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
    -- WHO MADE THE SCOPE, AS THE OLD ROW SAYS (lane SCOPES-STORE-HOMES).
    if nullif(p_spec ->> 'created_by', '')::uuid is not null
       and v_existing.created_by is distinct from (p_spec ->> 'created_by')::uuid then
      update custom.record set created_by = (p_spec ->> 'created_by')::uuid where organization_id = p_org and id = p_scope;
      v_did := coalesce(v_did, 'updated');
    end if;
  end if;
  -- AN OLD ROW THAT NAMES NOBODY IS COPIED NAMING NOBODY (lane SCOPES-STORE-HOMES, chair ruling from L7,
  -- 2026-09-29): the writer's uid or the organization owner the store's fallback filled in would hand that
  -- person an owner's reach over this row that nobody has today. The stamp is the copy's own.
  if p_spec ? 'created_by' and jsonb_typeof(p_spec -> 'created_by') = 'null' then
    update custom.record set created_by = null where organization_id = p_org and id = p_scope and created_by is not null;
  end if;
  return jsonb_build_object('record', p_scope, 'did', coalesce(v_did, 'current'));
end;
$function$;

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

  -- THE OLD TABLE'S ROW RULES, ASKED BY THE STORE (FTS-1d), in the order the old row asked them (its check
  -- constraints by name, then its unique key) and in the same class and words: a description of at most 500
  -- characters, a key of lower-case letters, digits and underscores, at least one item, a reference that names the
  -- kinds it may point at, and one active field per key in a type.
  if char_length(p_spec ->> 'description') > 500 then
    raise exception 'A field description is at most 500 characters; this one has %.', char_length(p_spec ->> 'description') using errcode = '23514', detail = 'context_items_description_length';
  end if;
  if (p_spec ->> 'key') !~ '^[a-z0-9_]+$' then
    raise exception 'A field key uses lower-case letters, digits and underscores only; “%” does not.', p_spec ->> 'key' using errcode = '23514', detail = 'context_items_key_format';
  end if;
  if jsonb_typeof(p_spec -> 'max_items') = 'number' and (p_spec ->> 'max_items')::numeric < 1 then
    raise exception 'A field holds at least one item; % is not allowed.', p_spec ->> 'max_items' using errcode = '23514', detail = 'context_items_max_items_positive';
  end if;
  if p_spec ->> 'value_type' = 'reference'
     and (jsonb_typeof(p_spec -> 'allowed_reference_types') is distinct from 'array'
          or jsonb_array_length(p_spec -> 'allowed_reference_types') = 0) then
    raise exception 'A reference field needs at least one kind it may point at.' using errcode = '23514', detail = 'context_items_reference_types_required';
  end if;
  if v_active and exists (
       select 1 from custom.record f
        where f.organization_id = p_org and f.table_id = custom.field_kernel_id() and f.data_class = 'field'
          and f.data ->> 'entity_definition_id' = p_type::text and f.id <> p_item
          and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items'
          and coalesce((f.metadata #>> '{moved_from,carried,is_active}')::boolean, true)
          and f.data ->> 'key' = p_spec ->> 'key') then
    raise exception 'A field with the key “%” already exists in %.', p_spec ->> 'key', (select coalesce(t.data ->> 'label_plural', t.data ->> 'label_singular', 'this type') from custom.record t where t.organization_id = p_org and t.id = p_type) using errcode = '23505',
      detail = format('context_items_key_per_type: Key (scope_type_id, key)=(%s, %s) already exists.', p_type, p_spec ->> 'key');
  end if;

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
  -- AN OLD ROW THAT NAMES NOBODY IS COPIED NAMING NOBODY (lane SCOPES-STORE-HOMES, chair ruling from L7,
  -- 2026-09-29): the writer's uid or the organization owner the store's fallback filled in would hand that
  -- person an owner's reach over this row that nobody has today. The stamp is the copy's own.
  if p_spec ? 'created_by' and jsonb_typeof(p_spec -> 'created_by') = 'null' then
    update custom.record set created_by = null where organization_id = p_org and id = p_item and created_by is not null;
  end if;
  return jsonb_build_object('field', p_item, 'key', v_key, 'did', v_did);
end;
$function$;

CREATE OR REPLACE FUNCTION public.__scope_access_membrane_conformance()
 RETURNS TABLE(check_key text, ok boolean, severity text, detail jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c_refs constant text := 'context\.(scopes|context_items|context_item_values)';
  c_values constant text := 'context\.context_item_values';
  c_call constant text := '(context\._(assert_scope_readable|scope_readable|scope_readable_for|readable_scope_ids)|custom\.levels_of|custom\.seen_among|custom\.resolve_context)\s*\(';
  -- STORE-READ-PERF-5: custom.seen_among is custom.levels_of's "s" (the one ladder's viewer answer),
  -- asked once per class of look-alike records and through levels_of itself for every other id.
  v_unregistered text[];
  v_stale text[];
  v_lost text[];
  v_wrongclass text[];
  v_listdoors text[];
  v_pols jsonb;
  v_sel text;
begin
  check_key := 'membrane_helpers_installed';
  detail := (select jsonb_object_agg(p.proname, jsonb_build_object('definer', p.prosecdef))
               from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'context'
                and p.proname in ('_scope_readable','_scope_readable_for','_assert_scope_readable',
                                  '_scope_denial_message','_readable_scope_ids'));
  ok := (select count(*) = 5 and bool_and(p.prosecdef)
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'context'
            and p.proname in ('_scope_readable','_scope_readable_for','_assert_scope_readable',
                              '_scope_denial_message','_readable_scope_ids'));
  severity := 'error';
  if not ok then detail := coalesce(detail,'{}'::jsonb) || jsonb_build_object(
    'why','All five membrane helpers must exist and be SECURITY DEFINER. As INVOKER they would ask the question through the caller''s own RLS and answer "no" to everybody.'); end if;
  return next;

  select array_agg(n.nspname || '.' || p.proname order by n.nspname, p.proname)
    into v_unregistered
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','context') and p.prosecdef
    and p.prosrc ~ c_refs
    and n.nspname || '.' || p.proname <> 'public.__scope_access_membrane_conformance'
    and not exists (select 1 from context.scope_door_registry r
                     where r.function_name = n.nspname || '.' || p.proname);
  check_key := 'all_scope_doors_registered';
  ok := v_unregistered is null;
  severity := 'error';
  detail := jsonb_build_object(
    'why','A new SECURITY DEFINER function reads the scopes tables and nobody has decided what it is. Either make it call context._assert_scope_readable and register it as `membraned`, or register it with the class and the reason it does not need one: insert into context.scope_door_registry.',
    'unregistered', coalesce(to_jsonb(v_unregistered),'[]'::jsonb));
  return next;

  select array_agg(r.function_name order by r.function_name)
    into v_stale
  from context.scope_door_registry r
  where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname || '.' || p.proname = r.function_name and p.prosecdef);
  check_key := 'registry_has_no_stale_rows';
  ok := v_stale is null;
  severity := 'error';
  detail := jsonb_build_object(
    'why','These registry rows name a SECURITY DEFINER function that does not exist. Delete the row, or restore the function.',
    'stale', coalesce(to_jsonb(v_stale),'[]'::jsonb));
  return next;

  select array_agg(r.function_name order by r.function_name)
    into v_lost
  from context.scope_door_registry r
  join pg_proc p on true
  join pg_namespace n on n.oid = p.pronamespace and n.nspname || '.' || p.proname = r.function_name
  where r.door_class = 'membraned'
    and p.prosecdef
    and context._strip_sql_noise(p.prosrc) !~ c_call;
  check_key := 'membraned_doors_carry_a_real_call';
  ok := v_lost is null;
  severity := 'error';
  detail := jsonb_build_object(
    'why','These doors are registered as `membraned` and their live body contains no CALL to the membrane once comments, string literals and dollar-quoted blocks are removed. A comment is not a gate (V-7 B-F2). Re-apply migrations/ctx_scope_access_membrane_b7.sql, or change the row''s class with a reason.',
    'lost', coalesce(to_jsonb(v_lost),'[]'::jsonb));
  return next;

  select array_agg(n.nspname || '.' || p.proname || ' (' || coalesce(r.door_class,'UNREGISTERED') || ')'
                   order by p.proname)
    into v_wrongclass
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  left join context.scope_door_registry r on r.function_name = n.nspname || '.' || p.proname
  where n.nspname in ('public','context') and p.prosecdef
    and p.prosrc ~ c_values
    and n.nspname || '.' || p.proname <> 'public.__scope_access_membrane_conformance'
    and coalesce(r.door_class,'') not in ('membraned','unreachable');
  check_key := 'value_doors_are_membraned';
  ok := v_wrongclass is null;
  severity := 'error';
  detail := jsonb_build_object(
    'why','RLS does not run inside a SECURITY DEFINER function. A door that serves a scope''s cell values must be class `membraned` (or provably `unreachable`) — organization membership is not the question. This is the 2026-09-11 finding on get_scope_context.',
    'offenders', coalesce(to_jsonb(v_wrongclass),'[]'::jsonb));
  return next;

  select array_agg(x.fn order by x.fn) into v_listdoors
  from (select unnest(array['public.list_scopes','public.get_scope_tree','public.search_scopes']) as fn) x
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname || '.' || p.proname = x.fn
       and context._strip_sql_noise(p.prosrc) ~ '(context\._readable_scope_ids|custom\.levels_of|custom\.seen_among)\s*\(');
  check_key := 'list_doors_filter_the_readable_set';
  ok := v_listdoors is null;
  severity := 'error';
  detail := jsonb_build_object(
    'why','These doors list scopes without filtering on context._readable_scope_ids(), so they can name a `personal` record — its name, slug, creator and visibility — to somebody the record itself refuses. On a personal legal matter the case NAME is the most sensitive field there is.',
    'unfiltered', coalesce(to_jsonb(v_listdoors),'[]'::jsonb));
  return next;

  check_key := 'values_registered_as_component_of_scope';
  detail := jsonb_build_object(
    'entity_type', (select to_jsonb(t) from (select rls_variant, is_component, is_active
                                               from platform.entity_types where token = 'context_item_value') t),
    'parents', coalesce((select jsonb_agg(jsonb_build_object('parent', er.parent_type, 'fk', er.fk_column))
                           from platform.entity_relationships er
                          where er.child_type = 'context_item_value' and er.kind = 'composition'), '[]'::jsonb),
    'why','A second composition parent (context_item) would OR an ORG-WIDE id set back into the read lane and undo the membrane. The parent is `scope`, and only `scope`.');
  ok := exists (select 1 from platform.entity_types
                 where token = 'context_item_value' and rls_variant = 'component' and is_component and is_active)
        and (select count(*) from platform.entity_relationships
              where child_type = 'context_item_value' and kind = 'composition') = 1
        and exists (select 1 from platform.entity_relationships
                     where child_type = 'context_item_value' and parent_type = 'scope' and fk_column = 'scope_id');
  severity := 'error';
  return next;

  -- values_policies_are_generated_component_lane retired 2026-10-05 (FTS-1g): the old context value table takes no
  -- client read or write (revoked 2026-10-05 04:31Z) and moves to `deprecated`; a value is a key of the scope's Record.

  check_key := 'no_anon_grants_on_values';
  detail := jsonb_build_object(
    'grants', coalesce((select jsonb_agg(privilege_type order by privilege_type)
                          from information_schema.role_table_grants
                         where table_schema = 'context' and table_name = 'context_item_values'
                           and grantee = 'anon'), '[]'::jsonb),
    'why','A table grant that only a policy stands behind is one apply_rls away from being a hole.');
  ok := not exists (select 1 from information_schema.role_table_grants
                     where table_schema = 'context' and table_name = 'context_item_values' and grantee = 'anon');
  severity := 'error';
  return next;
end;
$function$;

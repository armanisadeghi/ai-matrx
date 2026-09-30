-- target: branch,production
-- additive: yes
--   It REPLACES six function bodies with their existing signatures, security, search_path and
--   grants (public.get_scope_tree, public.list_scope_types, public.list_scope_type_items,
--   public.get_scope_context, public.get_user_full_context, public.resolve_full_context) and the
--   body of the scope membrane's own guard (public.__scope_access_membrane_conformance). It ADDS
--   seven internal helpers in custom and six copies of the old bodies in context
--   (context.<name>_from_the_image), all SECURITY INVOKER. EVERY DOOR IS BEHIND ONE SWITCH,
--   custom/scope_readers_read_the_store (seeded OFF by scopesreadstree_the_scope_readers_switch.sql):
--   while it is off each door answers from its old body exactly as before; the owner flips it. No table, column, index, trigger, policy, grant or row is touched.
-- guard: custom/scope_readers_read_the_store
-- lane: SCOPES-READS-TREE
-- lock: custom
--
-- WHY. Phase 2.1 and 2.2 of the scopes cutover (common-docs/projects/data-doctrine-adoption/v5/
-- SCOPES-CUTOVER-PLAN.md, lane L6). Since the press of 2026-09-29 every organization writes its
-- scopes to the record store first and to context.* in the same transaction, so a reader can move
-- to the store for everyone at once. These are the tree / list / values readers the caller census
-- found still called by running code:
--   get_scope_tree, list_scope_types, list_scope_type_items, get_scope_context
--       aidream scope_system/context_source.py (every agent's scope_system tool and ambient
--       injection), the web's contextItemCatalog / scopeContextView / kg-suggestions dialog;
--   get_user_full_context   the web's agent-context hierarchy (nav tree, tasks, projects);
--   resolve_full_context    every agent turn's old path, the inspector and the preview.
-- Each keeps its arguments and its returned JSON. What each answer reads now:
--   a scope type   = its Table (custom.record in the table kernel, kept_for = context; same id),
--   a scope        = a Record of that Table (same id), its slug / sort order / parent / settings
--                    in the Record's own document (lane SCOPES-STORE-HOMES),
--   a context item = a Field of that Table (same id), its own words in the Field's document,
--   a value        = the Record's value for that Field's key, its version from `_values`,
--   who may see it = the store's one ladder (custom.levels_of, the answer custom.read_record and
--                    custom.resolve_context read), no longer iam.accessible_entity_ids('scope').
-- With the switch on, resolve_full_context is a wrapper over custom.resolve_context for the person it names
-- (the path every organization's agents have taken since the press).
--
-- DELIBERATE DIFFERENCES (each proven by the shadow compare; nothing else differs):
--   1. DD-112 (CUT-30): get_scope_tree no longer refuses a person who is not a member of the
--      organization before it asks the ladder. A scope shared with her (a grant, a class
--      membership) is listed; a stranger with nothing shared is still refused, in the same words.
--   2. The store's own clock: a scope's and a scope type's created_at, updated_at, updated_by and
--      version are the Record's (the copy made the Record; a value write moves it). A scope type
--      the old side left without a creator names the mover as creator.
--   3. A context item that is in the trash is no longer listed (the old list read is_active only
--      and listed 2 trashed items).
--   4. Words the store keeps in its own grammar come back in the old one where the mapping is one
--      to one; `lazy` / `batch_related` fetch hints come back as `on_demand` / `always` (the store
--      keeps on_request / include).
--   5. A reference value is handed as a fence naming the store's live targets (the chair's
--      ruling, aidream context_compare.py: a reference is the SET of its live target ids).
--   6. resolve_full_context checks every contributing scope for the person (SC-3'); its answer is
--      custom.resolve_context's, which carries `checks`, `withheld` and `context.table_ids` too.
-- RETIRED, NOT REWRITTEN (caller census 2026-09-29: no running code calls them; they stay exact
-- over the old tables while the image is written and leave with it at the contract): list_scopes,
-- search_scopes, get_entity_scopes, get_user_scopes, get_org_structure, get_value_history,
-- list_context_value_refs, scope_system_inspect.
--
-- Proof: scripts/campaign-tests/scopesreadstree_shadow_compare.sql (dev clone; every member x
-- organization and member x scope pair, the service seat, a planted divergence red).
-- based-on: public.get_scope_tree(uuid, uuid) 1dc9c8d96891780f0fb36a992f3b202137feded75337f96952a4f61761c020b9
-- based-on: public.list_scope_types(uuid) 4adf3c0f0eac0f17ba6108a75d9e83c2ed6ecd292ed8632dbe1abdf2963578ed
-- based-on: public.list_scope_type_items(uuid) d8f9860a228378153b4bce9592bb929966ce4efef884cee85472a114fe5c08df
-- based-on: public.get_scope_context(uuid, uuid[], boolean) 3422c2098635913bd45099f88ba8badac324bba6cdddadf6695ada80409924a4
-- based-on: public.get_user_full_context(uuid) aef1123011304d7ed997ff6b82e0f44594397b564aceff5899fab788e6a0c2df
-- based-on: public.resolve_full_context(uuid, text, uuid, uuid[], text[]) 285751eb5d89e696049730d31083158d45a98e7c9e897511b49274aa769339d8
-- based-on: public.__scope_access_membrane_conformance() 2972505926a74746f92f0f2f96f16459397cac0ccceaaa6040e3613891a652e2

set local lock_timeout = '2s';

-- ═══════════════════════════════════════════════════════════════ the old shapes, read from the store

-- A scope type as context.scope_types held it, from its Table.
create function custom.scope_type_row_of(p_table custom.record)
 returns jsonb
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  select jsonb_build_object(
    'id', p_table.id,
    'organization_id', p_table.organization_id,
    -- No live type has a parent type (SCOPES-STORE-HOMES census); the Table's parent_id is its home.
    'parent_type_id', null,
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

-- One settings value as context.scopes.settings held it: a text Field keeps a non-text value as its
-- JSON text (custom._ctx_words), which is read back as the value it was.
create function custom.scope_setting_back(p_value jsonb, p_behavior text)
 returns jsonb
 language plpgsql
 immutable
 set search_path to 'pg_catalog'
as $function$
declare
  v_out jsonb;
begin
  if p_value is null or p_behavior is distinct from 'text' then
    return p_value;
  end if;
  if jsonb_typeof(p_value) = 'array' then
    select coalesce(jsonb_agg(custom.scope_setting_back(e.value, 'text') order by e.ord), '[]'::jsonb)
      into v_out
      from jsonb_array_elements(p_value) with ordinality e(value, ord);
    return v_out;
  end if;
  if jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ '^\s*[\[{]' then
    begin
      return (p_value #>> '{}')::jsonb;
    exception when others then
      return p_value;
    end;
  end if;
  return p_value;
end;
$function$;

-- Every live scope of an organization's live scope Tables (or of the named ones), each as
-- context.scopes held it, with what the old readers ordered by.
create function custom.scope_rows_of(p_org uuid, p_types uuid[] default null)
 returns table(id uuid, table_id uuid, type_sort integer, sort_order integer, name text, type_doc jsonb, row_doc jsonb)
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  -- Each CTE is asked once per call, never once per scope row.
  with t as materialized (
    select x.id, x.data
      from custom.record x
     where x.organization_id = p_org
       and x.table_id = custom.table_kernel_id()
       and x.deleted_at is null
       and x.data ->> 'kept_for' = 'context'
       and (p_types is null or x.id = any (p_types))
  ), fx as materialized (
    select (f.data ->> 'entity_definition_id')::uuid as tid, f.id, f.data, f.metadata
      from custom.record f
     where f.organization_id = p_org
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and f.data ->> 'entity_definition_id' in (select t.id::text from t)
       and f.metadata -> 'moved_from' ->> 'table' = 'context.scopes'
  ), per_type as materialized (
    select t.id as tid, t.data as tdata,
           coalesce((select fx.data ->> 'key' from fx
                      where fx.id = custom._ctx_id('scope-column-field', t.id::text, 'description')),
                    'description') as desc_key,
           -- THE SETTINGS KEYS: each is a declared Field whose note names the old key.
           coalesce((select jsonb_agg(jsonb_build_object(
                              'old', substring(fx.metadata -> 'moved_from' ->> 'note' from '^the ''(.*)'' key of this type'),
                              'key', fx.data ->> 'key', 'behavior', fx.data ->> 'type'))
                       from fx
                      where fx.tid = t.id
                        and fx.metadata -> 'moved_from' ->> 'note' like 'the % key of this type''s scopes'' settings%'),
                    '[]'::jsonb) as settings_fields
      from t
  )
  select r.id, r.table_id,
         coalesce(nullif(pt.tdata ->> 'sort_order', '')::int, 0),
         coalesce(nullif(r.data ->> 'sort_order', '')::int, 0),
         r.data ->> 'name',
         pt.tdata,
         (to_jsonb(r) - array['table_id', 'data', 'data_class', 'metadata'])
         || jsonb_build_object(
              'scope_type_id', r.table_id,
              'parent_scope_id', coalesce(to_jsonb(nullif(r.data ->> 'parent_id', '')), 'null'::jsonb),
              'name', coalesce(r.data -> 'name', 'null'::jsonb),
              'description', coalesce(r.data -> pt.desc_key, 'null'::jsonb),
              'settings', case when jsonb_array_length(pt.settings_fields) = 0 then '{}'::jsonb else coalesce((select jsonb_object_agg(s ->> 'old', custom.scope_setting_back(r.data -> (s ->> 'key'), s ->> 'behavior'))
                                      from jsonb_array_elements(pt.settings_fields) s
                                     where s ->> 'old' is not null
                                       and jsonb_typeof(r.data -> (s ->> 'key')) is distinct from 'null'
                                       and r.data ? (s ->> 'key')), '{}'::jsonb) end,
              'slug', coalesce(r.data -> 'slug', 'null'::jsonb),
              'sort_order', coalesce(nullif(r.data ->> 'sort_order', '')::int, 0),
              'metadata', '{}'::jsonb,
              'published_to_web', false,
              'published_to_web_at', null,
              'published_to_web_by', null)
    from custom.record r
    join per_type pt on pt.tid = r.table_id
   where r.organization_id = p_org
     and r.table_id in (select t.id from t)
     and r.deleted_at is null
$function$;

-- A context item's old value type, from its Field (the inverse of custom._ctx_item_shape).
create function custom.scope_item_value_type(p_field jsonb, p_carried jsonb)
 returns text
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  select case
    when coalesce((p_carried ->> 'as_text')::boolean, false) then coalesce(p_carried ->> 'value_type', 'string')
    when p_field ->> 'type' = 'boolean' then 'boolean'
    when p_field ->> 'type' = 'range' then
      case coalesce(p_field ->> 'format', p_field -> 'display_format' ->> 'id')
        when 'date' then 'date' when 'datetime' then 'datetime' when 'currency' then 'currency'
        when 'percent' then 'percent' else 'number' end
    when p_field ->> 'type' = 'relation' then
      case when p_field ->> 'relation_target' = '11111111-0000-4000-8000-000000000006'
                and not (p_field ? 'allowed_reference_types') then 'document'
           else 'reference' end
    when p_field ->> 'type' = 'text' then
      case coalesce(p_field ->> 'format', p_field -> 'display_format' ->> 'id')
        when 'json' then 'object' when 'markdown' then 'markdown' when 'time' then 'time'
        when 'color' then 'color' when 'email' then 'email' when 'url' then 'url' when 'phone' then 'phone'
        else case when coalesce((p_field ->> 'multi')::boolean, false) then 'array' else 'string' end end
    else 'string' end
$function$;

-- A context item as the old list doors handed it, from its Field.
create function custom.scope_item_row_of(p_field custom.record)
 returns jsonb
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  select jsonb_build_object(
    'id', p_field.id,
    'key', p_field.data -> 'key',
    'slug', replace(p_field.data ->> 'key', '_', '-'),
    'display_name', p_field.data -> 'label',
    'description', coalesce(p_field.data ->> 'description', ''),
    'category', coalesce(p_field.data -> 'category', 'null'::jsonb),
    'value_type', custom.scope_item_value_type(p_field.data, p_field.metadata -> 'moved_from' -> 'carried'),
    'fetch_hint', case p_field.data ->> 'context_policy' when 'on_request' then 'on_demand' when 'exclude' then 'never' else 'always' end,
    'sensitivity', case p_field.data ->> 'sensitivity' when 'public' then 'public' when 'confidential' then 'restricted'
                                                      when 'restricted' then 'privileged' else 'internal' end,
    'status', coalesce(p_field.data ->> 'status', 'active'),
    'tags', coalesce(p_field.data -> 'tags', '[]'::jsonb),
    'sort_order', coalesce(nullif(p_field.data ->> 'sort', '')::int, 2) - 2,
    'custom_component', coalesce(p_field.data -> 'custom_component', 'null'::jsonb),
    'allowed_reference_types', coalesce(p_field.data -> 'allowed_reference_types', 'null'::jsonb),
    'max_items', coalesce(p_field.data -> 'max_items', '1'::jsonb),
    'allowed_scope_type_ids', coalesce(p_field.data -> 'allowed_scope_type_ids', 'null'::jsonb),
    'reference_source', coalesce(p_field.data -> 'reference_source', 'null'::jsonb))
$function$;

-- A Record's value for one Field, as the old value columns held it. A reference is handed as the
-- fence the old writers wrote, naming the store's targets (labels from the organization's own
-- search rows, where it has them).
create function custom.scope_value_columns(p_org uuid, p_field jsonb, p_value_type text, p_value jsonb)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
declare
  v_cols jsonb := jsonb_build_object('value_text', null, 'value_number', null, 'value_boolean', null,
                                     'value_json', null, 'value_date', null, 'value_timestamp', null,
                                     'value_time', null, 'value_document_url', null);
  v_multi boolean := coalesce((p_field ->> 'multi')::boolean, false);
  v_items jsonb;
  v_type  text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return v_cols;
  end if;
  if p_field ->> 'type' = 'relation' then
    if p_field ->> 'relation_target' = '11111111-0000-4000-8000-000000000006' then
      v_type := 'file';
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('file_id', e.value #>> '{}',
               'label', (select si.title from platform.search_item si
                          where si.entity_token = 'file' and si.entity_id = (e.value #>> '{}')::uuid
                            and si.organization_id = p_org limit 1))) order by e.ord)
        into v_items
        from jsonb_array_elements(case when jsonb_typeof(p_value) = 'array' then p_value else jsonb_build_array(p_value) end)
             with ordinality e(value, ord);
    elsif jsonb_array_length(coalesce(p_field -> 'config' -> 'allowed_types', '[]'::jsonb)) > 0 then
      select min(e.value ->> 'token'),
             jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', e.value ->> 'id',
               'label', (select si.title from platform.search_item si
                          where si.entity_token = e.value ->> 'token' and si.entity_id = (e.value ->> 'id')::uuid
                            and si.organization_id = p_org limit 1))) order by e.ord)
        into v_type, v_items
        from jsonb_array_elements(case when jsonb_typeof(p_value) = 'array' then p_value else jsonb_build_array(p_value) end)
             with ordinality e(value, ord)
       where jsonb_typeof(e.value) = 'object';
    else
      v_type := 'scope';
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', e.value #>> '{}',
               'label', (select t.data ->> 'name' from custom.record t
                          where t.organization_id = p_org and t.id = (e.value #>> '{}')::uuid and t.deleted_at is null))) order by e.ord)
        into v_items
        from jsonb_array_elements(case when jsonb_typeof(p_value) = 'array' then p_value else jsonb_build_array(p_value) end)
             with ordinality e(value, ord);
    end if;
    if v_items is null then
      return v_cols;
    end if;
    return v_cols || jsonb_build_object('value_text',
      E'```matrx\n' || jsonb_pretty(jsonb_build_object('matrx_version', 1, 'kind', 'reference', 'type', v_type, 'items', v_items)) || E'\n```');
  end if;
  if p_field ->> 'type' = 'boolean' then
    return v_cols || jsonb_build_object('value_boolean', p_value);
  end if;
  if p_field ->> 'type' = 'range' then
    -- A date or a moment keeps the words it was written in: a calendar date is a date, a moment
    -- with its time is a timestamp, anything else was kept as text by the old writer.
    if p_value_type in ('date', 'datetime') then
      if jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$' and p_value_type = 'date' then
        return v_cols || jsonb_build_object('value_date', p_value);
      elsif jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}[T ]\d' then
        return v_cols || jsonb_build_object('value_timestamp', to_jsonb((p_value #>> '{}')::timestamptz));
      end if;
      return v_cols || jsonb_build_object('value_text', p_value);
    end if;
    if jsonb_typeof(p_value) = 'number' or (p_value #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$' then
      return v_cols || jsonb_build_object('value_number', to_jsonb((p_value #>> '{}')::numeric));
    end if;
    return v_cols || jsonb_build_object('value_text', p_value);
  end if;
  -- TEXT: a list the old side held as one text value comes back as that text.
  if v_multi and jsonb_typeof(p_value) = 'array' then
    if jsonb_array_length(p_value) = 1 and jsonb_typeof(p_value -> 0) = 'string' then
      return v_cols || jsonb_build_object('value_text', p_value -> 0);
    end if;
    return v_cols || jsonb_build_object('value_json', p_value);
  end if;
  if p_value_type = 'object' then
    return v_cols || jsonb_build_object('value_json', custom.scope_setting_back(p_value, 'text'));
  end if;
  if jsonb_typeof(p_value) = 'string' then
    return v_cols || jsonb_build_object('value_text', p_value);
  end if;
  return v_cols || jsonb_build_object('value_json', p_value);
end;
$function$;

-- The live context items (Fields) of one scope Table, each with its Field record.
create function custom.scope_items_of(p_org uuid, p_table uuid)
 returns setof custom.record
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  select f.*
    from custom.record f
   where f.organization_id = p_org
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = p_table::text
     -- the scope's own columns (name, description, slug, sort order) and its settings keys are
     -- Fields of the Table too; they were never context items.
     and coalesce(f.metadata -> 'moved_from' ->> 'table', '') <> 'context.scopes'
$function$;


-- ═══════════════════════════════════════════════════════════════ the old bodies, behind the switch

-- While custom/scope_readers_read_the_store is false (it is seeded false by
-- scopesreadstree_the_scope_readers_switch.sql), each door below answers from these: the old bodies,
-- character for character, as SECURITY INVOKER helpers (their only caller is the definer door, so they
-- run exactly as before). They leave with the old tables at the contract.

CREATE FUNCTION context.get_scope_tree_from_the_image(p_org_id uuid, p_type_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;
  select jsonb_agg(
    to_jsonb(s) || jsonb_build_object(
      'type_label', st.label_singular,
      'type_label_plural', st.label_plural,
      'type_icon', st.icon,
      'type_color', st.color
    ) order by st.sort_order, s.sort_order, s.name
  ) into v_result
  from context.scopes s
  join context.scope_types st on s.scope_type_id = st.id
  where s.organization_id = p_org_id
    and s.deleted_at is null and st.deleted_at is null
    and s.id in (select context._readable_scope_ids())
    and (p_type_id is null or s.scope_type_id = p_type_id);
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE FUNCTION context.list_scope_types_from_the_image(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;
  select jsonb_agg(
    to_jsonb(st.*) || jsonb_build_object(
      'parent_type_label', pt.label_singular,
      'scope_count', (select count(*) from context.scopes s where s.scope_type_id = st.id and s.deleted_at is null)
    ) order by st.sort_order, st.label_singular
  ) into v_result
  from context.scope_types st
  left join context.scope_types pt on st.parent_type_id = pt.id
  where st.organization_id = p_org_id and st.deleted_at is null;
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE FUNCTION context.list_scope_type_items_from_the_image(p_scope_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_org_id uuid;
begin
  select st.organization_id
  into v_org_id
  from context.scope_types st
  where st.id = p_scope_type_id
    and st.deleted_at is null;

  if v_org_id is null then
    perform platform.refuse_not_found(format('active scope type %s not found', p_scope_type_id));
  end if;

  if (auth.role() = 'service_role' or iam.has_org_access(v_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', v_org_id)::text;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', ci.id,
      'key', ci.key,
      'slug', ci.slug,
      'display_name', ci.display_name,
      'description', ci.description,
      'category', ci.category,
      'value_type', ci.value_type,
      'fetch_hint', ci.fetch_hint,
      'sensitivity', ci.sensitivity,
      'status', ci.status,
      'tags', ci.tags,
      'sort_order', ci.sort_order,
      'custom_component', ci.custom_component,
      'allowed_reference_types', ci.allowed_reference_types,
      'max_items', ci.max_items,
      'allowed_scope_type_ids', ci.allowed_scope_type_ids,
      'reference_source', ci.reference_source
    )
    order by ci.sort_order, ci.display_name
  )
  into v_result
  from context.context_items ci
  where ci.scope_type_id = p_scope_type_id
    and ci.is_active = true;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE FUNCTION context.get_scope_context_from_the_image(p_scope_id uuid, p_item_ids uuid[] DEFAULT NULL::uuid[], p_include_empty boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope_type_id uuid;
  v_org_id uuid;
  v_result jsonb;
begin
  select s.scope_type_id, s.organization_id
  into v_scope_type_id, v_org_id
  from context.scopes s
  where s.id = p_scope_id
    and s.deleted_at is null;

  if v_scope_type_id is null then
    return '{}'::jsonb;
  end if;

  perform context._assert_scope_readable(p_scope_id, 'viewer');

  if p_include_empty then
    select jsonb_agg(jsonb_build_object(
      'item_id', ci.id,
      'key', ci.key,
      'slug', ci.slug,
      'display_name', ci.display_name,
      'description', ci.description,
      'category', ci.category,
      'value_type', ci.value_type,
      'fetch_hint', ci.fetch_hint,
      'sensitivity', ci.sensitivity,
      'sort_order', ci.sort_order,
      'custom_component', ci.custom_component,
      'allowed_reference_types', ci.allowed_reference_types,
      'max_items', ci.max_items,
      'allowed_scope_type_ids', ci.allowed_scope_type_ids,
      'reference_source', ci.reference_source,
      'has_value', civ.id is not null,
      'value_text', civ.value_text,
      'value_number', civ.value_number,
      'value_boolean', civ.value_boolean,
      'value_json', civ.value_json,
      'value_date', civ.value_date,
      'value_timestamp', civ.value_timestamp,
      'value_time', civ.value_time,
      'value_document_url', civ.value_document_url,
      'version', civ.version,
      'updated_at', civ.created_at
    ) order by ci.sort_order, ci.display_name)
    into v_result
    from context.context_items ci
    left join context.context_item_values civ
      on civ.context_item_id = ci.id
     and civ.scope_id = p_scope_id
     and civ.is_current = true
    where ci.scope_type_id = v_scope_type_id
      and ci.is_active = true
      and (p_item_ids is null or ci.id = any(p_item_ids));
  else
    select jsonb_agg(jsonb_build_object(
      'item_id', ci.id,
      'key', ci.key,
      'slug', ci.slug,
      'display_name', ci.display_name,
      'value_type', ci.value_type,
      'custom_component', ci.custom_component,
      'allowed_reference_types', ci.allowed_reference_types,
      'max_items', ci.max_items,
      'allowed_scope_type_ids', ci.allowed_scope_type_ids,
      'reference_source', ci.reference_source,
      'value_text', civ.value_text,
      'value_number', civ.value_number,
      'value_boolean', civ.value_boolean,
      'value_json', civ.value_json,
      'value_date', civ.value_date,
      'value_timestamp', civ.value_timestamp,
      'value_time', civ.value_time,
      'value_document_url', civ.value_document_url
    ) order by ci.sort_order, ci.display_name)
    into v_result
    from context.context_item_values civ
    join context.context_items ci on civ.context_item_id = ci.id
    where civ.scope_id = p_scope_id
      and civ.is_current = true
      and ci.is_active = true
      and (p_item_ids is null or ci.id = any(p_item_ids));
  end if;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE FUNCTION context.get_user_full_context_from_the_image(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
    v_uid uuid;
    v_result jsonb; v_real_rows jsonb;
    -- rca5d_e: the kernel's SET form, asked once per token, when the caller answers for herself
    -- (the normal case). A per-row kernel call on every task/project/scope of every organization
    -- took 75 s for a 142-organization account (rca5d_c). Another person's context (service role,
    -- admin lane) keeps the per-row kernel call for that person.
    v_self boolean;
    v_project_ids uuid[]; v_task_ids uuid[]; v_scope_ids uuid[];
begin
    v_uid := coalesce(p_user_id, auth.uid());
    if v_uid is null then return jsonb_build_object('organizations', '[]'::jsonb); end if;
    -- 🚨 DD-192: the same defect as get_user_nav_tree, one layer deeper — this one
    -- also hands back the target's scope types, scopes and context items.
    if not (auth.role() = 'service_role' or v_uid = ( SELECT auth.uid()) or public.is_platform_admin()) then
      raise exception 'access denied: caller is not the target user' using errcode = '42501';
    end if;
    v_self := v_uid is not distinct from (select auth.uid());
    if v_self then
      v_project_ids := iam.accessible_entity_ids('project', 'viewer'::public.permission_level);
      v_task_ids    := iam.accessible_entity_ids('task', 'viewer'::public.permission_level);
      v_scope_ids   := iam.accessible_entity_ids('scope', 'viewer'::public.permission_level);
    end if;
    with
    user_orgs as (
        select o.id, o.name, o.slug, om.role::text as role
        from iam.organizations o join iam.organization_member om on om.organization_id = o.id and om.user_id = v_uid
    ),
    org_scope_types as (
        select st.organization_id,
            jsonb_agg(jsonb_build_object('id',st.id,'label_singular',st.label_singular,'label_plural',st.label_plural,'icon',st.icon,'color',st.color,'sort_order',st.sort_order,'parent_type_id',st.parent_type_id,'max_assignments_per_entity',st.max_assignments_per_entity) order by st.sort_order) as types
        from context.scope_types st where st.organization_id in (select id from user_orgs) and st.deleted_at is null group by st.organization_id
    ),
    org_scopes as (
        select s.organization_id,
            jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'scope_type_id',s.scope_type_id,'parent_scope_id',s.parent_scope_id,'type_label',st.label_singular,'type_icon',st.icon,'type_color',st.color) order by st.sort_order, s.name) as scopes
        from context.scopes s join context.scope_types st on s.scope_type_id = st.id where s.organization_id in (select id from user_orgs) and s.deleted_at is null and st.deleted_at is null
          and (case when v_self then s.id = any(v_scope_ids) else iam.has_access_for(v_uid, 'scope', s.id, 'viewer'::public.permission_level) end) group by s.organization_id
    ),
    org_projects as (
        select p.id, p.name, p.slug, p.organization_id,
            coalesce((select jsonb_agg(jsonb_build_object('scope_id',sc.id,'scope_name',sc.name,'type_label',st.label_singular,'type_icon',st.icon,'type_color',st.color) order by st.sort_order)
                from platform.associations_live sa
                join context.scopes sc on sa.target_id = sc.id
                join context.scope_types st on sc.scope_type_id = st.id
                where sa.target_type = 'scope' and sa.source_type = 'project' and sa.source_id = p.id and sc.deleted_at is null and st.deleted_at is null
                  and (case when v_self then sc.id = any(v_scope_ids) else iam.has_access_for(v_uid, 'scope', sc.id, 'viewer'::public.permission_level) end)), '[]'::jsonb) as scope_tags,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null and t.status not in ('completed','cancelled','dismissed')) as open_task_count,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null) as total_task_count
        from workspace.projects p where p.organization_id in (select id from user_orgs)
          -- RC-A5d (rca5d_c): only projects (and, below, tasks and scopes) this person may open;
          -- a member read the names and task titles of projects they could not open here.
          and (case when v_self then p.id = any(v_project_ids) else iam.has_access_for(v_uid, 'project', p.id, 'viewer'::public.permission_level) end)
    ),
    all_tasks as (
        select t.id, t.title, t.status, t.priority::text as priority, t.project_id, t.parent_task_id, t.due_date, t.assignee_id,
            t.created_by, t.origin, t.source_type, t.source_url, t.source_label, t.start_date, t.completed_at, t.updated_at, t.recurrence_rule,
            case
                when p.id is not null and p.organization_id is not null then p.organization_id
                else t.organization_id
            end as organization_id
        from workspace.tasks t left join workspace.projects p on t.project_id = p.id
        where t.deleted_at is null
          and (t.status not in ('completed','cancelled','dismissed')
               or coalesce(t.completed_at, t.updated_at) > now() - interval '90 days')
          and (t.created_by=v_uid or t.assignee_id=v_uid
               or ((t.project_id in (select id from org_projects))
                   and (case when v_self then t.id = any(v_task_ids) else iam.has_access_for(v_uid, 'task', t.id, 'viewer'::public.permission_level) end)))
    )
    select coalesce(jsonb_agg(real_org_obj order by uo_name asc), '[]'::jsonb) into v_real_rows
    from (
        select uo.name as uo_name,
            jsonb_build_object('id',uo.id,'name',uo.name,'slug',uo.slug,'role',uo.role,
                'scope_types',coalesce(ost.types,'[]'::jsonb),'scopes',coalesce(os.scopes,'[]'::jsonb),
                'projects',coalesce((select jsonb_agg(jsonb_build_object('id',op.id,'name',op.name,'slug',op.slug,'scope_tags',op.scope_tags,'open_task_count',op.open_task_count,'total_task_count',op.total_task_count) order by op.name) from org_projects op where op.organization_id=uo.id),'[]'::jsonb),
                'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',at.id,'title',at.title,'status',at.status,'priority',at.priority,'project_id',at.project_id,'parent_task_id',at.parent_task_id,'due_date',at.due_date,'assignee_id',at.assignee_id,'created_by',at.created_by,'origin',at.origin,'source_type',at.source_type,'source_url',at.source_url,'source_label',at.source_label,'start_date',at.start_date,'completed_at',at.completed_at,'updated_at',at.updated_at,'recurrence_rule',at.recurrence_rule) order by case at.priority when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end, at.due_date nulls last) from all_tasks at where at.organization_id=uo.id),'[]'::jsonb)
            ) as real_org_obj
        from user_orgs uo left join org_scope_types ost on ost.organization_id=uo.id left join org_scopes os on os.organization_id=uo.id
    ) sub;
    select jsonb_build_object('organizations', v_real_rows) into v_result;
    return v_result;
end;
$function$;

CREATE FUNCTION context.resolve_full_context_from_the_image(p_user_id uuid, p_entity_type text, p_entity_id uuid, p_scope_ids uuid[] DEFAULT NULL::uuid[], p_system_item_refs text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- A CONCRETE CELL IS IDENTIFIED BY (context_item_id, scope_id) — NEVER BY context_item_id ALONE.
-- Two active scopes of the SAME scope type (two Clients on one conversation, two Repositories
-- on one task) each carry their own value for the SAME context item. Keying `cell_values` by
-- context_item_id alone made the second row silently overwrite the first, and the ORDER BY did
-- not tie-break between scopes, so WHICH value survived was arbitrary. `cell_values` is now
-- LOSSLESS: {context_item_id: [cell, ...]} — one entry per contributing scope, in a
-- deterministic order. `variables` stays keyed by bare `key` (it is the name-addressed
-- awareness map) but every entry now carries the full `cells` array, so a name collision
-- across scope types or scopes can be RENDERED rather than silently dropped.
declare
    v_org_id uuid; v_project_id uuid; v_task_id uuid;
    v_scope_labels jsonb := '{}'; v_variables jsonb := '{}'; v_sources jsonb := '{}';
    v_cells jsonb := '{}';
    v_cell jsonb;
    rec record;
    v_entity_scopes jsonb;
    v_explicit_scopes jsonb;
begin
    if p_entity_type = 'task' then
        select t.project_id, p.organization_id, t.id into v_project_id, v_org_id, v_task_id
        from workspace.tasks t left join workspace.projects p on t.project_id = p.id where t.id = p_entity_id;
    elsif p_entity_type = 'project' then
        select p.organization_id, p.id into v_org_id, v_project_id
        from workspace.projects p where p.id = p_entity_id;
    elsif p_entity_type = 'conversation' then
        select
            c.organization_id,
            (
                select a.target_id
                from platform.associations_live a
                where a.source_type = 'conversation'
                  and a.source_id = c.id
                  and a.target_type = 'project'
                  and a.organization_id = c.organization_id
                order by a.position nulls last, a.created_at, a.id
                limit 1
            ),
            c.task_id
        into v_org_id, v_project_id, v_task_id
        from chat.conversation c where c.id = p_entity_id;
    elsif p_entity_type = 'note' then
        select
            n.organization_id,
            (
                select a.target_id
                from platform.associations_live a
                where a.source_type = 'note'
                  and a.source_id = n.id
                  and a.target_type = 'project'
                order by a.position nulls last, a.created_at, a.id
                limit 1
            ),
            (
                select a.target_id
                from platform.associations_live a
                where a.source_type = 'note'
                  and a.source_id = n.id
                  and a.target_type = 'task'
                order by a.position nulls last, a.created_at, a.id
                limit 1
            )
        into v_org_id, v_project_id, v_task_id
        from workbench.notes n where n.id = p_entity_id;
    end if;

    select jsonb_agg(jsonb_build_object(
        'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
        'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
    )) into v_entity_scopes
    from platform.associations_live sa join context.scopes s on sa.target_id = s.id
    join context.scope_types st on s.scope_type_id = st.id
    where sa.target_type = 'scope' and sa.source_type = p_entity_type and sa.source_id = p_entity_id
      and s.deleted_at is null and st.deleted_at is null;

    if v_entity_scopes is null and v_project_id is not null and p_entity_type != 'project' then
        select jsonb_agg(jsonb_build_object(
            'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
            'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
        )) into v_entity_scopes
        from platform.associations_live sa join context.scopes s on sa.target_id = s.id
        join context.scope_types st on s.scope_type_id = st.id
        where sa.target_type = 'scope' and sa.source_type = 'project' and sa.source_id = v_project_id
          and s.deleted_at is null and st.deleted_at is null;
    end if;

    if p_scope_ids is not null and array_length(p_scope_ids, 1) > 0 then
        select jsonb_agg(jsonb_build_object(
            'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
            'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
        )) into v_explicit_scopes
        from context.scopes s
        join context.scope_types st on s.scope_type_id = st.id
        join lateral (select 1 as ok) om on context._scope_readable_for(p_user_id, s.id, 'viewer')
        where s.id = any(p_scope_ids) and s.deleted_at is null and st.deleted_at is null
          and (v_entity_scopes is null or not (v_entity_scopes @> jsonb_build_array(jsonb_build_object('scope_id', s.id))));
        if v_explicit_scopes is not null then
            v_entity_scopes := coalesce(v_entity_scopes, '[]'::jsonb) || v_explicit_scopes;
        end if;
    end if;

    -- Scope LABELS are name-addressed by type_label and therefore collapse when two scopes
    -- share a type. Aggregate every name for a type into an array instead of letting the
    -- last one win — build_system_prompt_block already renders a list value.
    if v_entity_scopes is not null then
        select coalesce(jsonb_object_agg(t.type_label, t.names), '{}'::jsonb)
        into v_scope_labels
        from (
            select elem->>'type_label' as type_label,
                   case when count(*) > 1
                        then jsonb_agg(elem->>'scope_name' order by elem->>'scope_name')
                        else to_jsonb(min(elem->>'scope_name')) end as names
            from jsonb_array_elements(v_entity_scopes) elem
            group by elem->>'type_label'
        ) t;
    end if;

    -- SYSTEM lane: platform-wide truths from context.system_context_item (its own
    -- storage since 2026-08-27 — no longer is_system scope types). Three classes:
    -- ambient (computed per request by the server), curated (admin-maintained values),
    -- dataset (pointers the agent queries via RAG). Cells carry scope_id/scope_type_id
    -- NULL and scope_name 'System' — System context has no scope dimension.
    -- A SYSTEM ITEM IS READ ONLY WHEN IT IS NAMED (lane CONTEXT-VALUES-NAMED-2): the lane reads
    -- only the rows p_system_item_refs names (ids or keys, from the server's SystemContextNames);
    -- NULL or empty reads none. An unnamed row is never fetched.
    for rec in (
        select sci.id as context_item_id, sci.key, sci.description,
               sci.value_type::text as value_type, sci.value as value
        from context.named_system_context_items(context.system_item_refs_or_defaults(p_system_item_refs)) sci
        where sci.is_active = true and sci.deleted_at is null and sci.feed_type != 'dataset'
        order by sci.sort_order asc, sci.key asc
    ) loop
        continue when rec.value is null;
        v_cell := jsonb_build_object(
            'key', rec.key, 'value', rec.value, 'type', rec.value_type, 'description', rec.description,
            'context_item_id', rec.context_item_id,
            'scope_id', null, 'scope_name', 'System', 'scope_type_id', null,
            'source', 'system');
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
        from context.named_system_context_items(context.system_item_refs_or_defaults(p_system_item_refs)) sci
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
            'scope_id', null, 'scope_name', 'System', 'scope_type_id', null,
            'source', 'system');
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

    if v_entity_scopes is not null then
        for rec in (
            select ci.id as context_item_id, ci.key, ci.description, ci.value_type::text as value_type,
                   s.id as scope_id, s.name as scope_name, s.scope_type_id as scope_type_id,
                   case
                       when civ.value_text is not null then to_jsonb(civ.value_text)
                       when civ.value_number is not null then to_jsonb(civ.value_number)
                       when civ.value_boolean is not null then to_jsonb(civ.value_boolean)
                       when civ.value_date is not null then to_jsonb(civ.value_date::text)
                       when civ.value_timestamp is not null then to_jsonb(civ.value_timestamp::text)
                       when civ.value_time is not null then to_jsonb(civ.value_time::text)
                       when civ.value_json is not null then civ.value_json
                       when civ.value_document_url is not null then to_jsonb(civ.value_document_url)
                       when civ.value_reference_id is not null then to_jsonb(civ.value_reference_id::text)
                       else null
                   end as value
            from context.context_item_values civ
            join context.context_items ci on ci.id = civ.context_item_id and ci.is_active = true
            join context.scopes s on s.id = civ.scope_id
            join context.scope_types st on st.id = s.scope_type_id
            where civ.is_current = true and ci.fetch_hint != 'never' and s.deleted_at is null and st.deleted_at is null
              and civ.scope_id in (select (elem->>'scope_id')::uuid from jsonb_array_elements(v_entity_scopes) elem)
            order by st.sort_order asc, ci.sort_order asc, s.name asc, s.id asc
        ) loop
            continue when rec.value is null;
            v_cell := jsonb_build_object(
                'key', rec.key, 'value', rec.value, 'type', rec.value_type, 'description', rec.description,
                'context_item_id', rec.context_item_id,
                'scope_id', rec.scope_id, 'scope_name', rec.scope_name, 'scope_type_id', rec.scope_type_id,
                'source', 'scope:' || rec.scope_name);
            v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
                'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
                'source', 'scope:' || rec.scope_name, 'description', rec.description,
                'cells', coalesce(v_variables -> rec.key -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell)));
            v_sources := v_sources || jsonb_build_object(rec.key, 'scope:' || rec.scope_name);
            v_cells := v_cells || jsonb_build_object(rec.context_item_id::text,
                coalesce(v_cells -> rec.context_item_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
        end loop;
    end if;

    return jsonb_build_object('scope_labels', v_scope_labels, 'variables', v_variables, 'sources', v_sources,
        'cell_values', v_cells,
        'context', jsonb_build_object('user_id', p_user_id, 'organization_id', v_org_id, 'project_id', v_project_id, 'task_id', v_task_id,
            'scope_ids', coalesce((select jsonb_agg(elem->'scope_id') from jsonb_array_elements(v_entity_scopes) elem), '[]'::jsonb)),
        'resolved_at', extract(epoch from now()));
end;
$function$;

-- ═══════════════════════════════════════════════════════════════ the doors, contract kept

CREATE OR REPLACE FUNCTION public.get_scope_tree(p_org_id uuid, p_type_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_member boolean;
  v_levels jsonb;
begin
  -- THE SWITCH (custom/scope_readers_read_the_store, OFF): until the owner flips it the old tables answer.
  if not coalesce((platform.knob_resolve('custom', 'scope_readers_read_the_store', null) #>> '{}')::boolean, false) then
    return context.get_scope_tree_from_the_image(p_org_id, p_type_id);
  end if;
  -- SCOPES-READS-TREE: read from the record store. WHO SEES WHAT is the store's own two
  -- questions, asked exactly as custom.read_record and custom.resolve_context ask them: the
  -- organization's wall (custom.assert_client_may_reach — a member, or somebody the organization
  -- admits from outside: a portal principal, a class member), then the one ladder
  -- (custom.levels_of) for every scope before any is named. DD-112 / CUT-30: plain membership no
  -- longer gates the list ahead of the ladder — whoever the store admits from outside is listed
  -- what was shared with her; an archived organization and a stranger are refused as before.
  v_member := auth.role() = 'service_role';
  if not v_member then
    begin
      perform custom.assert_client_may_reach(p_org_id, 'public.get_scope_tree');
    exception when insufficient_privilege or null_value_not_allowed then
      raise exception 'not authorized for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', p_org_id)::text;
    end;
    v_member := (iam.has_org_access(p_org_id)) is true;
  end if;
  if auth.role() is distinct from 'service_role' then
    v_levels := custom.levels_of(auth.uid(), coalesce((
      select array_agg(r.id)
        from custom.record t
        join custom.record r on r.organization_id = t.organization_id and r.table_id = t.id and r.deleted_at is null
       where t.organization_id = p_org_id and t.table_id = custom.table_kernel_id() and t.deleted_at is null
         and t.data ->> 'kept_for' = 'context' and (p_type_id is null or t.id = p_type_id)), '{}'::uuid[]));
  end if;
  select jsonb_agg(
    s.row_doc || jsonb_build_object(
      'type_label', s.type_doc -> 'label_singular',
      'type_label_plural', s.type_doc -> 'label_plural',
      'type_icon', coalesce(s.type_doc -> 'icon', 'null'::jsonb),
      'type_color', coalesce(s.type_doc -> 'color', 'null'::jsonb)
    ) order by s.type_sort, s.sort_order, s.name, s.id
  ) into v_result
  from custom.scope_rows_of(p_org_id, case when p_type_id is null then null else array[p_type_id] end) s
  where v_levels is null or coalesce((v_levels -> (s.id::text) ->> 's')::boolean, false);
  if not v_member and v_result is null then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_scope_types(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  -- THE SWITCH (custom/scope_readers_read_the_store, OFF): until the owner flips it the old tables answer.
  if not coalesce((platform.knob_resolve('custom', 'scope_readers_read_the_store', null) #>> '{}')::boolean, false) then
    return context.list_scope_types_from_the_image(p_org_id);
  end if;
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;
  -- SCOPES-READS-TREE: every live scope Table of the organization (kept_for = context), as the old
  -- scope type row; scope_count counts its live Records, as it counted live scopes.
  select jsonb_agg(
    custom.scope_type_row_of(t) || jsonb_build_object(
      'parent_type_label', null,
      'scope_count', (select count(*) from custom.record r
                       where r.organization_id = t.organization_id and r.table_id = t.id and r.deleted_at is null)
    ) order by coalesce(nullif(t.data ->> 'sort_order', '')::int, 0), t.data ->> 'label_singular', t.id
  ) into v_result
  from custom.record t
  where t.organization_id = p_org_id
    and t.table_id = custom.table_kernel_id()
    and t.deleted_at is null
    and t.data ->> 'kept_for' = 'context';
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_scope_type_items(p_scope_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_org_id uuid;
begin
  -- THE SWITCH (custom/scope_readers_read_the_store, OFF): until the owner flips it the old tables answer.
  if not coalesce((platform.knob_resolve('custom', 'scope_readers_read_the_store', null) #>> '{}')::boolean, false) then
    return context.list_scope_type_items_from_the_image(p_scope_type_id);
  end if;
  -- SCOPES-READS-TREE: the scope type is its Table; its context items are the Table's Fields.
  select t.organization_id
  into v_org_id
  from custom.record t
  where t.id = p_scope_type_id
    and t.table_id = custom.table_kernel_id()
    and t.deleted_at is null
    and t.data ->> 'kept_for' = 'context';

  if v_org_id is null then
    perform platform.refuse_not_found(format('active scope type %s not found', p_scope_type_id));
  end if;

  if (auth.role() = 'service_role' or iam.has_org_access(v_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', v_org_id)::text;
  end if;

  select jsonb_agg(custom.scope_item_row_of(f)
    order by coalesce(nullif(f.data ->> 'sort', '')::int, 0), f.data ->> 'label', f.id)
  into v_result
  from custom.scope_items_of(v_org_id, p_scope_type_id) f;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_scope_context(p_scope_id uuid, p_item_ids uuid[] DEFAULT NULL::uuid[], p_include_empty boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope  custom.record;
  v_result jsonb;
  v_levels jsonb;
begin
  -- THE SWITCH (custom/scope_readers_read_the_store, OFF): until the owner flips it the old tables answer.
  if not coalesce((platform.knob_resolve('custom', 'scope_readers_read_the_store', null) #>> '{}')::boolean, false) then
    return context.get_scope_context_from_the_image(p_scope_id, p_item_ids, p_include_empty);
  end if;
  -- SCOPES-READS-TREE: the scope is a Record of a live scope Table; its values are the Record's.
  select r.* into v_scope
    from custom.record r
    join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
   where r.id = p_scope_id
     and r.deleted_at is null
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null
     and t.data ->> 'kept_for' = 'context';

  if v_scope.id is null then
    return '{}'::jsonb;
  end if;

  -- THE MEMBRANE: the store's own two questions, as custom.read_record asks them — the
  -- organization's wall, then the one ladder.
  if auth.role() is distinct from 'service_role' then
    begin
      perform custom.assert_client_may_reach(v_scope.organization_id, 'public.get_scope_context');
      v_levels := custom.levels_of(auth.uid(), array[p_scope_id]);
    exception when insufficient_privilege or null_value_not_allowed then
      v_levels := '{}'::jsonb;
    end;
    if not coalesce((v_levels -> (p_scope_id::text) ->> 's')::boolean, false) then
      raise exception '%', format('You do not have access to "%s". Ask someone who can already open it to share it with you.',
                                  v_scope.data ->> 'name')
        using errcode = '42501';
    end if;
  end if;

  select jsonb_agg(x.cell order by x.srt, x.label, x.fid)
    into v_result
    from (
      select f.id as fid, coalesce(nullif(f.data ->> 'sort', '')::int, 0) as srt, f.data ->> 'label' as label,
             case when p_include_empty then
               (i - 'id' - 'status' - 'tags')
               || jsonb_build_object('item_id', f.id,
                    'has_value', v_scope.data ? (f.data ->> 'key') and jsonb_typeof(v_scope.data -> (f.data ->> 'key')) <> 'null')
               || custom.scope_value_columns(v_scope.organization_id, f.data, i ->> 'value_type', v_scope.data -> (f.data ->> 'key'))
               || jsonb_build_object(
                    'version', case when v_scope.data ? (f.data ->> 'key') and jsonb_typeof(v_scope.data -> (f.data ->> 'key')) <> 'null'
                                    then to_jsonb(coalesce(nullif(v_scope.data -> '_values' -> (f.data ->> 'key') ->> 'ver', '')::int, 1)) end,
                    'updated_at', case when v_scope.data ? (f.data ->> 'key') and jsonb_typeof(v_scope.data -> (f.data ->> 'key')) <> 'null'
                                       then v_scope.data -> '_values' -> (f.data ->> 'key') -> 'at' end)
             else
               jsonb_build_object('item_id', f.id, 'key', i -> 'key', 'slug', i -> 'slug', 'display_name', i -> 'display_name',
                                  'value_type', i -> 'value_type', 'custom_component', i -> 'custom_component',
                                  'allowed_reference_types', i -> 'allowed_reference_types', 'max_items', i -> 'max_items',
                                  'allowed_scope_type_ids', i -> 'allowed_scope_type_ids', 'reference_source', i -> 'reference_source')
               || custom.scope_value_columns(v_scope.organization_id, f.data, i ->> 'value_type', v_scope.data -> (f.data ->> 'key'))
             end as cell
        from custom.scope_items_of(v_scope.organization_id, v_scope.table_id) f
        cross join lateral (select custom.scope_item_row_of(f) as i) j
       where (p_item_ids is null or f.id = any (p_item_ids))
         and (p_include_empty
              or (v_scope.data ? (f.data ->> 'key') and jsonb_typeof(v_scope.data -> (f.data ->> 'key')) <> 'null'))
    ) x;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_full_context(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_uid uuid;
    v_result jsonb; v_real_rows jsonb;
    -- rca5d_e: the kernel's SET form, asked once per token, when the caller answers for herself
    -- (the normal case). A per-row kernel call on every task/project of every organization
    -- took 75 s for a 142-organization account (rca5d_c). Another person's context (service role,
    -- admin lane) keeps the per-row kernel call for that person.
    v_self boolean;
    v_project_ids uuid[]; v_task_ids uuid[];
    -- SCOPES-READS-TREE: scopes, scope types and a project's scope tags are read from the record
    -- store; which scopes the person sees is the store's one ladder, asked once for the set.
    v_scopes jsonb;
    v_levels jsonb;
begin
  -- THE SWITCH (custom/scope_readers_read_the_store, OFF): until the owner flips it the old tables answer.
  if not coalesce((platform.knob_resolve('custom', 'scope_readers_read_the_store', null) #>> '{}')::boolean, false) then
    return context.get_user_full_context_from_the_image(p_user_id);
  end if;
    v_uid := coalesce(p_user_id, auth.uid());
    if v_uid is null then return jsonb_build_object('organizations', '[]'::jsonb); end if;
    -- 🚨 DD-192: the same defect as get_user_nav_tree, one layer deeper — this one
    -- also hands back the target's scope types, scopes and context items.
    if not (auth.role() = 'service_role' or v_uid = ( SELECT auth.uid()) or public.is_platform_admin()) then
      raise exception 'access denied: caller is not the target user' using errcode = '42501';
    end if;
    v_self := v_uid is not distinct from (select auth.uid());
    if v_self then
      v_project_ids := iam.accessible_entity_ids('project', 'viewer'::public.permission_level);
      v_task_ids    := iam.accessible_entity_ids('task', 'viewer'::public.permission_level);
    end if;

    -- Only what this answer names (id, name, Table, parent), read straight from the Records of the
    -- person's organizations' live scope Tables, and only in organizations whose wall she passes.
    select coalesce(jsonb_agg(jsonb_build_object('o', r.organization_id, 'id', r.id, 't', r.table_id,
                                                  'ts', coalesce(nullif(t.data ->> 'sort_order', '')::int, 0),
                                                  'n', r.data ->> 'name', 'td', t.data - 'fields',
                                                  'p', coalesce(to_jsonb(nullif(r.data ->> 'parent_id', '')), 'null'::jsonb))), '[]'::jsonb)
      into v_scopes
      from iam.organization_member om
      join custom.record t on t.organization_id = om.organization_id
                          and t.table_id = custom.table_kernel_id()
                          and t.deleted_at is null
                          and t.data ->> 'kept_for' = 'context'
      join custom.record r on r.organization_id = t.organization_id and r.table_id = t.id and r.deleted_at is null
     where om.user_id = v_uid
       and iam.has_org_access_for(v_uid, om.organization_id);
    v_levels := custom.levels_of(v_uid, (select array_agg((e ->> 'id')::uuid) from jsonb_array_elements(v_scopes) e));

    with
    user_orgs as (
        select o.id, o.name, o.slug, om.role::text as role
        from iam.organizations o join iam.organization_member om on om.organization_id = o.id and om.user_id = v_uid
    ),
    seen as (
        select (e ->> 'o')::uuid as organization_id, (e ->> 'id')::uuid as id, (e ->> 't')::uuid as table_id,
               (e ->> 'ts')::int as type_sort, e ->> 'n' as name, e -> 'td' as td, e -> 'p' as parent_scope_id
          from jsonb_array_elements(v_scopes) e
         where coalesce((v_levels -> (e ->> 'id') ->> 's')::boolean, false)
    ),
    org_scope_types as (
        select t.organization_id,
            jsonb_agg(jsonb_build_object('id',t.id,'label_singular',t.data -> 'label_singular','label_plural',t.data -> 'label_plural',
                                         'icon',coalesce(t.data -> 'icon','null'::jsonb),'color',coalesce(t.data -> 'color','null'::jsonb),
                                         'sort_order',coalesce(nullif(t.data ->> 'sort_order','')::int,0),'parent_type_id',null,
                                         'max_assignments_per_entity',coalesce(t.data -> 'max_assignments_per_entity','null'::jsonb))
                      order by coalesce(nullif(t.data ->> 'sort_order','')::int,0), t.data ->> 'label_singular', t.id) as types
        from custom.record t
        where t.organization_id in (select id from user_orgs) and t.table_id = custom.table_kernel_id()
          and t.deleted_at is null and t.data ->> 'kept_for' = 'context'
        group by t.organization_id
    ),
    org_scopes as (
        select s.organization_id,
            jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'scope_type_id',s.table_id,'parent_scope_id',s.parent_scope_id,
                                         'type_label',s.td -> 'label_singular','type_icon',coalesce(s.td -> 'icon','null'::jsonb),
                                         'type_color',coalesce(s.td -> 'color','null'::jsonb))
                      order by s.type_sort, s.name, s.id) as scopes
        from seen s group by s.organization_id
    ),
    org_projects as (
        select p.id, p.name, p.slug, p.organization_id,
            coalesce((select jsonb_agg(jsonb_build_object('scope_id',sc.id,'scope_name',sc.name,'type_label',sc.td -> 'label_singular',
                                                          'type_icon',coalesce(sc.td -> 'icon','null'::jsonb),'type_color',coalesce(sc.td -> 'color','null'::jsonb))
                                       order by sc.type_sort, sc.id)
                from (select distinct sa.target_id from platform.associations_live sa
                       where sa.target_type in ('scope', 'record', 'custom_record') and sa.source_type = 'project' and sa.source_id = p.id) tag
                join seen sc on sc.id = tag.target_id), '[]'::jsonb) as scope_tags,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null and t.status not in ('completed','cancelled','dismissed')) as open_task_count,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null) as total_task_count
        from workspace.projects p where p.organization_id in (select id from user_orgs)
          -- RC-A5d (rca5d_c): only projects (and, below, tasks and scopes) this person may open;
          -- a member read the names and task titles of projects they could not open here.
          and (case when v_self then p.id = any(v_project_ids) else iam.has_access_for(v_uid, 'project', p.id, 'viewer'::public.permission_level) end)
    ),
    all_tasks as (
        select t.id, t.title, t.status, t.priority::text as priority, t.project_id, t.parent_task_id, t.due_date, t.assignee_id,
            t.created_by, t.origin, t.source_type, t.source_url, t.source_label, t.start_date, t.completed_at, t.updated_at, t.recurrence_rule,
            case
                when p.id is not null and p.organization_id is not null then p.organization_id
                else t.organization_id
            end as organization_id
        from workspace.tasks t left join workspace.projects p on t.project_id = p.id
        where t.deleted_at is null
          and (t.status not in ('completed','cancelled','dismissed')
               or coalesce(t.completed_at, t.updated_at) > now() - interval '90 days')
          and (t.created_by=v_uid or t.assignee_id=v_uid
               or ((t.project_id in (select id from org_projects))
                   and (case when v_self then t.id = any(v_task_ids) else iam.has_access_for(v_uid, 'task', t.id, 'viewer'::public.permission_level) end)))
    )
    select coalesce(jsonb_agg(real_org_obj order by uo_name asc), '[]'::jsonb) into v_real_rows
    from (
        select uo.name as uo_name,
            jsonb_build_object('id',uo.id,'name',uo.name,'slug',uo.slug,'role',uo.role,
                'scope_types',coalesce(ost.types,'[]'::jsonb),'scopes',coalesce(os.scopes,'[]'::jsonb),
                'projects',coalesce((select jsonb_agg(jsonb_build_object('id',op.id,'name',op.name,'slug',op.slug,'scope_tags',op.scope_tags,'open_task_count',op.open_task_count,'total_task_count',op.total_task_count) order by op.name) from org_projects op where op.organization_id=uo.id),'[]'::jsonb),
                'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',at.id,'title',at.title,'status',at.status,'priority',at.priority,'project_id',at.project_id,'parent_task_id',at.parent_task_id,'due_date',at.due_date,'assignee_id',at.assignee_id,'created_by',at.created_by,'origin',at.origin,'source_type',at.source_type,'source_url',at.source_url,'source_label',at.source_label,'start_date',at.start_date,'completed_at',at.completed_at,'updated_at',at.updated_at,'recurrence_rule',at.recurrence_rule) order by case at.priority when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end, at.due_date nulls last) from all_tasks at where at.organization_id=uo.id),'[]'::jsonb)
            ) as real_org_obj
        from user_orgs uo left join org_scope_types ost on ost.organization_id=uo.id left join org_scopes os on os.organization_id=uo.id
    ) sub;
    select jsonb_build_object('organizations', v_real_rows) into v_result;
    return v_result;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════ the agent hand-off

CREATE OR REPLACE FUNCTION public.resolve_full_context(p_user_id uuid, p_entity_type text, p_entity_id uuid, p_scope_ids uuid[] DEFAULT NULL::uuid[], p_system_item_refs text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- SCOPES-READS-TREE (plan step 2.1): the agent hand-off is the record store's. This is a wrapper
-- over custom.resolve_context, asked as the person it names exactly as aidream's context path asks
-- it (claims {sub, role: authenticated}, the selection as records, no active Table), so every
-- server caller — the old path of build_agent_context, the preview, the inspector — reads what the
-- agents read. Every contributing scope is checked for that person (SC-3'); what is refused is
-- named in `checks`. The old body is kept in this file's inverse (for the golden hand-off, step 4.2).
declare
  v_was text := current_setting('request.jwt.claims', true);
  v_out jsonb;
begin
  -- THE SWITCH (custom/scope_readers_read_the_store, OFF): until the owner flips it the old tables answer.
  if not coalesce((platform.knob_resolve('custom', 'scope_readers_read_the_store', null) #>> '{}')::boolean, false) then
    return context.resolve_full_context_from_the_image(p_user_id, p_entity_type, p_entity_id, p_scope_ids, p_system_item_refs);
  end if;
  if p_user_id is null then
    raise exception 'public.resolve_full_context resolves context for a person, and none was named.'
      using errcode = '42501',
            hint = 'Pass the id of the person operating the agent.';
  end if;
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  begin
    v_out := custom.resolve_context(p_entity_type, p_entity_id, p_scope_ids, '{}'::uuid[], p_system_item_refs);
  exception when others then
    perform set_config('request.jwt.claims', coalesce(v_was, ''), true);
    raise;
  end;
  perform set_config('request.jwt.claims', coalesce(v_was, ''), true);
  return v_out;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════ the membrane's guard follows the membrane

-- The scope membrane moved to the store's ladder for the doors above. The guard keeps catching a
-- membrane lifted out of a door: a `membraned` door calls context._* OR custom.levels_of (after
-- comments and strings are stripped), and the three list doors filter on
-- context._readable_scope_ids() OR the ladder. Every other check is unchanged.
CREATE OR REPLACE FUNCTION public.__scope_access_membrane_conformance()
 RETURNS TABLE(check_key text, ok boolean, severity text, detail jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c_refs constant text := 'context\.(scopes|context_items|context_item_values)';
  c_values constant text := 'context\.context_item_values';
  c_call constant text := '(context\._(assert_scope_readable|scope_readable|scope_readable_for|readable_scope_ids)|custom\.levels_of|custom\.resolve_context)\s*\(';
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
       and context._strip_sql_noise(p.prosrc) ~ '(context\._readable_scope_ids|custom\.levels_of)\s*\(');
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

  select jsonb_object_agg(policyname, cmd), max(qual) filter (where cmd = 'SELECT')
    into v_pols, v_sel
  from pg_policies where schemaname = 'context' and tablename = 'context_item_values';
  check_key := 'values_policies_are_generated_component_lane';
  ok := coalesce(v_sel,'') like '%accessible_entity_ids(''scope''::text%'
        and coalesce(v_sel,'') not like '%context.scopes%'
        and v_pols ? 'std_select' and v_pols ? 'std_insert' and v_pols ? 'std_update'
        and v_pols ? 'std_delete' and v_pols ? 'svc_all';
  severity := 'error';
  detail := jsonb_build_object(
    'policies', coalesce(v_pols,'{}'::jsonb),
    'why','The read lane must resolve the PARENT id set once per query (THE COMPONENT-ACCESS PRECEDENT, 2026-08-08) and must not fall back to organization membership. Re-apply with select iam.apply_rls(''context'',''context_item_values'',''context_item_value'',''component'').');
  return next;

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

-- The guard is a SECURITY DEFINER function with no declared access decision; the provision shape
-- guard asks for one when its body is replaced. It takes no argument and only the server calls it.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
select 'public', '__scope_access_membrane_conformance', '', '{}'::oid[],
       'It takes no argument: it reads only the catalogue and context.scope_door_registry, and answers pass or fail per check.',
       'scopesreadstree_the_scope_tree_and_values_read_the_store.sql',
       'server_only: pnpm check:scope-access-membrane calls it with the service role to prove the scope membrane is in every door; no client ever calls it.',
       false, false
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'public' and d.function_name = '__scope_access_membrane_conformance');



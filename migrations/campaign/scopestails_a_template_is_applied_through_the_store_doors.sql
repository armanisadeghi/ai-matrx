-- chair-step: lane SCOPES-TAILS (leftover 1 of the scopes transition, writers census S10). A template is a set of scope-type and field definitions applied through the same store doors every other scope write uses: new door custom.context_template_define(p_organization_id, p_definition) makes each type through custom.context_type_write (parents first) and each field through custom.context_item_write (a reference field points at a scope of its own type, or of the type its reference_type_key names); custom.context_template_apply builds that definition from the platform's template catalogue and hands it to the new door instead of calling public.apply_template; public.apply_template_definition (no caller, no client grant, and it inserted into context.* directly with no organization check and the reference-field defect) becomes a SECURITY INVOKER wrapper over the new door, so it writes nothing itself and the census names no old writer for templates. Door row declared before its grant; the template door's own row now says what it calls.
-- based-on: custom.context_template_apply(uuid, uuid) f1b3036e959676570bc52ec0b65b9b36d942d34da7014efdb5ebfed51ea1775a
-- based-on: public.apply_template_definition(uuid, jsonb) 0d046a62c3b43264acc23ab18045fc25cf749cb0b77ba6bda8e1411d75a96b4e
-- lane: SCOPES-TAILS
-- INVERSE: migrations/inverse/scopestails_a_template_is_applied_through_the_store_doors_down.sql
-- window-class: function bodies and one new function. Applied directly (owner, 2026-09-24).
--
-- THE USE CASE. A dental practice set up today applies the "Dental Practice" template during
-- onboarding. Every scope type and field it lands is written through the store's scope doors — the
-- same doors the scopes screens use — so the record store holds it first where the store writes the
-- practice's scopes, the old tables are its image, and nothing about templates is a separate writer
-- the final switch has to find. An integration handing a template as a definition (types, fields,
-- parents by key) lands it the same way.
--
-- PERMISSION, SAID PLAINLY: every step is decided by the door it goes through (the store's one
-- ladder, then the old door's own check), so applying a template asks exactly what making those
-- types and fields one by one asks: a member may make scope types, and adding fields to a type is
-- an organization administrator's (public.create_context_item). public.apply_template asked only
-- membership for the fields too; that difference is the doors' rule, not a new one.

-- ── THE TEMPLATE DOOR: a definition, applied through the doors ────────────────────────────────
create or replace function custom.context_template_define(p_organization_id uuid, p_definition jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_types    jsonb := p_definition -> 'scope_types';
  v_n        int;
  v_keys     text[] := '{}';
  v_made     jsonb := '{}'::jsonb;   -- the definition's key of a type -> the id it was made with
  v_created  jsonb := '[]'::jsonb;
  v_items    int := 0;
  v_t        jsonb;
  v_f        jsonb;
  v_i        int;
  v_j        int;
  v_key      text;
  v_parent   text;
  v_type_id  uuid;
  v_progress boolean;
  v_ftype    text;
  v_spec     jsonb;
begin
  if p_organization_id is null then
    raise exception 'A template is applied to an organization, and none was named.' using errcode = '22004';
  end if;
  perform custom.assert_scope_door(p_organization_id, 'custom.context_template_define');
  if jsonb_typeof(v_types) is distinct from 'array' or jsonb_array_length(v_types) = 0 then
    raise exception 'A template lists the scope types it makes (scope_types), and this one lists none.' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(v_types);

  -- EVERY TYPE HAS ITS TWO NAMES, EVERY FIELD ITS KEY AND LABEL, EVERY KEY ONCE — said before anything is made.
  for v_i in 0 .. v_n - 1 loop
    v_t := v_types -> v_i;
    if nullif(btrim(v_t ->> 'singular'), '') is null or nullif(btrim(v_t ->> 'plural'), '') is null then
      raise exception 'Every scope type in a template has a singular and a plural name; type % of this one does not.', v_i + 1
        using errcode = '22023';
    end if;
    for v_f in select e from jsonb_array_elements(coalesce(v_t -> 'fields', '[]'::jsonb)) e loop
      if nullif(btrim(v_f ->> 'key'), '') is null or nullif(btrim(v_f ->> 'display_name'), '') is null then
        raise exception 'Every field in a template has a key and a name; one field of % does not.', v_t ->> 'plural'
          using errcode = '22023';
      end if;
    end loop;
    v_key := coalesce(nullif(v_t ->> 'key', ''), '#' || v_i::text);
    if v_key = any (v_keys) then
      raise exception 'Two scope types in this template share the key %; each type''s key is its own.', v_key using errcode = '22023';
    end if;
    v_keys := v_keys || v_key;
  end loop;

  -- THE TYPES, A PARENT BEFORE ITS CHILDREN, each through custom.context_type_write.
  loop
    v_progress := false;
    for v_i in 0 .. v_n - 1 loop
      v_key := v_keys[v_i + 1];
      continue when v_made ? v_key;
      v_t := v_types -> v_i;
      v_parent := nullif(v_t ->> 'parent_key', '');
      -- A parent the template does not define is no parent (as public.apply_template_definition did).
      if v_parent is not null and not (v_parent = any (v_keys)) then
        v_parent := null;
      end if;
      continue when v_parent is not null and not (v_made ? v_parent);
      v_type_id := (custom.context_type_write(p_organization_id, null, jsonb_strip_nulls(jsonb_build_object(
                      'label_singular', v_t ->> 'singular',
                      'label_plural', v_t ->> 'plural',
                      'parent_type_id', case when v_parent is not null then v_made ->> v_parent end,
                      'icon', coalesce(nullif(v_t ->> 'icon', ''), 'folder'),
                      'description', coalesce(v_t ->> 'description', ''),
                      'sort_order', coalesce(nullif(v_t ->> 'sort_order', '')::int, v_i),
                      'max_assignments', nullif(v_t ->> 'max_assignments_per_entity', ''),
                      'color', nullif(v_t ->> 'color', ''),
                      'slug', nullif(v_t ->> 'slug', '')))) -> 'row' ->> 'id')::uuid;
      v_made := v_made || jsonb_build_object(v_key, v_type_id::text);
      v_progress := true;
    end loop;
    exit when not v_progress;
  end loop;
  if (select count(*) from jsonb_object_keys(v_made)) < v_n then
    raise exception 'The scope types of this template name each other as parents in a circle (%), so none of them can be made first.',
      (select string_agg(k, ', ') from unnest(v_keys) k where not (v_made ? k))
      using errcode = '22023';
  end if;

  -- THE FIELDS, each through custom.context_item_write.
  for v_i in 0 .. v_n - 1 loop
    v_t := v_types -> v_i;
    v_type_id := (v_made ->> v_keys[v_i + 1])::uuid;
    v_created := v_created || jsonb_build_array(jsonb_build_object(
      'id', v_type_id, 'key', v_t ->> 'key', 'label_singular', v_t ->> 'singular', 'label_plural', v_t ->> 'plural'));
    v_j := 0;
    for v_f in select e from jsonb_array_elements(coalesce(v_t -> 'fields', '[]'::jsonb)) e loop
      v_ftype := coalesce(nullif(v_f ->> 'value_type', ''), 'string');
      v_spec := jsonb_strip_nulls(jsonb_build_object(
        'key', v_f ->> 'key', 'display_name', v_f ->> 'display_name',
        'description', coalesce(v_f ->> 'description', ''), 'value_type', v_ftype,
        'category', nullif(v_f ->> 'category', ''),
        'sort_order', coalesce(nullif(v_f ->> 'sort_order', '')::int, v_j),
        'fetch_hint', coalesce(nullif(v_f ->> 'fetch_hint', ''), 'on_demand'),
        'sensitivity', coalesce(nullif(v_f ->> 'sensitivity', ''), 'internal'),
        'tags', case when jsonb_typeof(v_f -> 'tags') = 'array' then v_f -> 'tags' end));
      if v_ftype = 'reference' then
        -- A REFERENCE FIELD POINTS AT A SCOPE: of the type its reference_type_key names, else of its
        -- own type (every business template's "Reports To" is another team member).
        v_spec := v_spec || jsonb_build_object(
          'allowed_reference_types', '["scope"]'::jsonb,
          'allowed_scope_type_ids', jsonb_build_array(coalesce(v_made ->> nullif(v_f ->> 'reference_type_key', ''), v_type_id::text)));
      end if;
      perform custom.context_item_write(null, v_type_id, v_spec);
      v_items := v_items + 1;
      v_j := v_j + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'organization_id', p_organization_id,
    'scope_types_created', v_created,
    'context_items_count', v_items,
    'writer', custom._ctx_answer(p_organization_id, null, null) ->> 'writer');
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers)
values ('custom', 'context_template_define', 'p_organization_id uuid, p_definition jsonb', array['uuid'::regtype, 'jsonb'::regtype]::oid[],
        'SECURITY INVOKER scope door: applies a template given as a definition (scope types with their fields, parents by key) to p_organization_id, each type through custom.context_type_write and each field through custom.context_item_write, so every step makes exactly the checks those doors make (the store''s ladder first, then the old door''s own) and the write-through carries every row into the record store in the same statement where the store is the writer.',
        'scopestails_a_template_is_applied_through_the_store_doors.sql', true, false)
on conflict do nothing;
grant execute on function custom.context_template_define(uuid, jsonb) to authenticated, service_role;

-- ── A CATALOGUE TEMPLATE IS THAT DEFINITION ──────────────────────────────────────────────────
create or replace function custom.context_template_apply(p_organization_id uuid, p_template_id uuid)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_def jsonb;
begin
  perform custom.assert_scope_door(p_organization_id, 'custom.context_template_apply');
  if not exists (select 1 from context.templates t where t.id = p_template_id and t.is_active) then
    raise exception 'There is no template % to apply; it may have been retired.', p_template_id using errcode = 'P0002';
  end if;
  -- THE PLATFORM'S TEMPLATE CATALOGUE STAYS REFERENCE DATA (SCOPES-CONTEXT D10); applying one is a
  -- store operation, through the same doors as any other scope type and field.
  select jsonb_build_object('scope_types', coalesce(jsonb_agg(jsonb_build_object(
           'key', st.id::text,
           'singular', st.label_singular, 'plural', st.label_plural,
           'icon', st.icon, 'description', st.description, 'sort_order', st.sort_order,
           'max_assignments_per_entity', st.max_assignments_per_entity,
           'parent_key', st.parent_template_type_id::text,
           'slug', context.slugify(st.label_plural),
           'fields', (select coalesce(jsonb_agg(jsonb_build_object(
                               'key', ti.key, 'display_name', ti.display_name, 'description', ti.description,
                               'value_type', ti.value_type::text, 'sort_order', ti.sort_order) order by ti.sort_order, ti.key), '[]'::jsonb)
                        from context.template_context_items ti where ti.template_scope_type_id = st.id))
           order by st.sort_order, st.id), '[]'::jsonb))
    into v_def
    from context.template_scope_types st
   where st.template_id = p_template_id;
  return jsonb_build_object('template_id', p_template_id)
         || custom.context_template_define(p_organization_id, v_def);
end;
$function$;

update platform.client_callable_door
   set reason = 'SECURITY INVOKER scope door: applies one of the platform''s active templates (context.templates, reference data) to p_organization_id by handing its definition to custom.context_template_define, so every scope type and field it makes goes through custom.context_type_write / custom.context_item_write and their checks.'
 where schema_name = 'custom' and function_name = 'context_template_apply';

-- ── THE OLD DEFINITION WRITER, RETIRED INTO THE DOOR ─────────────────────────────────────────
-- No caller in any repository and no client grant (EXECUTE stays postgres and service_role only).
-- It inserted into context.* itself, asked nothing about the organization, and refused every
-- reference field; now it is the door's name for the same call and writes nothing of its own.
create or replace function public.apply_template_definition(p_org_id uuid, p_definition jsonb)
 returns jsonb
 language plpgsql
 security invoker
 set search_path to 'pg_catalog'
as $function$
begin
  return custom.context_template_define(p_org_id, p_definition) - 'writer' - 'ok';
end;
$function$;

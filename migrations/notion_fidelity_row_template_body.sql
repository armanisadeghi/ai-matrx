-- Lane NOTION-FIDELITY, 2026-10-07 (Arman: "Ability to do everything Notion does so we can literally
-- replicate someone's notion, including all data and all templates and pages without them losing anything").
--
-- A NOTION DATABASE TEMPLATE CARRIES A PAGE BODY, AND OURS COULD NOT.
-- A row template stored only preset column values; the body a Notion template opens with (headings,
-- checklists, callouts) was dropped by the importer ("a template's own body text is not carried yet").
-- A template now also holds `body` — the same {"v": 1, "blocks": [...]} snapshot a record's page holds.
--
--   custom.row_template_declare(p_organization_id, p_table_id, p_spec)
--     p_spec.body (optional): an object {"v": 1, "blocks": [...]}; stored beside the values in the
--     template's definition. Sent again with the same name and no body, the stored body is kept;
--     a body sent replaces it. A body that is not that shape is refused by name. Nothing else changes:
--     same door arguments, same editor rung, same archive-never-delete.
--   custom.row_template_bodies(p_organization_id, p_table_id)   (NEW, read-only)
--     the bodies of a table's templates: (template_id, body), viewer on the table — the same wall as
--     custom.row_templates, which is left exactly as it is (its return type is read by the grid).
--     Declared in platform.client_callable_door before the GRANT.
--
-- Adds only (one function replaced in place with the same arguments, one new read function): existing templates have no body and behave exactly as before.
-- Inverse: migrations/inverse/notion_fidelity_row_template_body_down.sql
-- based-on: custom.row_template_declare(uuid, uuid, jsonb) f2ab0a2abf9fb9471b7d297227b5d1b7aa55f009fdef79f423c990ff0f35fa16

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION custom.row_template_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id     uuid := nullif(p_spec ->> 'template_id', '')::uuid;
  v_name   text := nullif(btrim(p_spec ->> 'name'), '');
  v_values jsonb := case when jsonb_typeof(p_spec -> 'values') = 'object' then p_spec -> 'values' end;
  v_body   jsonb := case when jsonb_typeof(p_spec -> 'body') = 'object' then p_spec -> 'body' end;
  v_bad    text;
  v_known  text;
  v_found  uuid;   -- the existing template this call changes, or null for a new one
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.row_template_declare');
  -- EDITOR on the Table: a template is how everyone's new rows start, so it changes the Table.
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.row_template_declare',
                                          'editor'::public.permission_level, 'table');
  perform custom.assert_store_door(p_organization_id, 'custom.row_template_declare');

  if p_table_id is null then
    raise exception 'A row template is a template OF a table — name the table.' using errcode = '22004';
  end if;

  -- NOTION-FIDELITY: a body is a page snapshot {"v": 1, "blocks": [...]}; anything else is refused by name.
  if p_spec ? 'body' and jsonb_typeof(p_spec -> 'body') <> 'null' then
    if v_body is null or (v_body ->> 'v') is distinct from '1' or jsonb_typeof(v_body -> 'blocks') <> 'array' then
      raise exception 'A template body is a page snapshot: {"v": 1, "blocks": [...]}.' using errcode = '22023',
            hint = 'It is the same body a row''s page holds; send it as pages upsert takes it. Nothing was written.';
    end if;
  end if;

  -- Same name on the same Table = that template (a declare is idempotent by name).
  if v_id is null and v_name is not null then
    select sv.id into v_id
      from platform.saved_view sv
     where sv.organization_id = p_organization_id and sv.deleted_at is null
       and sv.surface_key = 'custom/records/template' and sv.subject_id = p_table_id
       and lower(sv.name) = lower(v_name)
     limit 1;
  end if;

  if v_id is not null then
    select sv.id into v_found
      from platform.saved_view sv
     where sv.id = v_id and sv.organization_id = p_organization_id and sv.deleted_at is null
       and sv.surface_key = 'custom/records/template' and sv.subject_id = p_table_id
       for update;
    if v_found is null then
      raise exception 'There is no such row template on this table.' using errcode = '23503',
            detail = jsonb_build_object('template_id', v_id)::text;
    end if;
    -- Archive (never delete): {"template_id": …, "archived": true}.
    if (p_spec -> 'archived') = 'true'::jsonb then
      update platform.saved_view set deleted_at = now() where id = v_found and organization_id = p_organization_id;
      return v_found;
    end if;
  end if;

  if v_name is null and v_found is null then
    raise exception 'A row template needs a name — it is what a person picks it by.' using errcode = '23514';
  end if;
  if v_values is null and v_found is null then
    v_values := '{}'::jsonb;
  end if;

  -- Every value names a column of THIS table, by its key; a misspelling is refused by name.
  if v_values is not null then
    select x.k into v_bad
      from jsonb_object_keys(v_values) x(k)
     where not exists (select 1 from custom.field f
                        where f.organization_id = p_organization_id
                          and f.entity_definition_id = p_table_id and f.key = x.k)
     limit 1;
    if v_bad is not null then
      select string_agg(f.key, ', ' order by f.sort, f.key) into v_known
        from custom.field f
       where f.organization_id = p_organization_id and f.entity_definition_id = p_table_id;
      raise exception 'This table has no column "%", so the template cannot set it.', v_bad
        using errcode = '22023', hint = format('Its columns are: %s. Nothing was written.', coalesce(v_known, 'none'));
    end if;
  end if;

  if v_found is not null then
    update platform.saved_view
       set name = coalesce(v_name, name),
           definition = jsonb_build_object('table_id', p_table_id,
                                           'values', coalesce(v_values, definition -> 'values', '{}'::jsonb))
                        || case when v_body is not null then jsonb_build_object('body', v_body)
                                when definition ? 'body' then jsonb_build_object('body', definition -> 'body')
                                else '{}'::jsonb end,
           updated_at = now(), version = version + 1
     where id = v_found and organization_id = p_organization_id;
    return v_found;
  end if;

  insert into platform.saved_view
    (name, surface_key, subject_id, definition, organization_id, created_by)
  values (v_name, 'custom/records/template', p_table_id,
          jsonb_build_object('table_id', p_table_id, 'values', v_values)
            || case when v_body is not null then jsonb_build_object('body', v_body) else '{}'::jsonb end,
          p_organization_id, custom.query_principal())
  returning id into v_id;
  return v_id;
end;
$function$;

CREATE FUNCTION custom.row_template_bodies(p_organization_id uuid, p_table_id uuid)
 RETURNS TABLE(template_id uuid, body jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.row_template_bodies');
  -- VIEWER on the Table: the same wall as custom.row_templates.
  perform custom.assert_client_may_open(p_organization_id, p_table_id, 'custom.row_template_bodies',
                                        'viewer'::public.permission_level, 'record');
  return query
    select sv.id, sv.definition -> 'body'
      from platform.saved_view sv
     where sv.organization_id = p_organization_id
       and sv.deleted_at is null
       and sv.surface_key = 'custom/records/template'
       and sv.subject_id = p_table_id
       and sv.definition ? 'body';
end;
$function$;

insert into platform.client_callable_door (
  schema_name, function_name, identity_args, identity_argtypes,
  reason, declared_by, signed_in_callers, anonymous_callers, argument_rules
)
select 'custom', 'row_template_bodies', 'p_organization_id uuid, p_table_id uuid', array['uuid','uuid']::regtype[]::oid[],
       'p_organization_id is checked by custom.assert_client_may_reach on entry; p_table_id is then put to custom.assert_client_may_open at the VIEWER rung on that Table, both before any read. It reads only platform.saved_view rows of surface custom/records/template whose subject is that same Table and organization, and returns each one''s stored body.',
       'notion_fidelity_row_template_body.sql', true, false,
       jsonb_build_object('version', 1, 'arguments', jsonb_build_object(
         'p_table_id', jsonb_build_object('type', 'uuid',
           'check', 'this body decides it with custom.assert_client_may_open(arg2) — the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.',
           'entity', 'custom_record', 'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
           'position', 2, 'verified', '2026-10-07 lane NOTION-FIDELITY — read from this body'),
         'p_organization_id', jsonb_build_object('type', 'uuid',
           'check', 'this body decides it with custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
           'entity', 'organization', 'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
           'position', 1, 'verified', '2026-10-07 lane NOTION-FIDELITY — read from this body')))
 where not exists (select 1 from platform.client_callable_door d where d.schema_name = 'custom' and d.function_name = 'row_template_bodies');

grant execute on function custom.row_template_bodies(uuid, uuid) to authenticated, service_role;

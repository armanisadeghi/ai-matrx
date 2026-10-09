-- inverse of notion_fidelity_row_template_body.sql
-- WHAT IT DOES NOT UNDO: template bodies already saved stay inside each template's stored definition
-- (the `body` key); the restored functions simply no longer read or write them, so nothing is lost and
-- re-applying the forward file shows them again. Bodies below are the live definitions read out of the
-- catalogue immediately before the forward file was applied.

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
  v_bad    text;
  v_known  text;
  v_found  uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.row_template_declare');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.row_template_declare',
                                          'editor'::public.permission_level, 'table');
  perform custom.assert_store_door(p_organization_id, 'custom.row_template_declare');
  if p_table_id is null then
    raise exception 'A row template is a template OF a table — name the table.' using errcode = '22004';
  end if;
  if v_id is null and v_name is not null then
    select sv.id into v_id from platform.saved_view sv
     where sv.organization_id = p_organization_id and sv.deleted_at is null
       and sv.surface_key = 'custom/records/template' and sv.subject_id = p_table_id
       and lower(sv.name) = lower(v_name) limit 1;
  end if;
  if v_id is not null then
    select sv.id into v_found from platform.saved_view sv
     where sv.id = v_id and sv.organization_id = p_organization_id and sv.deleted_at is null
       and sv.surface_key = 'custom/records/template' and sv.subject_id = p_table_id for update;
    if v_found is null then
      raise exception 'There is no such row template on this table.' using errcode = '23503',
            detail = jsonb_build_object('template_id', v_id)::text;
    end if;
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
  if v_values is not null then
    select x.k into v_bad from jsonb_object_keys(v_values) x(k)
     where not exists (select 1 from custom.field f
                        where f.organization_id = p_organization_id
                          and f.entity_definition_id = p_table_id and f.key = x.k) limit 1;
    if v_bad is not null then
      select string_agg(f.key, ', ' order by f.sort, f.key) into v_known from custom.field f
       where f.organization_id = p_organization_id and f.entity_definition_id = p_table_id;
      raise exception 'This table has no column "%", so the template cannot set it.', v_bad
        using errcode = '22023', hint = format('Its columns are: %s. Nothing was written.', coalesce(v_known, 'none'));
    end if;
  end if;
  if v_found is not null then
    update platform.saved_view
       set name = coalesce(v_name, name),
           definition = jsonb_build_object('table_id', p_table_id,
                                           'values', coalesce(v_values, definition -> 'values', '{}'::jsonb)),
           updated_at = now(), version = version + 1
     where id = v_found and organization_id = p_organization_id;
    return v_found;
  end if;
  insert into platform.saved_view (name, surface_key, subject_id, definition, organization_id, created_by)
  values (v_name, 'custom/records/template', p_table_id,
          jsonb_build_object('table_id', p_table_id, 'values', v_values),
          p_organization_id, custom.query_principal())
  returning id into v_id;
  return v_id;
end;
$function$;

delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'row_template_bodies';
drop function if exists custom.row_template_bodies(uuid, uuid);

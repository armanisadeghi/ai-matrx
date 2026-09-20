-- INVERSE of apprvtail_a_field_row_is_a_field.sql
-- It takes the guard and the trigger off, drops the repair verb, and restores
-- `custom._options_table_for` EXACTLY as the live catalogue held it before that file ran —
-- the body lane CHOICE-VALUE landed at 06:56 UTC on 2026-09-20, hash in that file's
-- `-- based-on:` line. Running it puts the hole back — a Field row writable with any class, a
-- choices table whose two columns are second-class — which is what the red twin runs to prove
-- the guard was real.
--
-- IT DOES NOT PUT THE CONVERTED ROWS BACK. Their Migration entries say `{"kind":"none"}` and
-- say why: the class they carried was the defect. Reversing a repair is not the inverse of
-- installing a guard, and marking real Field rows as plain records again would be doing the
-- damage deliberately.
CREATE OR REPLACE FUNCTION custom._options_table_for(p_organization_id uuid, p_label text, p_options jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_home  uuid;
  v_table uuid;
  v_slug  text;
  v_word  text;
begin
  v_slug := regexp_replace(lower(btrim(coalesce(p_label, 'choices'))), '[^a-z0-9]+', '_', 'g');
  v_slug := regexp_replace(v_slug, '^_+|_+$', '', 'g');
  if v_slug !~ '^[a-z]' then v_slug := 'c_' || v_slug; end if;
  v_slug := left(v_slug || '_choices_' || replace(gen_random_uuid()::text, '-', ''), 48);

  -- REC-1: a Table has to live somewhere, so it gets its own Home like any other.
  insert into custom.record (organization_id, table_id, data)
  values (p_organization_id, custom.person_kernel_id(),
          jsonb_build_object('name', coalesce(p_label, 'Choices') || ' choices Home'))
  returning id into v_home;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.table_kernel_id(), 'table', jsonb_build_object(
    'name',           coalesce(p_label, 'Choices') || ' choices',
    'slug',           v_slug,
    'type',           'entity',
    'label_singular', 'Choice',
    'label_plural',   'Choices',
    -- FLD-5: a list Field takes its choices from a Table SHOWN AS A LIST.
    'display',        'list',
    'weight',         'light',
    'ordered',        true,
    'row_order',      'manual',
    'title_field',    'title',
    'retention_days', 365,
    'agent_writable', true,
    'default_sort',   jsonb_build_array(jsonb_build_object('field', 'title', 'direction', 'asc')),
    -- The stable key is declared here, beside the title, because a Field definition the Table
    -- does not declare is refused by custom._field_shape_guard.
    'fields',         jsonb_build_array(jsonb_build_object('name', 'title'),
                                        jsonb_build_object('name', 'key')),
    -- KEPT BY THE APP. The tables list already has a lane for the app's own
    -- bookkeeping; a person's list of tables must not fill up with one table
    -- per dropdown they made.
    'kept_by_the_app', true,
    'parent_id',      v_home))
  returning id into v_table;

  insert into custom.record (organization_id, table_id, data)
  values (p_organization_id, custom.field_kernel_id(), jsonb_build_object(
    'key', 'title', 'label', 'Choice', 'type', 'text',
    'multi', false, 'dated', false, 'required', false, 'sort', 10,
    'rules', '[]'::jsonb, 'config', '{}'::jsonb, 'source', 'manual',
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'depends_on', '[]'::jsonb, 'entity_definition_id', v_table));

  insert into custom.record (organization_id, table_id, data)
  values (p_organization_id, custom.field_kernel_id(), jsonb_build_object(
    'key', 'key', 'label', 'Key', 'type', 'text',
    'multi', false, 'dated', false, 'required', false, 'sort', 20,
    'rules', '[]'::jsonb, 'config', '{}'::jsonb, 'source', 'manual',
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'depends_on', '[]'::jsonb, 'kept_by_the_app', true,
    'entity_definition_id', v_table));

  for v_word in select value #>> '{}' from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
    if btrim(coalesce(v_word, '')) <> '' then
      insert into custom.record (organization_id, table_id, data)
      values (p_organization_id, v_table,
              jsonb_build_object('title', btrim(v_word),
                                 'key', custom.choice_key_for(p_organization_id, v_table, btrim(v_word))));
    end if;
  end loop;

  return v_table;
end
$function$

;
drop trigger if exists custom_record_field_shape_guard_class on custom.record;
drop function if exists custom._field_class_guard();
drop function if exists custom.migrate_reclass(uuid, uuid, text, text);
delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'migrate_reclass';

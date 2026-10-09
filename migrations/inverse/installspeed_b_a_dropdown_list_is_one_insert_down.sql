-- chair-step: puts custom._options_table_for back to the body it held before installspeed_b_a_dropdown_list_is_one_insert.sql (read from the catalogue with pg_get_functiondef).

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
  v_pos   bigint;
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
    -- FLD-5: ONE title field. The stable key is system state and lives in `metadata`.
    'fields',         jsonb_build_array(jsonb_build_object('name', 'title')),
    -- KEPT BY THE APP. The tables list already has a lane for the app's own
    -- bookkeeping; a person's list of tables must not fill up with one table
    -- per dropdown they made.
    'kept_by_the_app', true,
    'parent_id',      v_home))
  returning id into v_table;

  -- `'field'`, SAID OUT LOUD. These two inserts used to name no class, so the column
  -- defaulted to `'record'` and every dropdown anybody ever made left second-class Field
  -- rows behind — invisible to `custom.field_declare`'s duplicate check and to every other
  -- reader that asks for a Field by class. `custom._field_class_guard` now refuses that shape.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'title', 'label', 'Choice', 'type', 'text',
    'multi', false, 'dated', false, 'required', false, 'sort', 10,
    'rules', '[]'::jsonb, 'config', '{}'::jsonb, 'source', 'manual',
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'depends_on', '[]'::jsonb, 'entity_definition_id', v_table));


  -- THE ORDER THE PERSON WROTE THEM IN, KEPT. Every option of one list is inserted inside
  -- ONE transaction, so `created_at` is the same instant for all of them and the only
  -- tiebreak left was a random uuid: a five-stage board declared Lead · Qualified ·
  -- Proposal · Won · Lost drew Proposal · Lost · Qualified · Lead · Won (measured on the
  -- main database, 2026-09-20). That is every dropdown in the platform, not only a board.
  -- FLD-5 keeps a choices Table to ONE title field, so the position is system state and
  -- lives in `metadata` beside the stable key — never a second column.
  for v_word, v_pos in
    select value #>> '{}', ordinality
      from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) with ordinality
  loop
    if btrim(coalesce(v_word, '')) <> '' then
      insert into custom.record (organization_id, table_id, data, metadata)
      values (p_organization_id, v_table,
              jsonb_build_object('title', btrim(v_word)),
              jsonb_build_object('option_key',
                custom.choice_key_for(p_organization_id, v_table, btrim(v_word)),
                'option_position', v_pos));
    end if;
  end loop;

  return v_table;
end
$function$
;

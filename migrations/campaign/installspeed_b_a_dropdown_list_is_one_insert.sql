-- chair-step: it REPLACES the body of custom._options_table_for(uuid, text, jsonb) (signature, volatility, search_path and grants unchanged): a list of options is inserted with ONE statement, not one per option, so the store's statement triggers run once per dropdown. Same rows, same option_key and option_position values.
-- lane: INSTALL-SPEED
-- based-on: custom._options_table_for(uuid, text, jsonb) e0749d09d43ead3187f60870b121f13351095a36b0826af1629d58ebdc48ca1a
-- lock: custom

set local statement_timeout = '60s';

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
  v_base  text;
  v_try   text;
  v_n     integer;
  v_keys  text[] := array[]::text[];
  v_titles text[] := array[]::text[];
  v_poss  bigint[] := array[]::bigint[];
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
  -- INSTALL-SPEED: ONE insert for the whole list, not one per option. Each single-row insert paid every
  -- statement trigger of the store (outbox, realtime notice, history, activity) for one row; a template
  -- with thirteen dropdowns paid it ~60 times. The keys are worked out here exactly as
  -- custom.choice_key_for does (a base slug, then _2, _3 … until nothing handed out earlier in this list
  -- holds it) because a brand-new table has no other options to collide with and a set insert cannot see
  -- its own siblings.
  for v_word, v_pos in
    select value #>> '{}', ordinality
      from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) with ordinality
  loop
    if btrim(coalesce(v_word, '')) <> '' then
      v_base := custom.choice_slug(btrim(v_word));
      v_try := v_base;
      v_n := 1;
      while v_try = any (v_keys) loop
        v_n := v_n + 1;
        v_try := left(v_base, 50) || '_' || v_n;
      end loop;
      v_keys := v_keys || v_try;
      v_titles := v_titles || btrim(v_word);
      v_poss := v_poss || v_pos;
    end if;
  end loop;
  if coalesce(array_length(v_titles, 1), 0) > 0 then
    insert into custom.record (organization_id, table_id, data, metadata)
    select p_organization_id, v_table,
           jsonb_build_object('title', t.title),
           jsonb_build_object('option_key', t.k, 'option_position', t.pos)
      from unnest(v_titles, v_keys, v_poss) with ordinality as t(title, k, pos, ord)
     order by t.ord;
  end if;

  return v_table;
end
$function$
;

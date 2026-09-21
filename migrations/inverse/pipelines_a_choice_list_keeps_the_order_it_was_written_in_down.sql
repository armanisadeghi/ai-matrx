-- INVERSE of migrations/campaign/pipelines_a_choice_list_keeps_the_order_it_was_written_in.sql
-- (lane PIPELINES). It puts the three bodies back as they stood at 19:46Z on 2026-09-20, with
-- a choices list coming back in whatever order uuid sorting happened to produce, and drops the
-- backfill function. IT DOES NOT STRIP `metadata -> 'option_position'` FROM ANY ROW: that key
-- is additive, nothing in the restored bodies reads it, and deleting a key off live rows to
-- undo a code change is how an inverse becomes the destructive act it exists to avoid.
--
-- 🚨 ONE OF THE TWO RUNS, AND IF BOTH RUN, THIS ONE FIRST (lane INVERSE-GUARD, 2026-09-21).
-- A body restored below calls `custom._stage_field_key`, and the sibling inverse
-- `pipelines_a_stage_is_a_field_and_its_moves_are_rules_down.sql` takes that function away —
-- because it inverts the stage lane that created it, while this file inverts only the later
-- ordering fix that landed on top of that lane. They invert in the reverse of the order they
-- landed: this file first, the stage teardown second, and the stage teardown takes the bodies
-- restored here with it, so after both have run nothing calls a function that is gone. The
-- other order is the only one that breaks, and an inverse pair is never run in it.
-- ground-standing-ok: b


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


  for v_word in select value #>> '{}' from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
    if btrim(coalesce(v_word, '')) <> '' then
      insert into custom.record (organization_id, table_id, data, metadata)
      values (p_organization_id, v_table,
              jsonb_build_object('title', btrim(v_word)),
              jsonb_build_object('option_key',
                custom.choice_key_for(p_organization_id, v_table, btrim(v_word))));
    end if;
  end loop;

  return v_table;
end
$function$

;

CREATE OR REPLACE FUNCTION custom.choice_options(p_organization_id uuid, p_options_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- LADDER-PERF's class, on the WRITE path. Everything between `begin` and `end`
  -- is this function's own SQL body, character for character; only the language
  -- moved, so a plan is cached for the session instead of built on every call.
  return (
  -- key -> {label, id, retired, reason}. RETIRED OPTIONS ARE IN HERE: a value that points at
    -- one must read as its label with the reason, not disappear. Live rows are aggregated LAST
    -- so that if a retired option and a live one ever shared a key, the live one wins.
    select coalesce(jsonb_object_agg(x.k, x.v), '{}'::jsonb)
      from (select coalesce(nullif(o.metadata ->> 'option_key', ''),
                            custom.choice_slug(coalesce(o.data ->> 'title', o.data ->> 'name'))) as k,
                   jsonb_build_object(
                     'label',   coalesce(nullif(o.data ->> 'title', ''),
                                         nullif(o.data ->> 'name', ''),
                                         coalesce(nullif(o.metadata ->> 'option_key', ''), '(unnamed choice)')),
                     'id',      o.id::text,
                     'retired', o.deleted_at is not null,
                     'reason',  case when o.deleted_at is not null
                                     then format('This choice was retired on %s. The value is kept and still means what it meant.',
                                                 to_char(o.deleted_at at time zone 'utc', 'FMDD Month YYYY'))
                                end) as v
              from custom.record o
             where o.organization_id = p_organization_id
               and o.table_id = p_options_table_id
             order by (o.deleted_at is null), o.created_at) x
  );
end
$function$

;

CREATE OR REPLACE FUNCTION custom.pipeline_read(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_key   text;
  v_fid   uuid;
  v_flab  text;
  v_opts  uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_read');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.pipeline_read');
  v_key := custom._stage_field_key(p_organization_id, p_table_id);
  if v_key is null then
    -- Absent, not empty, and it says what would make it exist.
    return jsonb_build_object('is_pipeline', false,
             'why', 'This table has no stage column yet, so there is no board to draw.');
  end if;
  select f.id, coalesce(nullif(f.data ->> 'label', ''), 'Stage'),
         (f.data -> 'config' ->> 'options_table_id')::uuid
    into v_fid, v_flab, v_opts
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and f.data ->> 'key' = v_key;
  if v_fid is null then
    raise exception 'this table says its stage is kept in %, and that column is gone', v_key
      using errcode = '23503',
            hint = 'Declare the pipeline again with custom.pipeline_declare, or point stage_field at a column that is there.';
  end if;

  return jsonb_build_object(
    'is_pipeline', true,
    'table_id',    p_table_id,
    'stage_field', v_key,
    'field_id',    v_fid,
    'stage_label', v_flab,
    -- key AND label, both, every time. A board that carried only labels could not write a
    -- move; one that carried only keys could not draw a heading.
    -- THE ORDER A PERSON DECLARED, which is the order the board draws. The options are
    -- read as RECORDS, oldest first, because `custom.choice_options` answers a jsonb
    -- OBJECT and a jsonb object has no order at all — a board built on it drew Won
    -- first and Lead second, measured 2026-09-20.
    'stages',      coalesce((select jsonb_agg(jsonb_build_object(
                               'key', coalesce(nullif(o.metadata ->> 'option_key', ''),
                                               custom.choice_slug(o.data ->> 'title')),
                               'label', coalesce(nullif(o.data ->> 'title', ''), '(unnamed choice)'),
                               'retired', o.deleted_at is not null)
                               order by (o.deleted_at is not null), o.created_at, o.id)
                              from custom.record o
                             where o.organization_id = p_organization_id
                               and o.table_id = v_opts), '[]'::jsonb),
    'rules',       coalesce((select jsonb_agg(jsonb_build_object(
                               'id', r.id, 'name', r.data ->> 'name',
                               'message', r.data ->> 'message',
                               'kind', r.data #>> '{pipeline,kind}',
                               'stage', r.data #>> '{pipeline,stage}',
                               'uses', r.data -> 'uses',
                               'on_entry', r.data -> 'on_entry',
                               'version', r.version)
                               order by r.data #>> '{pipeline,kind}', r.data #>> '{pipeline,stage}')
                              from custom.record r
                             where r.organization_id = p_organization_id
                               and r.table_id = custom.rule_kernel_id()
                               and r.deleted_at is null
                               and (r.data #>> '{pipeline,stage_field_of}')::uuid = p_table_id),
                            '[]'::jsonb));
end;
$function$

;


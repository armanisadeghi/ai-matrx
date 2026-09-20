-- chair-step: it REPLACES three bodies — `custom._options_table_for`, `custom.choice_options`
--   and this lane's own `custom.pipeline_read` — whose prior bytes are pinned by the
--   `-- based-on:` lines below. It grants nothing, creates no trigger, drops nothing, and
--   writes not one row of any organization. The inverse is
--   `migrations/inverse/pipelines_a_choice_list_keeps_the_order_it_was_written_in_down.sql`.
-- guard: custom/system_enabled
-- based-on: custom._options_table_for(uuid, text, jsonb) a567f7d7389f695b967311070f10268bfa21a8dc1cd21a023d0e9febf4da6e27
-- based-on: custom.choice_options(uuid, uuid) c6fb6f60051e8d49ae4fc7f265adf8a8c1c7ca95faf41994d5c0e3a38be736aa
-- based-on: custom.pipeline_read(uuid, uuid) 623963a78b3fe0a5e9afe1655ea8704acd0a4d4d300cc9505f01f2b820d75d7c
--
-- PIPELINES — A LIST OF CHOICES KEEPS THE ORDER IT WAS WRITTEN IN.
--
-- THE DEFECT, AND IT IS EVERY DROPDOWN IN THE PLATFORM, NOT ONLY A BOARD. Measured on the
-- main database 2026-09-20: a five-stage pipeline declared Lead · Qualified · Proposal · Won
-- · Lost read back as Proposal · Lost · Qualified · Lead · Won. Every option of one list is
-- inserted inside ONE transaction, so `now()` is the same instant for all of them; the only
-- remaining tiebreak was `id`, which is a random uuid. `custom.choice_options` additionally
-- answers a jsonb OBJECT, and a jsonb object has no order at all — Postgres stores its keys
-- sorted by length and then by bytes — so even a correct query lost the order on the way out.
--
-- THE FIX, WHERE IT BELONGS. An option now carries `metadata -> 'option_position'`, stamped
-- from the position in the list the person wrote. FLD-5 keeps a choices Table to ONE title
-- field, so a position is system state and lives in `metadata` beside the stable key, exactly
-- as `option_key` does — never a second column. `custom.choice_options` carries it out as
-- `position` and orders by it, so every caller that draws choices in a row inherits the fix
-- without knowing about it.
--
-- AND THE LISTS THAT ALREADY EXIST KEEP THE ORDER THEY ARE DRAWN IN TODAY. `nulls last` on
-- the position, then `created_at`, then `id` — byte for byte the ordering those lists get
-- now. THIS FILE DELIBERATELY DOES NOT BACKFILL THEM, and the reason is worth writing down:
-- a backfill was written, run against the main database at 19:52Z, and REFUSED by the store's
-- own validator (SQLSTATE 23514, `custom.validate_value_envelope`) because option rows exist
-- today that carry a provenance envelope for a field their table does not declare. Updating
-- those rows — even to add a metadata key that changes nothing anybody sees — makes the store
-- re-judge documents somebody else wrote, and a migration that repairs other people's records
-- as a side effect of its own ordering fix is exactly the class this campaign refuses.
-- THE REAL DEFECT IS THOSE ROWS, and it is written down rather than swept up here: some
-- option records carry a value envelope for a key their options Table has no Field for.
-- Whoever owns VAL-1 should sweep them; a choices list declared from today forward is
-- ordered correctly with no sweep at all.

create or replace function custom._options_table_for(p_organization_id uuid, p_label text, p_options jsonb)
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

create or replace function custom.choice_options(p_organization_id uuid, p_options_table_id uuid)
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
                     -- THE POSITION THE PERSON DECLARED. Every caller that draws these in a
                     -- row — a dropdown, a board's columns, an export's vocabulary — needs
                     -- it, and until now there was nothing to order by: one list is written
                     -- in one transaction, so every option shares one `created_at` and the
                     -- only tiebreak left was a random uuid.
                     'position', (o.metadata ->> 'option_position')::integer,
                     'retired', o.deleted_at is not null,
                     'reason',  case when o.deleted_at is not null
                                     then format('This choice was retired on %s. The value is kept and still means what it meant.',
                                                 to_char(o.deleted_at at time zone 'utc', 'FMDD Month YYYY'))
                                end) as v
              from custom.record o
             where o.organization_id = p_organization_id
               and o.table_id = p_options_table_id
             order by (o.deleted_at is null),
                      (o.metadata ->> 'option_position')::integer nulls last,
                      o.created_at, o.id) x
  );
end
$function$

;

create or replace function custom.pipeline_read(p_organization_id uuid, p_table_id uuid)
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
                               order by (o.deleted_at is not null),
                                        (o.metadata ->> 'option_position')::integer nulls last,
                                        o.created_at, o.id)
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


-- additive: yes
--   It ADDS one function (`custom.migrate_reclass`), one trigger function
--   (`custom._field_class_guard`) and one trigger on `custom.record`; it REPLACES one existing
--   function (`custom._options_table_for`) keeping its signature, security, search_path and
--   every branch, changing exactly the two INSERTs of a Field row so each says which class
--   it is (re-based 06:57 UTC on the body lane CHOICE-VALUE landed while this file ran);
--   and it UPDATES our own store's bookkeeping column `data_class` on rows of the Field kernel
--   that already ARE Field rows and say otherwise. No table, column, policy or grant is
--   dropped or revoked; no customer document (`data`) is read, rewritten or deleted.
--   The inverse is `migrations/inverse/apprvtail_a_field_row_is_a_field_down.sql`.
-- NO `-- target:` AND NO `-- guard:` HEADER, ON PURPOSE — same judgement as
--   `apprvfix_the_queue_holds_a_record_write_too.sql`: this file adds no served surface, and
--   every body it touches already opens with the OFF switch (`custom.assert_store_door`) or is
--   a trigger on a table whose every door does.
-- based-on: custom._options_table_for(uuid, text, jsonb) 2cefdf0cea33a48cabbffbb654c019282c1fff87e680977d87d0014b44e93178
--
-- WHAT WAS WRONG, MEASURED ON THE MAIN DATABASE 2026-09-20 06:35 UTC.
--
-- 1806 rows of the Field kernel table carried `data_class = 'record'` instead of `'field'`,
-- against 1276 proper ones. They are OUR OWN bookkeeping marker, not anybody's data: every one
-- of them passed `custom._field_shape_guard` in full (that guard keys on the Field kernel's
-- table_id, not on the class), so their documents are real, validated Field definitions. What
-- the wrong marker cost is that every reader that asks for `data_class = 'field'` could not
-- see them — and one of those readers is `custom.field_declare`'s duplicate check, so a table
-- whose columns were written this way could be given a SECOND column with the same key. One
-- such pair exists on the main database today; it is the proof the marker is not cosmetic.
--
-- THE CAUSE IS STILL LIVE, in two places, and both are closed here and in the package:
--   * `custom._options_table_for` — the Table a list field's choices live in — wrote its
--     `title` and `key` columns with no class at all, so both defaulted to 'record'. Every
--     dropdown anybody ever made left one behind. Fixed below.
--   * `matrx_records.RecordStore.table_propose` wrote a new table's columns through
--     `custom.record_write` into the Field kernel (one batched transaction, `data_class`
--     defaulting to 'record') instead of through `custom.field_declare`. `field_propose` was
--     moved to `field_declare` on 19 September; the batched path beside it was not. That is
--     fixed in the package in the same session as this file.
--
-- THE GUARD IS THE POINT. A backfill without one is a census we get to run again next week.
-- `custom._field_class_guard` refuses a row of the Field kernel written with any other class,
-- names the door that writes it correctly, and therefore REFUSES the two callers above until
-- they are fixed — which is what closing a class means: removing the door, not putting a safe
-- path beside the unsafe one.

-- ───────────────────────────────── 1. the choices table declares its column as a column
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

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', jsonb_build_object(
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
$function$;

-- ───────────────────────────────────────── 2. the migration verb, with history
create or replace function custom.migrate_reclass(
  p_organization_id uuid,
  p_id uuid,
  p_to text default 'field',
  p_note text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_row custom.record%rowtype;
  v_log uuid;
  v_ok  text;
begin
  -- OWNER-ONLY, ON PURPOSE, AND THEREFORE NOT GRANTED TO `authenticated`. This is the store
  -- repairing its OWN bookkeeping marker on a row whose document nobody is changing. A person
  -- has no verb that can put the wrong class on a row any more (custom._field_class_guard),
  -- so a person needs no verb to take it off.
  if not custom.query_is_store_owner() then
    raise exception 'custom.migrate_reclass repairs the store''s own bookkeeping and is not a verb a person calls.'
      using errcode = '42501',
            hint = 'Declare a column with custom.field_declare and it is written with the right class to begin with.';
  end if;
  if p_organization_id is null or p_id is null then
    raise exception 'custom.migrate_reclass: the organization and the row are both required — the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id;
  if v_row.id is null then
    raise exception 'There is no row % here to reclass.', p_id using errcode = '02000';
  end if;

  -- THE CLASS A ROW MAY BE GIVEN IS DECIDED BY THE TABLE IT IS IN, never by the caller. A
  -- verb that took any word would be the hole it exists to close.
  v_ok := case when v_row.table_id = custom.field_kernel_id() then 'field' else null end;
  if v_ok is null then
    raise exception 'custom.migrate_reclass knows how to reclass a row of the Field kernel, and this row is not one.'
      using errcode = '22023',
            hint = 'Every other kernel writes its own class through its own declaring door.';
  end if;
  if p_to is distinct from v_ok then
    raise exception 'A row of the Field kernel is a % and nothing else, so it cannot be reclassed to %.',
                    v_ok, custom.said(p_to, 'nothing')
      using errcode = '22023';
  end if;

  -- IDEMPOTENT, AND IT SAYS SO. Running this over the same organization twice changes nothing
  -- the second time and records no second Migration — a repair that logs work it did not do
  -- is a repair nobody can audit.
  if v_row.data_class = v_ok then
    return jsonb_build_object('verb', 'reclass', 'record_id', p_id, 'was', v_row.data_class,
                              'now', v_ok, 'changed', false, 'at', now());
  end if;

  -- HIS-8: the Migration is on the record BEFORE the write. Its inverse is recorded as `none`
  -- — one-way DELIBERATELY — because putting a Field row back to `'record'` is exactly the
  -- defect this closes and `custom._field_class_guard` now refuses it. The note carries the
  -- class it held, so what happened is fully readable even though it will not be put back.
  v_log := history.migration_record(p_organization_id, 'reclass', 'field', p_id,
             jsonb_build_object('kind', 'none'),
             coalesce(p_note, format(
               'this row of the Field kernel was marked %L and is a %L; its document is unchanged. '
               'It was written before the field door existed, through custom.record_write, whose '
               'data_class defaults to %L — so it was invisible to every reader that asks for a '
               'Field by class, including custom.field_declare''s duplicate check. One-way: the '
               'wrong class cannot be written again.', v_row.data_class, v_ok, 'record')));

  update custom.record r
     set data_class = v_ok
   where r.organization_id = p_organization_id and r.id = p_id;

  return jsonb_build_object('verb', 'reclass', 'record_id', p_id, 'was', v_row.data_class,
                            'now', v_ok, 'changed', true, 'migration_id', v_log, 'at', now());
end
$function$;

-- THE ACCESS DECISION, IN DATA, IN THIS SAME TRANSACTION (DD-223). Nobody outside the store
-- may call this: it is the store repairing its own bookkeeping marker, and the body's first
-- act is `custom.query_is_store_owner()`.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'migrate_reclass',
        'p_organization_id uuid, p_id uuid, p_to text, p_note text',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
        'p_organization_id: the tenant the row belongs to and the leading column of custom.record''s key; NULL is refused with 22004. p_id: a row of that organization''s Field kernel; NULL is refused with 22004, a row that is not in that organization is refused with 02000, and a row that is not of the Field kernel is refused with 22023. p_to: the class the row is given, and it is checked against the KERNEL the row lives in rather than taken from the caller — anything but ''field'' is refused with 22023. p_note: free text on the Migration entry, NULL meaning the verb writes its own sentence. No entity token is declared on either uuid because this door makes no visibility decision with them: it refuses every caller that is not the role owning custom.record.',
        'apprvtail_a_field_row_is_a_field.sql',
        'server_only: only a campaign migration and the record store''s own repair path call this. Its first statement refuses any caller that is not the role owning custom.record, so a signed-in person reaching it through PostgREST would get 42501 even if schema custom were open. A person has no verb that can put the wrong class on a Field row any more (custom._field_class_guard), so a person needs no verb to take it off.',
        false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

comment on function custom.migrate_reclass(uuid, uuid, text, text) is
  'Repairs the store''s own data_class marker on a row of the Field kernel, in place, with a Migration on the record. Idempotent; owner-only; one-way by design because custom._field_class_guard refuses the wrong class going forward.';

-- ─────────────────────────────────── 3. the guard: a Field row is written as a field
create or replace function custom._field_class_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  if new.table_id is distinct from custom.field_kernel_id() then
    return new;
  end if;
  -- The kernel's own row is defined in code, not in data (REC-27), exactly as
  -- custom._field_shape_guard exempts it.
  if new.data_class = 'kernel' then
    return new;
  end if;
  if new.data_class is distinct from 'field' then
    raise exception 'a column of a table is stored as a field, and this one says %',
                    custom.said(new.data_class, 'nothing')
      using errcode = '23514',
            hint = 'FLD-13: write a column through custom.field_declare (a custom Table) or custom.entity_field_declare (a standard one). custom.record_write stores a plain record and its class defaults to "record", which makes the column invisible to every reader that asks for a Field by class — including the duplicate check that stops one table having the same column twice.';
  end if;
  return new;
end
$function$;

-- The name puts it beside the other guards that judge a Field row, and after
-- `custom_record_field_shape_guard`, so a malformed document is still refused for being
-- malformed rather than for its class.
-- Created only if it is not already there, so the file re-runs cleanly. No DROP: this file
-- takes nothing away, and a `drop trigger if exists` here would make it non-additive on paper
-- for a trigger that has never existed.
do $$
begin
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'custom.record'::regclass
                    and t.tgname = 'custom_record_field_shape_guard_class') then
    create trigger custom_record_field_shape_guard_class
      before insert or update on custom.record
      for each row execute function custom._field_class_guard();
  end if;
end
$$;

-- ────────────────────────────── 4. the backfill, through the verb, idempotent
do $$
declare
  v_row     record;
  v_done    integer := 0;
  v_already integer := 0;
  v_before  integer;
  v_after   integer;
  v_retired integer;
begin
  select count(*) into v_before from custom.record
   where table_id = custom.field_kernel_id() and data_class not in ('field', 'kernel')
     and deleted_at is null;
  select count(*) into v_retired from custom.record
   where table_id = custom.field_kernel_id() and data_class not in ('field', 'kernel')
     and deleted_at is not null;

  -- THE LIVE ONES ONLY, AND THE REASON IS A MEASUREMENT, NOT A CONVENIENCE. Every one of the
  -- rows carrying the wrong class that is ALSO soft-deleted (670 of 1820 on the main database
  -- at 06:45 UTC on 2026-09-20) belongs to a Table that was itself deleted — the cascade did
  -- take them. `custom._field_shape_guard` refuses any write to a Field whose Table is gone,
  -- and it is right to: a retired definition of a retired table is history, and rewriting
  -- history to fix a marker nothing will ever read again would be the wrong trade. They are
  -- counted and named in the notice below rather than quietly left out.
  for v_row in
    select r.organization_id, r.id
      from custom.record r
     where r.table_id = custom.field_kernel_id()
       and r.data_class not in ('field', 'kernel')
       and r.deleted_at is null
     order by r.organization_id, r.created_at
  loop
    if (custom.migrate_reclass(v_row.organization_id, v_row.id, 'field',
          'APPROVAL-TAIL backfill 2026-09-20: written through custom.record_write before the '
          'batched table path used custom.field_declare, so it carried the default class '
          '"record". The document is unchanged; only the store''s own marker is.') ->> 'changed')::boolean
    then
      v_done := v_done + 1;
    else
      v_already := v_already + 1;
    end if;
  end loop;

  select count(*) into v_after from custom.record
   where table_id = custom.field_kernel_id() and data_class not in ('field', 'kernel')
     and deleted_at is null;

  raise notice 'APPROVAL-TAIL: % live Field rows were carrying another class; % converted, % were already right; % left. % more are soft-deleted with the Table they defined and are left as history.',
               v_before, v_done, v_already, v_after, v_retired;
  if v_after <> 0 then
    raise exception 'the backfill left % live Field rows carrying another class', v_after
      using errcode = '23514';
  end if;
end
$$;

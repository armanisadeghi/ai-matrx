-- scripts/campaign-repairs/limitsfix_backfill_declared_fields.sql — LANE LIMITS-FIX.
--
-- THE REPAIR for every table that already declared its columns and never got them.
--
-- `custom.table_declare` used to write the spec's `fields` into the table's own document and
-- create no Field record, while `custom.applicable_fields` reads only Field records. The
-- door is fixed (`limitsfix_a_table_s_declared_fields_exist.sql`), but the tables made
-- BEFORE that fix are still split, and they include the real-data crews' own: measured on
-- the main database 2026-09-21, 103 tables across 15 organizations holding 310 declared
-- field names with no backing Field record — so their grids say "This table has no columns
-- yet", their rollups cannot resolve, and `store.fields()` answers an empty array.
--
-- WHAT IT DOES. For each such table, each entry in its declared `fields` list becomes a real
-- Field record, built by `custom._field_document_for` — the SAME builder both doors use, so
-- a recovered column is the same kind of thing as a declared one and is judged by the same
-- guards. Position in the declared list becomes `sort`, so the columns appear in the order
-- the person wrote them.
--
-- WHAT IT DOES NOT DO, and this is the point: it INVENTS NOTHING. It only writes columns the
-- table itself already declared, and it touches no table that has any Field record at all.
-- Every recovered column carries two marks so nothing about it is invisible:
--   · `recovered_from_table_spec` — this column was read back out of its table's own
--     declaration on 2026-09-21, rather than being defined by a person;
--   · `declared_with_table` — which is simply TRUE of it, and means `custom.field_declare`
--     will FILL IT IN (type, rules, choices, label) when somebody defines it properly,
--     instead of refusing it as a duplicate.
--
-- A field the builder refuses fails only ITS OWN table, which is skipped whole and named, so
-- one bad entry can never leave a table half recovered. The rehearsal run found 310 of 310
-- entries buildable and zero refusals.
--
-- Run:  <scratchpad>/prod.sh -f scripts/campaign-repairs/limitsfix_backfill_declared_fields.sql
--       <scratchpad>/prod.sh -v commit_it=true -f scripts/campaign-repairs/limitsfix_backfill_declared_fields.sql
-- It runs as the store's owner: this is a repair of the store's own rows, not a client door.

-- `-v commit_it=true` writes the repair; anything else rehearses and rolls back.
\set ON_ERROR_STOP on
\if :{?commit_it}
\else
  \set commit_it false
\endif

begin;
set local lock_timeout = '120s';
set local statement_timeout = '600s';

do $b$
declare
  r          record;
  e          jsonb;
  v_doc      jsonb;
  v_pos      integer;
  v_before   integer;
  v_after    integer;
  v_tables   integer := 0;
  v_fields   integer := 0;
  v_skipped  integer := 0;
  v_msg      text;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'this backfill runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
  perform set_config('app.actor_system', 'campaign/limitsfix_backfill_declared_fields', true);

  select count(*) into v_before from custom.record t
   where t.table_id = custom.table_kernel_id() and t.data_class = 'table' and t.deleted_at is null
     and jsonb_array_length(coalesce(t.data -> 'fields','[]'::jsonb)) > 0
     and not exists (select 1 from custom.record f
                      where f.organization_id = t.organization_id
                        and f.table_id = custom.field_kernel_id() and f.deleted_at is null
                        and (f.data ->> 'entity_definition_id')::uuid = t.id);
  raise notice 'BEFORE — tables whose declared columns have no Field record: %', v_before;

  for r in
    select t.organization_id, t.id, t.data ->> 'name' as name, t.data -> 'fields' as fields
      from custom.record t
     where t.table_id = custom.table_kernel_id() and t.data_class = 'table' and t.deleted_at is null
       and jsonb_array_length(coalesce(t.data -> 'fields','[]'::jsonb)) > 0
       and not exists (select 1 from custom.record f
                        where f.organization_id = t.organization_id
                          and f.table_id = custom.field_kernel_id() and f.deleted_at is null
                          and (f.data ->> 'entity_definition_id')::uuid = t.id)
     order by t.created_at
  loop
    begin
      v_pos := 0;
      for e in select * from jsonb_array_elements(r.fields) loop
        v_pos := v_pos + 1;
        if (e ->> 'sort') is null then
          e := e || jsonb_build_object('sort', v_pos * 100);
        end if;
        v_doc := custom._field_document_for(r.organization_id, r.id, e);

        -- THE CHOICE LIST, exactly as `custom.field_declare` and `custom.table_declare`
        -- build it: the words a person typed are kept the only way FLD-5/FLD-6 allows, as
        -- the records of a Table, and the column is pointed at it. Without this the five
        -- tables carrying a select column — the crews' own podcast, lab and museum — were
        -- refused whole by `custom._field_shape_guard` ("the list field status has to say
        -- which table its choices come from"). Matched on the ABSENCE of an options table
        -- plus the presence of choices rather than on the type word, because `list`,
        -- `select` and `multi_select` all arrive here spelled differently.
        if nullif(v_doc -> 'config' ->> 'options_table_id', '') is null
           and jsonb_typeof(e -> 'options') = 'array'
           and jsonb_array_length(e -> 'options') > 0 then
          v_doc := jsonb_set(
            v_doc, '{config,options_table_id}',
            to_jsonb(custom._options_table_for(r.organization_id, v_doc ->> 'label', e -> 'options')::text));
        end if;

        v_doc := v_doc || jsonb_build_object('declared_with_table', true,
                                             'recovered_from_table_spec', true);
        insert into custom.record (organization_id, table_id, data_class, data)
        values (r.organization_id, custom.field_kernel_id(), 'field', v_doc);
        v_fields := v_fields + 1;
      end loop;
      v_tables := v_tables + 1;
    exception when others then
      -- ONE BAD ENTRY SKIPS ITS WHOLE TABLE, BY NAME. A table left half recovered — some
      -- columns real, the rest still only named — is the state this repair exists to end.
      get stacked diagnostics v_msg = message_text;
      v_skipped := v_skipped + 1;
      raise notice 'SKIPPED "%" (%) — %', r.name, r.id, v_msg;
    end;
  end loop;

  select count(*) into v_after from custom.record t
   where t.table_id = custom.table_kernel_id() and t.data_class = 'table' and t.deleted_at is null
     and jsonb_array_length(coalesce(t.data -> 'fields','[]'::jsonb)) > 0
     and not exists (select 1 from custom.record f
                      where f.organization_id = t.organization_id
                        and f.table_id = custom.field_kernel_id() and f.deleted_at is null
                        and (f.data ->> 'entity_definition_id')::uuid = t.id);

  raise notice 'RECOVERED — % tables, % columns. Skipped %.', v_tables, v_fields, v_skipped;
  raise notice 'AFTER — tables whose declared columns have no Field record: %', v_after;
  if v_skipped = 0 and v_after <> 0 then
    raise exception 'nothing was skipped and % tables are still split — the census and the repair disagree', v_after;
  end if;
end $b$;

\if :commit_it
commit;
\echo '>>> COMMITTED'
\else
rollback;
\echo '>>> rehearsed only, rolled back'
\endif

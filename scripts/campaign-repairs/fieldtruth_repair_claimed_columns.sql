-- scripts/campaign-repairs/fieldtruth_repair_claimed_columns.sql — LANE FIELD-TRUTH.
--
-- THE SAME RULE, READ FROM THE OTHER SIDE. `custom.record_write` used to accept a value for
-- a key no Field declares (repaired by fieldtruth_repair_undeclared_keys.sql); a Table's own
-- `fields` array could equally claim a column with no Field record behind it — real-data
-- crew E, 2026-09-21, on Cascade Electronics Recovery: `pickups` declared `client_site` and
-- `Certificates Of Destruction` declared `pickup`, and "nothing catches or reports the
-- mismatch". A claimed column with no definition has no type, no rules and no validation; it
-- is a name on a screen that can never hold anything.
--
-- MEASURED on the main database 2026-09-21: 2,521 claimed column names across every Table in
-- the store, 53 of them across 48 Tables with no Field record.
--
-- WHAT IT DOES. Each claimed name becomes a real Field record of type `text`, built by
-- `custom._field_document_for` — the same builder both doors use — and marked
-- `recovered_from_table_spec` and `declared_with_table`, so `custom.field_declare` will FILL
-- IT IN (type, rules, choices, label) the moment somebody defines it properly rather than
-- refusing it as a duplicate. It invents no NAME: every one is a name its own Table already
-- declared. `text` is the honest type — these columns hold nothing, so there is nothing to
-- infer a type from, and text is the one behaviour that accepts whatever arrives first.
--
-- It is idempotent: a name that already has a Field record is not touched.
--
-- Run:  <scratchpad>/prod.sh -f scripts/campaign-repairs/fieldtruth_repair_claimed_columns.sql
--       <scratchpad>/prod.sh -v commit_it=true -f scripts/campaign-repairs/fieldtruth_repair_claimed_columns.sql

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
  r         record;
  v_doc     jsonb;
  v_sort    integer;
  v_done    integer := 0;
  v_skipped integer := 0;
  v_before  integer;
  v_after   integer;
  v_msg     text;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'this repair runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
  perform set_config('app.actor_system', 'campaign/fieldtruth_repair_claimed_columns', true);

  create temporary table _ft_claimed on commit drop as
  select t.organization_id, t.id as table_id, t.data ->> 'name' as tname, e ->> 'name' as key
    from custom.record t
    cross join lateral jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) e
   where t.data_class = 'table' and t.deleted_at is null
     and nullif(e ->> 'name', '') is not null
     and not exists (select 1 from custom.record f
                      where f.organization_id = t.organization_id
                        and f.table_id = custom.field_kernel_id()
                        and f.data_class = 'field' and f.deleted_at is null
                        and f.data ->> 'entity_definition_id' = t.id::text
                        and f.data ->> 'key' = e ->> 'name');

  select count(*) into v_before from _ft_claimed;
  raise notice 'BEFORE — column names a Table claims with no Field record: % (over % tables)',
    v_before, (select count(distinct table_id) from _ft_claimed);

  for r in select * from _ft_claimed order by tname, key loop
    begin
      select coalesce(max((f.data ->> 'sort')::integer), 0) + 100 into v_sort
        from custom.record f
       where f.organization_id = r.organization_id
         and f.table_id = custom.field_kernel_id()
         and f.data_class = 'field' and f.deleted_at is null
         and f.data ->> 'entity_definition_id' = r.table_id::text;

      v_doc := custom._field_document_for(r.organization_id, r.table_id,
                 jsonb_build_object('key', r.key,
                                    'label', initcap(replace(r.key, '_', ' ')),
                                    'type', 'text',
                                    'sort', v_sort));
      v_doc := v_doc || jsonb_build_object('declared_with_table', true,
                                           'recovered_from_table_spec', true);
      insert into custom.record (organization_id, table_id, data_class, data)
      values (r.organization_id, custom.field_kernel_id(), 'field', v_doc);
      v_done := v_done + 1;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_skipped := v_skipped + 1;
      raise notice 'LEFT ALONE — "%" on "%" — %', r.key, r.tname, v_msg;
    end;
  end loop;

  select count(*) into v_after
    from custom.record t
    cross join lateral jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) e
   where t.data_class = 'table' and t.deleted_at is null
     and nullif(e ->> 'name', '') is not null
     and not exists (select 1 from custom.record f
                      where f.organization_id = t.organization_id
                        and f.table_id = custom.field_kernel_id()
                        and f.data_class = 'field' and f.deleted_at is null
                        and f.data ->> 'entity_definition_id' = t.id::text
                        and f.data ->> 'key' = e ->> 'name');

  raise notice 'DEFINED — % columns. Left alone: %.', v_done, v_skipped;
  raise notice 'AFTER — column names a Table claims with no Field record: %', v_after;
  if v_skipped = 0 and v_after <> 0 then
    raise exception 'nothing was left alone and % claims remain — the census and the repair disagree', v_after;
  end if;
end $b$;

\if :commit_it
commit;
\echo '>>> COMMITTED'
\else
rollback;
\echo '>>> rehearsed only, rolled back'
\endif

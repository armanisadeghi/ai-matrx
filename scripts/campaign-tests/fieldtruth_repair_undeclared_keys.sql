-- scripts/campaign-tests/fieldtruth_repair_undeclared_keys.sql — LANE FIELD-TRUTH.
--
-- THE ORPHANS THAT ARE ALREADY LIVE. Before this lane's door existed, `custom.record_write`
-- took a value for any key at all and kept it: stored, readable through the doors, and
-- invisible in every grid and every agent tool's schema, because both read the Table's Field
-- rows. Measured on the main database 2026-09-21: 223 such values over 209 records, 60
-- Tables and 8 organizations — crew A's `room` on every Birchwood Avenue Renovation
-- purchase, Ridgeline Physical Therapy's `patient` / `full_name` / `treatment_plan`, The
-- Alvarado-Chen Kitchen's `recipe` / `shopping_list` / `list_name`, and 13 more keys.
--
-- THE KNOB, `-v mode=`:
--   · `declare` (THE DEFAULT) — the orphan key becomes a real Field of its Table, typed from
--     what the live values actually are (string → text, number → range, boolean → boolean).
--     The data becomes VISIBLE. Nothing moves and nothing is lost: the values stay exactly
--     where they are and a column appears above them.
--   · `quarantine` — the value moves into the record's `_undeclared` envelope, which the
--     grid surfaces as "we found keys nobody declared" with the declare-it action. Nothing
--     is lost here either, but the value leaves its key, so this is for a Table where a
--     column would be wrong. LIMITS-FIX-UI owns that prompt; no live Table needs it today
--     (every live orphan value is scalar), and it exists so that the day one does, the
--     answer is a knob and not a rebuild.
--
-- IT IS IDEMPOTENT, and that is load-bearing: lane STAGE-RULES-2 is declaring `room` on
-- Birchwood by hand at the same time. A key that already has a Field row is not touched, not
-- counted and not refused — it is simply no longer an orphan.
--
-- WHAT IT NEVER DOES: it invents no key, it deletes no value, it touches no record of a
-- kernel Table (whose shape is platform code) and no Table that declared `columns:
-- "free_form"`. A key it cannot type — an array or an object, of which live data has none —
-- is NAMED and left alone rather than guessed at.
--
-- Run:  <scratchpad>/prod.sh -f scripts/campaign-tests/fieldtruth_repair_undeclared_keys.sql
--       <scratchpad>/prod.sh -v commit_it=true -f scripts/campaign-tests/fieldtruth_repair_undeclared_keys.sql
--       ... -v mode=quarantine   to take the other branch
-- It runs as the store's owner: this is a repair of the store's own rows, not a client door.

\set ON_ERROR_STOP on
\if :{?commit_it}
\else
  \set commit_it false
\endif
\if :{?mode}
\else
  \set mode declare
\endif

begin;
-- psql does not interpolate a variable inside a dollar-quoted body, so the knob is handed
-- to the block the way the block can actually read it.
select set_config('ft.mode', :'mode', true);
set local lock_timeout = '120s';
set local statement_timeout = '600s';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- STEP 1 — the checklist's step Table says what it has always been: a document Table.
-- Its own door's comment names `position`, `run_id`, `ref`, `role`, `depends_on_ids`,
-- `requires` and `evidence` as "the checklist's own machinery"; the word makes that true in
-- the store instead of true only in a comment.
-- ─────────────────────────────────────────────────────────────────────────────────────────
do $b$
declare v_n integer;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'this repair runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
  perform set_config('app.actor_system', 'campaign/fieldtruth_repair_undeclared_keys', true);

  update custom.record t
     set data = t.data || jsonb_build_object('columns', 'free_form'),
         updated_at = now(), version = t.version + 1
   where t.table_id = custom.table_kernel_id()
     and t.data_class = 'table'
     and t.deleted_at is null
     and t.data ->> 'slug' = 'checklist_step'
     and coalesce(t.data ->> 'columns', '') <> 'free_form';
  get diagnostics v_n = row_count;
  raise notice 'STEP 1 — checklist step Tables declared free-form: %', v_n;
end $b$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- STEP 2 — the orphans.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create temporary table _ft_orphan on commit drop as
select r.organization_id,
       r.table_id,
       k.key,
       count(*)                                          as values_held,
       array_agg(distinct jsonb_typeof(r.data -> k.key))  as json_types
  from custom.record r
  cross join lateral jsonb_object_keys(r.data) k(key)
 where r.data_class = 'record'
   and r.table_id is not null
   and r.deleted_at is null
   and jsonb_typeof(r.data) = 'object'
   and jsonb_typeof(r.data -> k.key) <> 'null'
   and left(k.key, 1) <> '_'
   and not (k.key = any (custom.record_platform_keys()))
   and custom.table_column_source(r.organization_id, r.table_id) = 'fields'
   and not exists (select 1 from custom.record f
                    where f.organization_id = r.organization_id
                      and f.table_id = custom.field_kernel_id()
                      and f.data_class = 'field'
                      and f.deleted_at is null
                      and f.data ->> 'entity_definition_id' = r.table_id::text
                      and f.data ->> 'key' = k.key)
 group by 1, 2, 3;

do $b$
declare
  r           record;
  v_type      text;
  v_doc       jsonb;
  v_sort      integer;
  v_declared  integer := 0;
  v_moved     integer := 0;
  v_skipped   integer := 0;
  v_tables    integer := 0;
  v_before    integer;
  v_after     integer;
  v_msg       text;
  v_mode      text := current_setting('ft.mode', true);
  v_seen      uuid[] := array[]::uuid[];
begin
  if v_mode not in ('declare', 'quarantine') then
    raise exception 'mode is declare or quarantine, and this says %', v_mode;
  end if;
  perform set_config('app.actor_system', 'campaign/fieldtruth_repair_undeclared_keys', true);

  select coalesce(sum(values_held), 0) into v_before from _ft_orphan;
  raise notice 'BEFORE — undeclared values on table-class records: % (over % table/key pairs)',
    v_before, (select count(*) from _ft_orphan);

  for r in select o.*, t.data ->> 'name' as table_name from _ft_orphan o
            join custom.record t on t.id = o.table_id and t.organization_id = o.organization_id
            order by t.data ->> 'name', o.key
  loop
    begin
      -- THE TYPE COMES OUT OF THE VALUES THEMSELVES, never out of a guess. A key whose live
      -- values disagree about what they are, or which is an array or an object, has no
      -- honest column and is NAMED instead.
      if array_length(r.json_types, 1) <> 1 then
        raise exception 'its live values are % — a column cannot be two things', array_to_string(r.json_types, ' and ');
      end if;
      v_type := case r.json_types[1]
                  when 'string'  then 'text'
                  when 'number'  then 'range'
                  when 'boolean' then 'boolean'
                  else null end;
      if v_type is null then
        raise exception 'its live values are %s, and a % is a document rather than a value of a column',
                        r.json_types[1], r.json_types[1];
      end if;

      if v_mode = 'declare' then
        select coalesce(max((f.data ->> 'sort')::integer), 0) + 100 into v_sort
          from custom.record f
         where f.organization_id = r.organization_id
           and f.table_id = custom.field_kernel_id()
           and f.data_class = 'field'
           and f.deleted_at is null
           and f.data ->> 'entity_definition_id' = r.table_id::text;

        -- The SAME builder both doors use (custom.field_declare and custom.table_declare),
        -- so a recovered column is the same kind of thing as a declared one and is judged by
        -- the same guards.
        v_doc := custom._field_document_for(r.organization_id, r.table_id,
                   jsonb_build_object('key', r.key,
                                      'label', initcap(replace(r.key, '_', ' ')),
                                      'type', v_type,
                                      'sort', v_sort));
        -- Two marks, so nothing about this column is invisible: it was read back out of the
        -- records themselves rather than defined by a person, and custom.field_declare will
        -- FILL IT IN properly the moment somebody does define it, instead of refusing it.
        v_doc := v_doc || jsonb_build_object('found_in_records', true,
                                             'declared_with_table', true);
        -- ONE SOURCE OF TRUTH, BOTH WAYS — exactly what custom.field_declare does: the Table
        -- is told it has this column, or the grid orders a column the Table never names. IT IS TOLD
        -- FIRST: custom._field_class_guard refuses a Field row for a column its Table does not
        -- declare — "the table does not declare a field called room - declare it there first" —
        -- which is the same one-source-of-truth rule, read from the other side.
        update custom.record t
           set data = jsonb_set(t.data, '{fields}',
                                coalesce(t.data -> 'fields', '[]'::jsonb)
                                || jsonb_build_array(jsonb_build_object('name', r.key))),
               updated_at = now(), version = t.version + 1
         where t.organization_id = r.organization_id
           and t.id = r.table_id
           and t.table_id = custom.table_kernel_id()
           and not exists (select 1 from jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) e
                            where e ->> 'name' = r.key);

        insert into custom.record (organization_id, table_id, data_class, data)
        values (r.organization_id, custom.field_kernel_id(), 'field', v_doc);
        v_declared := v_declared + 1;
      else
        -- QUARANTINE. The value moves, WITH ITS KEY, into `_undeclared` — a platform
        -- envelope the grid surfaces as a prompt. It is not deleted and it is not coerced.
        update custom.record rec
           set data = jsonb_set(rec.data - r.key, '{_undeclared}',
                                coalesce(rec.data -> '_undeclared', '{}'::jsonb)
                                || jsonb_build_object(r.key, jsonb_build_object(
                                     'value', rec.data -> r.key,
                                     'found_at', to_jsonb(now()),
                                     'reason', format('%s has no field called "%s", so this value had nowhere to be shown.',
                                                      coalesce(r.table_name, 'this table'), r.key)))),
               updated_at = now(), version = rec.version + 1
         where rec.organization_id = r.organization_id
           and rec.table_id = r.table_id
           and rec.data_class = 'record'
           and rec.deleted_at is null
           and rec.data ? r.key;
        v_moved := v_moved + 1;
      end if;

      if not (r.table_id = any (v_seen)) then
        v_seen := array_append(v_seen, r.table_id);
        v_tables := v_tables + 1;
      end if;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_skipped := v_skipped + 1;
      raise notice 'LEFT ALONE — "%" on "%" (% values) — %', r.key, r.table_name, r.values_held, v_msg;
    end;
  end loop;

  select coalesce(sum(x.n), 0) into v_after
    from (select count(*) as n
            from custom.record rec
            cross join lateral jsonb_object_keys(rec.data) k(key)
           where rec.data_class = 'record' and rec.table_id is not null and rec.deleted_at is null
             and jsonb_typeof(rec.data) = 'object'
             and jsonb_typeof(rec.data -> k.key) <> 'null'
             and left(k.key, 1) <> '_'
             and not (k.key = any (custom.record_platform_keys()))
             and custom.table_column_source(rec.organization_id, rec.table_id) = 'fields'
             and not exists (select 1 from custom.record f
                              where f.organization_id = rec.organization_id
                                and f.table_id = custom.field_kernel_id()
                                and f.data_class = 'field' and f.deleted_at is null
                                and f.data ->> 'entity_definition_id' = rec.table_id::text
                                and f.data ->> 'key' = k.key)) x;

  raise notice 'MODE % — % columns declared, % keys quarantined, over % tables. Left alone: %.',
    v_mode, v_declared, v_moved, v_tables, v_skipped;
  raise notice 'AFTER — undeclared values on table-class records: %', v_after;
  if v_skipped = 0 and v_after <> 0 then
    raise exception 'nothing was left alone and % undeclared values remain — the census and the repair disagree', v_after;
  end if;
end $b$;

\if :commit_it
commit;
\echo '>>> COMMITTED'
\else
rollback;
\echo '>>> rehearsed only, rolled back'
\endif

-- chair-step: a STORE FIX (STORE-LEAK-FORMULA found it while testing, item 2). It ADDS three
--   functions (`custom.field_cycle`, `custom.record_value_one`, `custom.far_value`) and REPLACES
--   three bodies, each declared below with the body it was written against: `custom.lookup_value`
--   and `custom.rollup_value` (the far side of a lookup and a rollup) and
--   `custom._field_reads_what_it_reads` (STORE-LEAK-FORMULA's BEFORE trigger function that every
--   write of a worked-out Field already passes through — so no trigger is created or dropped, and
--   nothing takes a table lock). No table, column, policy or grant is added; no row of anybody's
--   data is rewritten.
--   Inverse: `migrations/inverse/storetails3_a_worked_out_column_never_reads_itself_down.sql`.
--   Applied directly (owner, 2026-09-24 ~17:30 PT: "all db stuff applied directly"), proven on
--   the dev clone first (suite RED on the old bodies, GREEN on these; up, inverse, up).
-- lock: custom
-- lane: STORE-TAILS-3
-- based-on: custom.lookup_value(uuid, uuid, jsonb) f785b30ed0d43569cac355c570741b5a20b023ca92508c3984132d35044cf8a5
-- based-on: custom.rollup_value(uuid, uuid, jsonb) ee1f8fe3750edfdecece1602f56afbd910d1b1aaef528e43b4e14cacea43247a
-- based-on: custom._field_reads_what_it_reads() 2f4c1897361cb2a3392a9e9d12d97ef854a449ce890f15733faeca08f09ba286
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- A WORKED-OUT COLUMN NEVER READS ITSELF
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- THE DEFECT (dev clone, 2026-09-24, the Birchwood rooms). Rooms rolls up the sum of its quotes
-- (Quoted so far, through Quotes for this room); Quotes looks up its room's name (Room (name),
-- through Room). Neither column reads the other — yet every read of a room overflowed the
-- stack: `custom.lookup_value` / `custom.rollup_value` read the far record WHOLE
-- (`custom.record_values`), which worked out EVERY column of the far record, including the one
-- that reads back, which read the first record whole again … Kitchen's read ran until
-- "stack depth limit exceeded" and then until the statement timeout, and `custom.derived_value`
-- turned each overflow into an empty cell and a warning. A true cycle (a rollup of a lookup
-- that looks the rollup up) had no guard at all, at declare time or at read time.
--
-- THE RULE. Three halves:
--
--   1. THE FAR SIDE READS ONLY THE COLUMN IT NEEDS. A lookup picks one column of the far
--      record and a rollup adds up one; `custom.far_value` works out exactly that column
--      (`custom.record_value_one`: the same answer `custom.record_values(…) -> key` gives, with
--      the same precedence — worked out on read > stamped at write > the Rule layer's block >
--      the document — and nothing else of that record). So two tables that merely point at each
--      other answer in two steps, the way Airtable's lookups do.
--   2. A DECLARATION THAT WOULD CLOSE A CYCLE IS REFUSED, BY NAME. On every write of a worked-out
--      Field (declare, edit, import, copy, restore) the trigger every such write already passes
--      (`custom_record_field_reads_what_it_reads`) walks what the new definition reads — formula
--      leaves, a lookup's or rollup's relation and far column, across tables, through other
--      worked-out columns (`custom.field_inputs_of`, the STORE-LEAK-FORMULA walk) — and refuses
--      the write when the walk comes back to the column, naming every column round the circle.
--      (Retargeting a RELATION a lookup reads through is not re-asked here; a circle made that
--      way is still caught on read by half 3.)
--   3. A CYCLE ALREADY STORED IS REFUSED ON READ WITH A SENTENCE. `custom.far_value` keeps the
--      (record, column) pairs it is in the middle of working out; asked for one of them again
--      it raises "… is worked out from itself …" (42P17) instead of recursing, and so does a
--      chain deeper than 24 far reads. `custom.derived_value` turns that into the column's empty
--      cell and a warning that carries the sentence — never a stack overflow, never a timeout.
--
-- LOCKS. `create function` / `create or replace function` take nothing on `custom.record`; no
-- trigger is created or dropped. No data work.

set local lock_timeout = '30s';
set local statement_timeout = '120s';

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- HALF 2's QUESTION — DOES THIS COLUMN, FOLLOWED THROUGH EVERYTHING IT READS, READ ITSELF?
-- ═════════════════════════════════════════════════════════════════════════════════════════

create function custom.field_cycle(p_organization_id uuid, p_field_data jsonb, p_self uuid)
returns text[]
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  -- The shortest circle from this definition back to the column `p_self`, as the names a person
  -- knows ("Rooms › Working budget", "Quotes › Room's working budget", …), or NULL when there is
  -- none. It starts from the definition GIVEN (the one being written, before it is stored) and
  -- walks the stored columns it reads; live inputs only (a retired column is never worked out);
  -- 24 steps, and no column is walked twice.
  with recursive
  me as (
    select coalesce(nullif(t.data ->> 'name', ''), 'a table') || ' › ' ||
           coalesce(nullif(p_field_data ->> 'label', ''), p_field_data ->> 'key') as name
      from (select 1) one
      left join custom.record t
        on t.organization_id = p_organization_id
       and t.id::text = p_field_data ->> 'entity_definition_id'),
  walk(id, path, names) as (
    select i.input_id, array[i.input_id],
           array[me.name, coalesce(nullif(t.data ->> 'name', ''), 'a table') || ' › ' || i.input_label]
      from me
      cross join lateral custom.field_inputs_of(p_organization_id, p_field_data) i
      left join custom.record t on t.organization_id = p_organization_id and t.id = i.input_table
     where not i.retired
    union all
    select j.input_id, w.path || j.input_id,
           w.names || (coalesce(nullif(t.data ->> 'name', ''), 'a table') || ' › ' || j.input_label)
      from walk w
      join custom.record f
        on f.organization_id = p_organization_id
       and f.id = w.id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
      cross join lateral custom.field_inputs_of(p_organization_id, f.data) j
      left join custom.record t on t.organization_id = p_organization_id and t.id = j.input_table
     where w.id <> p_self
       and cardinality(w.path) < 24
       and not j.retired
       and not (j.input_id = any (w.path)))
  select w.names from walk w
   where w.id = p_self
   order by cardinality(w.path)
   limit 1;
$$;
comment on function custom.field_cycle(uuid, jsonb, uuid) is
  'STORE-TAILS-3: the shortest circle of worked-out columns (formula leaves, lookup/rollup relation and far column, across tables) that leads from this definition back to the column p_self, as the names a person knows; NULL when there is none.';

CREATE OR REPLACE FUNCTION custom._field_reads_what_it_reads()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_deps  jsonb;
  v_floor record;
  v_path  text[];                      -- STORE-TAILS-3: a circle this definition would close
begin
  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;
  if coalesce(new.data ->> 'type', '') <> 'formula'
     or not (coalesce(new.data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']) then
    return new;
  end if;
  -- A retirement is not a change of shape (the shared rule): the document stays byte-for-byte
  -- what it was, so every guard after this one still sees a retirement.
  if tg_op = 'UPDATE'
     and custom.is_a_retirement(old.deleted_at, new.deleted_at, old.data, new.data,
                                old.table_id, new.table_id, old.organization_id,
                                new.organization_id, old.data_class, new.data_class) then
    return new;
  end if;

  -- STORE-TAILS-3: A COLUMN THAT WOULD READ ITSELF IS NOT SAVED. The walk starts from the
  -- definition being written (not the stored one) and comes back to this column's id through
  -- whatever reads it — by id, or by key for a lookup's far column and the older formula shape.
  if new.deleted_at is null then
    v_path := custom.field_cycle(new.organization_id, new.data, new.id);
    if v_path is not null then
      raise exception 'The column "%" would be worked out from itself: % — so it was not saved.',
        coalesce(nullif(new.data ->> 'label', ''), new.data ->> 'key'),
        array_to_string(v_path, ' reads ')
        using errcode = '42P17',
              hint = 'STORE-TAILS-3: a formula, lookup or rollup that reads itself round a circle has no answer. Point one of the columns in that circle at something outside it, and save again.';
    end if;
  end if;

  -- depends_on: the columns of THIS table it reads, by key (the list custom.field_dependants
  -- and REC-18's "this field is used by …" read). Worked out from the definition, never typed.
  select coalesce(jsonb_agg(distinct i.input_key order by i.input_key), '[]'::jsonb)
    into v_deps
    from custom.field_inputs_of(new.organization_id, new.data) i
   where i.input_table::text = new.data ->> 'entity_definition_id'
     and not i.retired;
  if new.data -> 'depends_on' is distinct from v_deps then
    new.data := jsonb_set(new.data, '{depends_on}', v_deps);
  end if;

  select * into v_floor
    from custom.field_sensitivity_floor(new.organization_id, new.data, new.id);
  if v_floor.sensitivity is not null
     and custom.sensitivity_rank(new.data ->> 'sensitivity') < custom.sensitivity_rank(v_floor.sensitivity) then
    raise notice 'the column "%" reads %, which is %, so it is % too (it was %)',
      coalesce(nullif(new.data ->> 'label', ''), new.data ->> 'key'),
      (select string_agg(format('"%s"', e ->> 'label'), ', ') from jsonb_array_elements(v_floor.reads) e),
      v_floor.sensitivity, v_floor.sensitivity, coalesce(new.data ->> 'sensitivity', 'nothing');
    new.data := jsonb_set(new.data, '{sensitivity}', to_jsonb(v_floor.sensitivity));
  end if;
  return new;
end;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- HALF 1 — THE FAR SIDE READS ONLY THE COLUMN IT NEEDS
-- ═════════════════════════════════════════════════════════════════════════════════════════

create function custom.record_value_one(p_organization_id uuid, p_record_id uuid, p_key text)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
declare
  v_rec   custom.record;
  v_plain jsonb;
  v_tf    text;
  v_rtype text;
  f       custom.record;
begin
  -- EXACTLY `custom.record_values(org, record) -> key`, working out only that one column.
  -- The values a read-time formula is evaluated against are assembled the same way
  -- `custom.derived_values_of` assembles them (the document, the Rule layer's block, what was
  -- stamped at write time), so the one answer is the answer the whole-record read gives.
  select * into v_rec from custom.record
   where organization_id = p_organization_id and id = p_record_id;
  if v_rec.id is null or p_key is null then
    return null;
  end if;
  v_plain := (v_rec.data - '_computed' - '_retired' - '_values' - '_sources' - '_derived')
             || custom.computed_block(v_rec.data -> '_computed');
  if v_rec.table_id is null or v_rec.data_class in ('kernel', 'relation') then
    return v_plain -> p_key;
  end if;
  v_plain := v_plain || custom.computed_block(v_rec.data -> '_derived');

  v_tf := custom.table_type_field(v_rec.organization_id, v_rec.table_id);
  if v_tf is not null then
    v_rtype := v_rec.data ->> v_tf;
  end if;
  select * into f
    from custom.applicable_fields(v_rec.organization_id, v_rec.table_id, v_rtype) a
   where a.data ->> 'key' = p_key
     and custom.parity_type(a.data) in ('lookup', 'rollup', 'formula')
     and coalesce(a.data ->> 'compute_on', '') = 'read'
   limit 1;
  if f.id is not null then
    return custom.derived_value(v_rec.organization_id, v_rec.id, f.data, v_plain);
  end if;
  return v_plain -> p_key;
end;
$$;
comment on function custom.record_value_one(uuid, uuid, text) is
  'STORE-TAILS-3: custom.record_values(org, record) -> key, working out only that one column (the far side of a lookup or rollup).';

create function custom.far_value(p_organization_id uuid, p_record_id uuid, p_key text, p_reader jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
declare
  v_stack text := coalesce(current_setting('custom.derived_stack', true), '');
  v_mark  text := '|' || p_record_id::text || ':' || coalesce(p_key, '') || '|';
  v_out   jsonb;
begin
  -- HALF 3. The (record, column) pairs this read is in the middle of working out. Asked for one
  -- of them again, the answer would need itself: refuse with the sentence, never recurse.
  if position(v_mark in v_stack) > 0 then
    raise exception 'The column "%" is worked out from itself round a circle (it reads "%" on another record, which leads back to it), so it has no answer and is left empty.',
      coalesce(nullif(p_reader ->> 'label', ''), p_reader ->> 'key', 'this column'),
      coalesce((select nullif(f.data ->> 'label', '')
                  from custom.record r
                  join custom.record f
                    on f.organization_id = r.organization_id
                   and f.table_id = custom.field_kernel_id()
                   and f.deleted_at is null
                   and f.data ->> 'entity_definition_id' = r.table_id::text
                   and f.data ->> 'key' = p_key
                 where r.organization_id = p_organization_id and r.id = p_record_id
                 limit 1), p_key)
      using errcode = '42P17',
            hint = 'STORE-TAILS-3: point one of the lookups or rollups in that circle at a column outside it. New circles are refused when they are declared; this one was stored before that rule.';
  end if;
  if (length(v_stack) - length(replace(v_stack, '||', ''))) / 2 >= 24 then
    raise exception 'The column "%" reads through more than 24 lookups and rollups in a row, which is a loop rather than a chain, so it is left empty.',
      coalesce(nullif(p_reader ->> 'label', ''), p_reader ->> 'key', 'this column')
      using errcode = '42P17',
            hint = 'STORE-TAILS-3: shorten the chain of lookups and rollups this column reads through.';
  end if;
  perform set_config('custom.derived_stack', v_stack || v_mark, true);
  v_out := custom.record_value_one(p_organization_id, p_record_id, p_key);
  perform set_config('custom.derived_stack', v_stack, true);
  return v_out;
end;
$$;
comment on function custom.far_value(uuid, uuid, text, jsonb) is
  'STORE-TAILS-3: one column of a far record for a lookup or rollup, refusing by name (42P17) a read that would need itself (a stored cycle) or that chains past 24 far reads.';

CREATE OR REPLACE FUNCTION custom.lookup_value(p_organization_id uuid, p_record_id uuid, p_field_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_via   text := p_field_data -> 'config' ->> 'via';
  v_pick  text := p_field_data -> 'config' ->> 'pick';
  v_multi boolean := coalesce((p_field_data ->> 'multi')::boolean, false);
  v_out   jsonb := '[]'::jsonb;
  v_one   jsonb;
  v_t     uuid;
begin
  for v_t in select * from custom.relation_targets(p_organization_id, p_record_id, v_via) loop
    if v_t = p_record_id then
      continue;                     -- a record cannot look itself up through itself.
    end if;
    -- THE FAR SIDE, ONE COLUMN OF IT (STORE-TAILS-3). A lookup OF a computed Value, or of
    -- another lookup, still answers through the same precedence the whole-record reader uses —
    -- but only the picked column is worked out, so two tables that point at each other no
    -- longer work each other out whole, round and round, until the stack runs out.
    v_one := custom.far_value(p_organization_id, v_t, v_pick, p_field_data);
    if v_one is not null then
      v_out := v_out || jsonb_build_array(v_one);
    end if;
  end loop;
  if v_multi then
    return v_out;
  end if;
  return case when jsonb_array_length(v_out) = 0 then null else v_out -> 0 end;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.rollup_value(p_organization_id uuid, p_record_id uuid, p_field_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_via  text := p_field_data -> 'config' ->> 'via';
  v_of   text := p_field_data -> 'config' ->> 'of';
  v_agg  text := p_field_data -> 'config' ->> 'agg';
  v_nums numeric[] := array[]::numeric[];
  v_n    integer := 0;
  v_one  jsonb;
  v_t    uuid;
begin
  for v_t in select * from custom.relation_targets(p_organization_id, p_record_id, v_via) loop
    if v_t = p_record_id then
      continue;                     -- a record is never one of the things it adds up.
    end if;
    v_n := v_n + 1;                                    -- count counts RECORDS, once each.
    if v_of is not null then
      -- STORE-TAILS-3: the one column it adds up, never the far record whole.
      v_one := custom.far_value(p_organization_id, v_t, v_of, p_field_data);
      if v_one is not null and jsonb_typeof(v_one) = 'number' then
        v_nums := v_nums || (v_one #>> '{}')::numeric;
      end if;
    end if;
  end loop;

  if v_agg = 'count' then
    return to_jsonb(v_n);
  end if;
  if array_length(v_nums, 1) is null then
    return null;                    -- nothing to work out is an absence, never a zero.
  end if;
  return case v_agg
    when 'sum' then to_jsonb((select sum(x) from unnest(v_nums) x))
    when 'min' then to_jsonb((select min(x) from unnest(v_nums) x))
    when 'max' then to_jsonb((select max(x) from unnest(v_nums) x))
    when 'avg' then to_jsonb((select avg(x) from unnest(v_nums) x))
  end;
end;
$function$;

revoke all on function custom.field_cycle(uuid, jsonb, uuid) from public;
revoke all on function custom.record_value_one(uuid, uuid, text) from public;
revoke all on function custom.far_value(uuid, uuid, text, jsonb) from public;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(p.proargtypes::text, ' ')::oid[],
       'STORE-TAILS-3: what circle of worked-out columns leads a column back to itself; asked only by the Field-row trigger.',
       'STORE-TAILS-3',
       'server_only: it names Field ids and labels of any table in the organization without asking who is asking; its one caller is custom._field_reads_what_it_reads, inside the write door that already decided.',
       false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.oid = 'custom.field_cycle(uuid, jsonb, uuid)'::regprocedure;

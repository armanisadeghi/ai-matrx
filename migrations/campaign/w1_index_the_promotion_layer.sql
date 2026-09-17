-- target: branch,production
-- additive: yes
-- guard: custom/field_index_guard
--
-- W1-INDEX — THE INDEX AND PROMOTION LAYER (check C-5).
--            REC-4 · REC-5 · REC-N-1 · REC-N-2 · REC-N-3 · REC-N-5 · REC-N-12 · DOOR-N-3.
--
-- Every object here is NEW. This file replaces no live body, so it carries no `-- based-on:`
-- header; the one live body this lane replaces is `platform.custom_field_index_expr`, and it
-- is in the OTHER file (`w1_index_the_expression_reads_the_path.sql`), under `LOCK:platform`.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- THE RULINGS THIS FILE EXECUTES (build log 2026-09-17, rules 23 and 28)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- (a) REC-N-2 — EAGER, CAPPED, PREPARED; AND THE GUARD IS ON THE GENERATOR.
--     Promotion happens when a Field is DECLARED promoted, never on a first sort: a query
--     that is slow once has already been slow, and a store that promotes on demand has a
--     cliff nobody can plan for. The cap is eight promoted Fields per Table (REC-N-5), and
--     it is a REFUSAL at the write door, not a lint. Every promoted-field read is issued as
--     a prepared statement (DOOR-N-3), because at a few thousand partial indexes PLANNING
--     costs more than the read (REC-N-2's measured 16.2 ms vs 0.004 ms).
--     `platform.custom_field_index_expr` is `IMMUTABLE PARALLEL SAFE` and MUST stay so — an
--     index expression may contain nothing else — so a knob read inside it would be both
--     wrong and unusable. The guard therefore sits on the index-DDL GENERATOR that calls it:
--     `custom.promoted_index_ddl()` reads `custom/field_index_guard` and, while it is off,
--     emits NO DDL and says so out loud with the knob's name and the remedy.
--     *Cost if wrong:* a lane that wanted the guard inside the function gets a function that
--     cannot be used in an index at all — an hour to move the read back out to the caller.
--
-- (b) REC-N-3's PATH IS READ FROM THE STORE, AND THE ENVELOPE IT NAMES IS ONE THE STORE
--     REFUSES. Re-measured on the branch 2026-09-17 21:0x UTC, seat 2, and this is the one
--     ruling in the file that stands against a contract row's punctuation, so it is proven
--     rather than argued:
--        select custom.value_envelope_keys();
--          -> {ver,src,actor,on_behalf_of,at,absent,alternates}
--     That set is CLOSED. `custom.value_envelope_refusal(jsonb)` walks every key of every
--     envelope and refuses anything outside it BY NAME ('<key> carries "v", which is not part
--     of a value envelope'), and `custom._value_envelope` runs that refusal on every write to
--     `custom.record`. So `data -> '_values' -> 'key' ->> 'v'` — REC-N-3's literal path — is
--     not merely a path nobody filled in: it is a shape this store will not accept, and an
--     index built over it could never have a row under it. The RED/GREEN file proves that by
--     taking the refusal.
--     Where the values actually are, read from the landed bodies rather than assumed:
--       custom.record_values() = (data - '_computed' - '_retired' - '_values' - '_sources'
--                                      - '_derived')
--                                || _computed's `-> 'value'` || custom.derived_values()
--     — and `custom.value_envelope_refusal`'s own "both holds a value and says why it is
--     missing" arm tests `p_data ? v_key`. The envelope carries the value's PROVENANCE; the
--     VALUE stays at the key. So the store keeps THREE value paths, not one:
--        stored   Field →  data ->> 'key'
--        computed Field →  data -> '_computed' -> 'key' ->> 'value'    (compute_on = write)
--        derived  Field →  no path at all — worked out at READ time, so it is NOT indexable
--                          and `custom.promoted_index_expr` returns NULL for it by name.
--     REC-N-3's LAW — never index a path the field's values do not live on — is honoured over
--     all three. Its PUNCTUATION describes an envelope nobody built. A bare `data ->> 'key'`
--     over a computed Field indexes a key that is not there and answers "no rows" for every
--     value that exists; that is the silent wrong answer REC-N-3 exists to prevent, and it is
--     the one this ruling actually prevents.
--     *Cost if wrong:* the expression text in one function and the indexes built from it;
--     `custom.promoted_index_ddl` reprints them and the promotion is re-run. Nothing else
--     moves, because nothing is stored differently.
--
-- (c) REC-4 — THE MODE IS A PROPERTY OF THE TABLE, AND IT IS A DECLARATION, NOT A SHAPE.
--     `light` and `heavy` are ONE store: the difference is whether the Table's promoted
--     Fields carry indexes, never where the bytes live (REC-36's one jsonb document is
--     untouched either way). That is what makes REC-5's promotion cheap — see (d). The Rule
--     layer's half of REC-4 (Rules on write for heavy, Rules on read for light) is read from
--     `custom.table_storage()` by `W1-RULE-APPLY`'s evaluator; this lane publishes the
--     function and the declaration, and replaces no validation body — those are other lanes'
--     and are this lane's `must not touch`.
--
-- (d) REC-5 — PROMOTION IS `CREATE INDEX`, AND NOTHING ELSE MOVES.
--     `custom.promote_table()` reports the rows it moved, and the number is always zero.
--
-- (e) THE PARTITIONED-INDEX MECHANIC, DECIDED FROM POSTGRES'S RULES AND MEASURED HERE.
--     `custom.record` is sixteen hash partitions by `organization_id`, and an index on a
--     partitioned PARENT cannot be built `CONCURRENTLY` — Postgres refuses it outright. The
--     two legal routes, and why only one of them is the sanctioned promotion:
--       ROUTE A  `CREATE INDEX` on the parent. One statement. MEASURED from `pg_locks` inside
--                the building transaction: `ShareLock` on the parent AND on EVERY partition,
--                plus `AccessExclusiveLock` on each child index it creates. The lock is not
--                scoped to the promoting organization — `custom.record` is ONE store, so
--                freezing the partitions to promote one Table's Field freezes writes for
--                every other organization whose rows hash into them. MEASURED writer cost at
--                600,000 rows over two partitions: a concurrent writer's worst insert went
--                from 201.9 ms with no build running to 1,577.7 ms during ROUTE A.
--       ROUTE B  `CREATE INDEX ON ONLY custom.record` (instant: the parent index is empty and
--                `indisvalid=false` until every child is attached), then one
--                `CREATE INDEX CONCURRENTLY` per partition — `ShareUpdateExclusiveLock`,
--                which does not block writers — then `ALTER INDEX … ATTACH PARTITION`, which
--                takes a brief lock per partition and flips the parent valid on the last one.
--                MEASURED, same 600,000 rows, same writer: worst insert 194.0 ms against a
--                201.9 ms no-build baseline, ZERO inserts over 500 ms. Indistinguishable from
--                not building at all. And `CREATE INDEX CONCURRENTLY` on the parent is not a
--                third option: Postgres refuses it outright — `ERROR: cannot create index on
--                partitioned table "…" concurrently`, measured, not recalled.
--     ROUTE B IS THE SANCTIONED PROMOTION and `custom.promoted_index_ddl()` emits it.
--     `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block, so it cannot run
--     inside a plpgsql function at all: the generator RETURNS the statements and the
--     Migration executes them with autocommit (§4.9's autocommit route). `custom.promote_
--     field()` executes ROUTE A for a small Table and REFUSES BY NAME above
--     `custom.promotion_inline_ceiling()`, naming the generator as the route for a big one —
--     so the cheap path is never the silent path.
--
-- THE INVERSE: `migrations/inverse/w1_index_the_promotion_layer_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 1. THE PUBLISHED CEILINGS (REC-N-5) — published, never discovered in production
-- ═══════════════════════════════════════════════════════════════════════════════════════

create function custom.promoted_field_cap()
  returns integer language sql immutable parallel safe set search_path to 'pg_catalog' as $$
  select 8;
$$;

comment on function custom.promoted_field_cap() is
  'REC-N-5: eight promoted Fields per Table. Published, and refused at the write door.';

create function custom.table_record_ceiling()
  returns integer language sql immutable parallel safe set search_path to 'pg_catalog' as $$
  select 150000;
$$;

comment on function custom.table_record_ceiling() is
  'REC-N-5: 150,000 records per published Table. Airtable Business publishes 125,000 per base; '
  'our own measured unindexed-sort ceiling is ~160,000 rows.';

-- The line between ROUTE A and ROUTE B of ruling (e). A Table under this many records may be
-- promoted inside one transaction; above it the generator's statements are the only route.
create function custom.promotion_inline_ceiling()
  returns integer language sql immutable parallel safe set search_path to 'pg_catalog' as $$
  select 10000;
$$;

comment on function custom.promotion_inline_ceiling() is
  'Ruling (e): above this many records a promotion is ROUTE B (CREATE INDEX CONCURRENTLY per '
  'partition, then ATTACH), which cannot run inside a transaction and so cannot run inside '
  'custom.promote_field(). Below it, ROUTE A in one transaction is cheaper than the ceremony.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 2. REC-4 — light and heavy, one store
-- ═══════════════════════════════════════════════════════════════════════════════════════

create function custom.storage_modes()
  returns text[] language sql immutable parallel safe set search_path to 'pg_catalog' as $$
  select array['light', 'heavy']::text[];
$$;

comment on function custom.storage_modes() is
  'REC-4: light is whole-document storage with Rules on read; heavy is indexed storage with '
  'Rules on write. The choice is per Table and keeps ONE store.';

create function custom.table_storage(p_organization_id uuid, p_table_id uuid)
  returns text language sql stable set search_path to 'pg_catalog' as $$
  -- A Table that has never said is `light`: whole-document storage is what the store does
  -- with no further declaration, so the default is the behaviour rather than a setting.
  select coalesce(nullif(t.data ->> 'storage', ''), 'light')
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
$$;

comment on function custom.table_storage(uuid, uuid) is
  'REC-4: the Table''s storage mode, light or heavy. Read by the Rule layer to decide whether '
  'its Rules run on write (heavy) or on read (light).';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 3. REC-N-3 — the index EXPRESSION, one implementation, read from the store's own paths
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- The bridge from what a Field DECLARES to the arm `platform.custom_field_index_expr` knows.
-- `custom.field.type` is the BEHAVIOUR (list · range · text · relation · formula) and
-- `custom.parity_type(data)` derives the parity type; neither is the platform function's
-- vocabulary, and the map between them is written ONCE, here.
create function custom.promoted_index_arm(p_field_data jsonb)
  returns text language sql immutable parallel safe set search_path to 'pg_catalog' as $$
  select case custom.parity_type(p_field_data)
    when 'multi_select' then 'multi_select'   -- many values in one key: no scalar to index
    when 'attachment'   then 'file'           -- REC-31's File relation
    when 'currency'     then 'currency'       -- the {amount, currency} object
    when 'percent'      then 'number'
    when 'datetime'     then 'text'           -- ISO-8601 sorts as text; a date cast is not IMMUTABLE
    when 'select'       then 'text'
    when 'member'       then 'text'
    when 'lookup'       then 'text'
    when 'rollup'       then 'number'
    when 'formula'      then 'text'
    when 'url'          then 'text'
    when 'email'        then 'text'
    when 'phone'        then 'text'
    else case
      -- A Field with no parity type is still a Field. Its behaviour decides.
      -- MEASURED from `custom._field_shape_guard`, 2026-09-17: a Field's behaviour is one of
      -- `list`, `range`, `text`, `relation`, `formula` — a CLOSED set with no `boolean` in it,
      -- and `config.kind` is only ever read for `date`/`datetime`. So this map emits no
      -- `boolean` arm at all: mapping a shape the store cannot hold is the same silent-wrong-
      -- answer class ruling (b) is about. `platform.custom_field_index_expr`'s own `boolean`
      -- arm keeps its EXPLAIN proof in the platform half, where it is reachable directly.
      when p_field_data ->> 'type' = 'range'
           and coalesce((p_field_data ->> 'multi')::boolean, false) is false then 'number'
      when p_field_data ->> 'type' = 'relation'
           and coalesce((p_field_data ->> 'relation_max')::integer, 1) > 1 then 'multi_select'
      else 'text'
    end
  end;
$$;

comment on function custom.promoted_index_arm(jsonb) is
  'The ONE map from a Field''s declared behaviour and its parity type to the arm '
  'platform.custom_field_index_expr enumerates. multi_select and file are the arms that '
  'answer NULL — a Field mapped to either gets no index, by name and not by silence.';

-- Which of the store's three value paths this Field's values live on (ruling (b)).
create function custom.promoted_value_path(p_field_data jsonb)
  returns text language sql immutable parallel safe set search_path to 'pg_catalog' as $$
  select case
    when p_field_data ->> 'compute_on' = 'read'  then 'derived'
    when p_field_data ->> 'compute_on' = 'write' then 'computed'
    when custom.parity_type(p_field_data) in ('lookup', 'rollup') then 'derived'
    else 'stored'
  end;
$$;

comment on function custom.promoted_value_path(jsonb) is
  'Ruling (b): the store keeps three value paths. `stored` is the flat key, `computed` is '
  '_computed -> key -> value (compute_on = write), `derived` is worked out at READ time and '
  'has no stored path at all — so a derived Field is not indexable.';

create function custom.promoted_index_expr(p_field_data jsonb)
  returns text language plpgsql immutable parallel safe set search_path to 'pg_catalog' as $$
declare
  v_key  text := p_field_data ->> 'key';
  v_arm  text := custom.promoted_index_arm(p_field_data);
  v_path text := custom.promoted_value_path(p_field_data);
  v_expr text;
begin
  if v_key is null then
    return null;
  end if;

  -- A derived Field has no stored value. Saying so is the whole point: an index over
  -- `data ->> 'key'` for one of these indexes a key that is not in the document, and every
  -- query through it answers "no rows" for values that do exist.
  if v_path = 'derived' then
    return null;
  end if;

  -- The arms that answer NULL answer NULL here too, and nothing downstream invents an index.
  v_expr := platform.custom_field_index_expr(v_arm, v_key, 'data');
  if v_expr is null then
    return null;
  end if;

  if v_path = 'computed' then
    -- `_computed -> key -> value`. The platform function builds over `data`; a computed
    -- Field's value is one level further in, so the container is rewritten and the arm's own
    -- cast is kept exactly as the function produced it. Worked through for every arm this
    -- map can reach, 2026-09-17:
    --   number   ((( data->>'k' )::numeric))  ->  ((( (data->'_computed'->'k')->>'value' )::numeric))
    --   currency ((( data->'k'->>'amount' )::numeric))
    --                                        ->  ((( (data->'_computed'->'k')->'value'->>'amount' )::numeric))
    --   text     (( data->>'k' ))            ->  (( (data->'_computed'->'k')->>'value' ))
    v_expr := replace(v_expr,
                      'data->' || quote_literal(v_key),
                      '(data->' || quote_literal('_computed') || '->' || quote_literal(v_key) || ')->' || quote_literal('value'));
    v_expr := replace(v_expr,
                      'data->>' || quote_literal(v_key),
                      '(data->' || quote_literal('_computed') || '->' || quote_literal(v_key) || ')->>' || quote_literal('value'));

    -- A TEXT REWRITE THAT SILENTLY DID NOT FIRE IS THE WHOLE DEFECT CLASS THIS FUNCTION
    -- EXISTS TO CLOSE, so it is asserted rather than trusted: if the platform function ever
    -- emits a container this rewrite does not recognise, the expression would still LOOK
    -- valid and would index the bare key — an index over a path that holds nothing, which is
    -- exactly REC-N-3's silent wrong answer wearing the fix's clothes. It refuses instead,
    -- by name, naming both texts.
    if position('_computed' in v_expr) = 0
       or position('data->' || quote_literal(v_key) in replace(v_expr, '_computed', '')) > 0 then
      raise exception 'the index expression for the computed field % could not be pointed at where its values are kept', v_key
        using errcode = '0A000',
              hint = format('REC-N-3, ruling (b): platform.custom_field_index_expr produced %L, and this store keeps a compute-on-write value at data -> ''_computed'' -> %L -> ''value''. The rewrite did not fire, so no index is built rather than one that matches nothing.', v_expr, v_key);
    end if;
  end if;

  return v_expr;
end $$;

comment on function custom.promoted_index_expr(jsonb) is
  'REC-N-3: the ONE expression a promoted Field is indexed by and queried by. Built from '
  'platform.custom_field_index_expr over the path the Field''s own storage uses. NULL means '
  'not indexable, and every caller says which of the three reasons it was.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 4. The promoted Fields of a Table, and the index names (REC-N-1 · REC-N-12)
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- Deterministic, readable, and inside Postgres's 63-byte identifier limit. The field key is
-- kept in the name because REC-N-12's refusal quotes the index name at a person.
create function custom.promoted_index_name(p_table_id uuid, p_field_key text, p_unique boolean)
  returns text language sql immutable parallel safe set search_path to 'pg_catalog' as $$
  select case when p_unique then 'cpu_' else 'cpi_' end
         || left(p_field_key, 32) || '_'
         || left(md5(p_table_id::text || ':' || p_field_key), 10);
$$;

comment on function custom.promoted_index_name(uuid, text, boolean) is
  'REC-N-12: the constraint''s own name is what refuses the loser of a concurrent duplicate '
  'write, so it carries the field key a person recognises and a hash of the Table.';

create function custom.promoted_fields(p_organization_id uuid, p_table_id uuid)
  returns table(field_id uuid, field_key text, parity_type text, is_unique boolean,
                value_path text, index_arm text, index_expr text, index_name text,
                indexable boolean, why_not text)
  language sql stable set search_path to 'pg_catalog' as $$
  select f.id,
         f.data ->> 'key',
         custom.parity_type(f.data),
         coalesce((f.data ->> 'unique')::boolean, false),
         custom.promoted_value_path(f.data),
         custom.promoted_index_arm(f.data),
         custom.promoted_index_expr(f.data),
         custom.promoted_index_name(p_table_id, f.data ->> 'key',
                                    coalesce((f.data ->> 'unique')::boolean, false)),
         custom.promoted_index_expr(f.data) is not null,
         case
           when custom.promoted_index_expr(f.data) is not null then null
           when custom.promoted_value_path(f.data) = 'derived'
             then 'this field is worked out when somebody reads it, so there is no stored value to index'
           when custom.promoted_index_arm(f.data) = 'multi_select'
             then 'this field holds many values in one key, and there is no single value to index'
           when custom.promoted_index_arm(f.data) = 'file'
             then 'this field holds a file, and a file is reached through its record rather than sorted'
           else 'this field declares no key'
         end
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and coalesce((f.data ->> 'promoted')::boolean, false)
     and nullif(f.data ->> 'entity_definition_id', '')::uuid = p_table_id
   order by f.data ->> 'key';
$$;

comment on function custom.promoted_fields(uuid, uuid) is
  'The promoted Fields of one Table, each with the expression it is indexed by — or the '
  'sentence saying why it cannot be. REC-N-3''s NULL branches are named here, never skipped.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 5. THE INDEX-DDL GENERATOR AND ITS GUARD (REC-N-1 · REC-N-2 · ruling (e))
-- ═══════════════════════════════════════════════════════════════════════════════════════

create function custom.promoted_index_ddl(p_organization_id uuid, p_table_id uuid)
  returns table(step integer, purpose text, statement text)
  language plpgsql stable set search_path to 'pg_catalog' as $$
declare
  v_on    boolean;
  f       record;
  v_part  record;
  v_n     integer := 0;
  v_scope text;
begin
  -- THE GUARD, and it is on the GENERATOR rather than on the expression function: ruling (a).
  -- `custom.store_is_open()`'s pattern, one knob along: a switch this caller cannot read is
  -- CLOSED, and it says so with the key and the remedy rather than returning an empty set
  -- that reads like "this Table has no promoted fields".
  begin
    v_on := coalesce((platform.knob_resolve('custom', 'field_index_guard', p_organization_id) #>> '{}')::boolean, false);
  exception when others then
    v_on := false;
  end;

  if not v_on then
    raise notice 'custom/field_index_guard is off, so no promoted-field index DDL is generated. Turn it on with platform.knob_write_door_for(''custom'', ''field_index_guard'') to promote fields in this organization.';
    return;
  end if;

  for f in select * from custom.promoted_fields(p_organization_id, p_table_id) loop
    if not f.indexable then
      v_n := v_n + 1;
      return query select v_n, 'skipped: ' || f.field_key,
                          '-- ' || f.field_key || ': ' || f.why_not;
      continue;
    end if;

    -- REC-N-1: organization_id LEADS, and the index is scoped to its own Table. REC-N-12's
    -- unique index is the same index with UNIQUE — scoped to organization, Table and Field,
    -- and `organization_id` is already the partition key, which is what a unique index on a
    -- partitioned table is required to include.
    v_scope := format('(organization_id, %s) where table_id = %L::uuid and deleted_at is null',
                      f.index_expr, p_table_id);

    -- ROUTE B, statement 1: the parent index, ON ONLY. Instant — it indexes no rows and stays
    -- `indisvalid = false` until the sixteenth child is attached.
    v_n := v_n + 1;
    return query select v_n, 'parent index (ON ONLY, invalid until every partition attaches)',
      format('create %s index if not exists %I on only custom.record %s;',
             case when f.is_unique then 'unique' else '' end, f.index_name, v_scope);

    -- ROUTE B, statement 2..n: one CONCURRENTLY per partition, then its ATTACH. These do not
    -- block writers, and they CANNOT run inside a transaction block — the Migration runs them
    -- with autocommit (§4.9).
    for v_part in
      select c.relname, row_number() over (order by c.relname) as ord
        from pg_inherits i
        join pg_class c on c.oid = i.inhrelid
       where i.inhparent = 'custom.record'::regclass
       order by c.relname
    loop
      v_n := v_n + 1;
      return query select v_n, format('partition %s: build without blocking writers', v_part.relname),
        format('create %s index concurrently if not exists %I on custom.%I %s;',
               case when f.is_unique then 'unique' else '' end,
               left(f.index_name, 52) || '_' || lpad(v_part.ord::text, 2, '0'),
               v_part.relname, v_scope);
      v_n := v_n + 1;
      return query select v_n, format('partition %s: attach', v_part.relname),
        format('alter index custom.%I attach partition custom.%I;',
               f.index_name, left(f.index_name, 52) || '_' || lpad(v_part.ord::text, 2, '0'));
    end loop;
  end loop;

  if v_n = 0 then
    raise notice 'no Field of this Table is declared promoted, so there is nothing to build.';
  end if;
  return;
end $$;

comment on function custom.promoted_index_ddl(uuid, uuid) is
  'THE INDEX-DDL GENERATOR, and the object custom/field_index_guard actually guards (ruling '
  '(a)): platform.custom_field_index_expr is IMMUTABLE and an index expression may contain '
  'nothing else, so the knob is read HERE, by the caller that builds the DDL. Emits ROUTE B '
  '(ruling (e)): parent ON ONLY, then CREATE INDEX CONCURRENTLY per partition, then ATTACH.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 6. PROMOTION (REC-5) — and it moves nothing
-- ═══════════════════════════════════════════════════════════════════════════════════════

create function custom.promote_field(p_organization_id uuid, p_table_id uuid, p_field_id uuid)
  returns jsonb language plpgsql set search_path to 'pg_catalog' as $$
declare
  v_on    boolean;
  v_rows  bigint;
  v_key   text;
  v_expr  text;
  v_uniq  boolean;
  v_name  text;
  v_data  jsonb;
  v_kids  text[];
  v_kid   text;
  v_i     integer;
  v_t0    timestamptz := clock_timestamp();
begin
  begin
    v_on := coalesce((platform.knob_resolve('custom', 'field_index_guard', p_organization_id) #>> '{}')::boolean, false);
  exception when others then
    v_on := false;
  end;
  if not v_on then
    raise exception 'promoting a field is switched off here'
      using errcode = '0A000',
            hint = 'custom/field_index_guard resolves false for this organization. Nothing was built, and nothing was changed.';
  end if;

  select f.data into v_data
    from custom.record f
   where f.organization_id = p_organization_id and f.id = p_field_id
     and f.table_id = custom.field_kernel_id() and f.deleted_at is null;
  if v_data is null then
    raise exception 'that field does not belong to this organization' using errcode = '23503';
  end if;

  v_key  := v_data ->> 'key';
  v_uniq := coalesce((v_data ->> 'unique')::boolean, false);
  v_expr := custom.promoted_index_expr(v_data);
  v_name := custom.promoted_index_name(p_table_id, v_key, v_uniq);

  if v_expr is null then
    raise exception 'the field % cannot be promoted: %', v_key,
      (select why_not from custom.promoted_fields(p_organization_id, p_table_id) x where x.field_id = p_field_id)
      using errcode = '0A000',
            hint = 'REC-N-3: a promoted Field is indexed by the path its own storage uses, and this one has none.';
  end if;

  -- Ruling (e): ROUTE A is the SMALL-Table route and says so rather than freezing sixteen
  -- partitions for every organization in the store.
  select count(*) into v_rows from custom.record r
   where r.organization_id = p_organization_id and r.table_id = p_table_id and r.deleted_at is null;
  if v_rows > custom.promotion_inline_ceiling() then
    raise exception 'this table has % records, which is more than the % this route builds in one go', v_rows, custom.promotion_inline_ceiling()
      using errcode = '53400',
            hint = 'Run the statements custom.promoted_index_ddl(organization, table) returns instead: they build each partition without blocking anybody, and they have to run one at a time rather than inside a transaction.';
  end if;

  execute format('create %s index if not exists %I on custom.record (organization_id, %s) where table_id = %L::uuid and deleted_at is null',
                 case when v_uniq then 'unique' else '' end, v_name, v_expr, p_table_id);

  -- 🚨 REC-N-12 IS ABOUT THE NAME A PERSON READS, AND ROUTE A DOES NOT GIVE THEM ONE.
  -- `CREATE INDEX` on a partitioned parent creates one index per partition and NAMES THEM
  -- ITSELF: `record_p09_organization_id_expr_idx1`. That is the string the database quotes at
  -- whoever loses a concurrent duplicate write, and it carries no field key, no table and
  -- nothing anybody can act on — so the whole reason `custom.promoted_index_name` keeps the
  -- field key in the name is lost on the one path that matters. MEASURED 2026-09-17: the
  -- duplicate refusal read `duplicate key value violates unique constraint
  -- "record_p09_organization_id_expr_idx1"`. The children are therefore renamed to the same
  -- convention ROUTE B builds them under — `<parent>_NN` — so both routes leave one index
  -- naming scheme and the refusal says which field it is about, whichever route built it.
  -- The names are collected BEFORE any rename: renaming inside the walk would reorder it.
  select array_agg(c.relname order by c.relname) into v_kids
    from pg_inherits i join pg_class c on c.oid = i.inhrelid
   where i.inhparent = format('custom.%I', v_name)::regclass;
  for v_i in 1 .. coalesce(array_length(v_kids, 1), 0) loop
    v_kid := left(v_name, 52) || '_' || lpad(v_i::text, 2, '0');
    if v_kids[v_i] is distinct from v_kid then
      execute format('alter index custom.%I rename to %I', v_kids[v_i], v_kid);
    end if;
  end loop;

  return jsonb_build_object(
    'field_key', v_key, 'index_name', v_name, 'unique', v_uniq, 'expression', v_expr,
    'records', v_rows, 'rows_moved', 0, 'route', 'A (in one transaction, under the inline ceiling)',
    'partition_indexes', coalesce(array_length(v_kids, 1), 0),
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end $$;

comment on function custom.promote_field(uuid, uuid, uuid) is
  'REC-5: promotion is CREATE INDEX and nothing else. `rows_moved` is in the answer and it is '
  'always zero — that is what makes the Migration cheap.';

create function custom.promote_table(p_organization_id uuid, p_table_id uuid)
  returns jsonb language plpgsql set search_path to 'pg_catalog' as $$
declare
  v_before bigint;
  v_after  bigint;
  v_was    text;
  f        record;
  v_built  jsonb := '[]'::jsonb;
begin
  v_was := custom.table_storage(p_organization_id, p_table_id);
  select count(*) into v_before from custom.record r
   where r.organization_id = p_organization_id and r.table_id = p_table_id;

  for f in select * from custom.promoted_fields(p_organization_id, p_table_id) where indexable loop
    v_built := v_built || jsonb_build_array(custom.promote_field(p_organization_id, p_table_id, f.field_id));
  end loop;

  update custom.record
     set data = data || jsonb_build_object('storage', 'heavy')
   where organization_id = p_organization_id and id = p_table_id
     and table_id = custom.table_kernel_id();

  select count(*) into v_after from custom.record r
   where r.organization_id = p_organization_id and r.table_id = p_table_id;

  return jsonb_build_object('was', v_was, 'now', custom.table_storage(p_organization_id, p_table_id),
                            'records_before', v_before, 'records_after', v_after,
                            'rows_moved', v_after - v_before, 'indexes', v_built);
end $$;

comment on function custom.promote_table(uuid, uuid) is
  'REC-5: light -> heavy, the Migration made cheap. Records before and after are both in the '
  'answer, and `rows_moved` is their difference — zero, every time, or this law is false.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 7. DOOR-N-3 / REC-N-2 — the hot read path, as a prepared statement
-- ═══════════════════════════════════════════════════════════════════════════════════════

create function custom.promoted_query_sql(p_organization_id uuid, p_table_id uuid, p_field_key text)
  returns text language plpgsql stable set search_path to 'pg_catalog' as $$
declare v_expr text;
begin
  select index_expr into v_expr
    from custom.promoted_fields(p_organization_id, p_table_id) x
   where x.field_key = p_field_key;
  if v_expr is null then
    raise exception 'the field % is not promoted on this table, so there is no prepared read for it', p_field_key
      using errcode = '0A000',
            hint = 'Declare it promoted (REC-N-2: promotion is eager, capped at eight per table), then promote the table.';
  end if;
  -- The parameters are $1 organization, $2 value. The Table is a LITERAL because it is what
  -- selects the partial index — a parameter there and the planner cannot prove the index
  -- applies, which is the whole promotion silently not being used.
  return format(
    'prepare %I (uuid, text) as select id from custom.record where organization_id = $1 and table_id = %L::uuid and deleted_at is null and %s = $2;',
    'cpq_' || left(md5(p_table_id::text || ':' || p_field_key), 12), p_table_id, v_expr);
end $$;

comment on function custom.promoted_query_sql(uuid, uuid, text) is
  'DOOR-N-3 / REC-N-2: every promoted-field read is issued as a PREPARED statement, because '
  'at a few thousand partial indexes planning costs more than the read. This returns the '
  'PREPARE text so a client issues the same expression the index was built from — one '
  'expression, never two that have to agree.';

create function custom.promoted_read(p_organization_id uuid, p_table_id uuid, p_field_key text, p_value text)
  returns setof uuid language plpgsql stable set search_path to 'pg_catalog' as $$
declare v_expr text;
begin
  select index_expr into v_expr
    from custom.promoted_fields(p_organization_id, p_table_id) x
   where x.field_key = p_field_key;
  if v_expr is null then
    raise exception 'the field % is not promoted on this table', p_field_key using errcode = '0A000';
  end if;
  -- plpgsql caches this statement's plan after its fifth execution, which is the prepared
  -- path DOOR-N-3 asks for; the expression comes from the same function the index was built
  -- from, so the two can never drift apart.
  return query execute format(
    'select id from custom.record where organization_id = $1 and table_id = %L::uuid and deleted_at is null and %s = $2',
    p_table_id, v_expr) using p_organization_id, p_value;
end $$;

comment on function custom.promoted_read(uuid, uuid, text, text) is
  'The hot read path on the shared store (DOOR-N-3). One expression, from '
  'custom.promoted_index_expr, for both the index and the query.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 8. THE PER-TABLE CAP (REC-N-5) — a refusal at the write door, not a lint
-- ═══════════════════════════════════════════════════════════════════════════════════════

create function custom._promoted_field_cap_guard()
  returns trigger language plpgsql set search_path to 'pg_catalog' as $$
declare
  v_table uuid;
  v_n     integer;
  v_open  boolean;
begin
  -- THE SWITCH NEVER REMOVES A CHECK (the `w1_val_validation_reads_its_switch.sql` pattern).
  -- `custom/field_index_guard` is READ here and named in the refusal, so a person who meets
  -- the cap knows which switch governs promotion — but the cap is refused whether it is on
  -- or off. A cap that lifts when a flag is off is not a cap; it is a cap-shaped comment.
  begin
    v_open := coalesce((platform.knob_resolve('custom', 'field_index_guard', new.organization_id) #>> '{}')::boolean, false);
  exception when others then
    v_open := false;
  end;

  if new.table_id is distinct from custom.field_kernel_id()
     or new.data_class = 'kernel'
     or not coalesce((new.data ->> 'promoted')::boolean, false) then
    return new;
  end if;

  v_table := nullif(new.data ->> 'entity_definition_id', '')::uuid;
  if v_table is null then
    return new;   -- a Field of a STANDARD table (FLD-8's table_token) has no custom Table cap
  end if;

  select count(*) into v_n
    from custom.record f
   where f.organization_id = new.organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.id is distinct from new.id
     and coalesce((f.data ->> 'promoted')::boolean, false)
     and nullif(f.data ->> 'entity_definition_id', '')::uuid = v_table;

  if v_n >= custom.promoted_field_cap() then
    raise exception 'this table already has % fields set up for fast sorting and searching, which is as many as it can have',
                    custom.promoted_field_cap()
      using errcode = '23514',
            hint = format('REC-N-5: %s promoted fields per table, published rather than discovered. Take one off another field first. (The switch that governs promotion here is custom/field_index_guard, and it is currently %s — the cap holds either way.)',
                          custom.promoted_field_cap(), case when v_open then 'on' else 'off' end);
  end if;

  return new;
end $$;

comment on function custom._promoted_field_cap_guard() is
  'REC-N-5: the eight-promoted-field cap, refused at the write door. Reads '
  'custom/field_index_guard and names it in the refusal; the cap holds whether it is on or off.';

-- `zz_` so it fires AFTER every shape and envelope guard: a document that is not a legal
-- Field should be refused for being illegal, not for being the ninth of its kind. Created
-- BARE, with no `drop trigger if exists` above it: every `DROP` is refused by name in a file
-- whose header names production (JUDGMENT.md §4), which is why every sibling in this campaign
-- creates its trigger this way and leaves the dropping to the inverse. Re-application is
-- rule 27's down-then-up, never an up on top of an up.
create trigger zz_promoted_field_cap
  before insert or update on custom.record
  for each row execute function custom._promoted_field_cap_guard();

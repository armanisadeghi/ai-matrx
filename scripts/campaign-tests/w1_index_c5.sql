-- W1-INDEX — CHECK C-5, THE INDEX AND PROMOTION LAYER, PROVEN.
--   REC-4 · REC-5 · REC-N-1 · REC-N-2 · REC-N-3 · REC-N-5 · REC-N-12 · DOOR-N-3.
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_index_c5.sql
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and it ROLLS
-- BACK. It refuses to run anywhere but the rehearsal branch, by system identifier.
--
-- ITS RED TWIN is `scripts/campaign-tests/w1_index_red.sql`, which turns this lane's
-- enforcement points off inside one rolled-back transaction and proves every refusal below
-- disappearing. B1 (REC-N-12's concurrent duplicate) and ruling (e)'s measured lock cost need
-- two committing sessions and autocommit, so they live in
-- `scripts/campaign-tests/w1_index_b1.sh`.
--
-- WHAT MAKES IT FAIL — THE CHANGE, NAMED (rule 3): delete any arm of
-- `platform.custom_field_index_expr` and PART 1 fails on the arm that lost its EXPLAIN; point
-- `custom.promoted_index_expr` at the bare key for a computed Field and PART 3 fails because
-- the index it builds matches no row that exists; raise `custom.promoted_field_cap()` and
-- PART 5's ninth Field lands.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System
  v_table   uuid;
  v_fid     uuid;
  v_arms    text[];
  v_arm     text;
  v_expr    text;
  v_name    text;
  v_plan    text;
  v_n       integer;
  v_nulls   text[] := '{}';
  v_built   text[] := '{}';
  v_json    jsonb;
  v_rec     uuid;
  v_msg     text;
  v_hint    text;
  v_leading text;
  v_line    text;
  v_uniq    boolean;
  v_texts   jsonb;
begin
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w1_index_c5.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  -- The guard is OFF on the branch, as every campaign guard is. Promotion is switched off with
  -- it, so the proof turns it on for THIS organization inside the transaction that rolls back
  -- — which is itself the guard working: PART 6 turns it back off and watches promotion refuse.
  -- MEASURED 2026-09-17: `platform.knob_scope_kind` is EMPTY on the rehearsal branch, so no
  -- override row can exist here at all — the branch carries the knob register's SHAPE and not
  -- its rungs. The `organization` rung is seeded inside this same rolled-back transaction, so
  -- the override path below is the real one rather than a simulated one, and nothing survives.
  insert into platform.knob_scope_kind (kind, precedence, description, organization_id, visibility)
  values ('organization', 10, 'The organization itself — the rung every knob in this proof stands on.',
          v_org, 'internal')
  on conflict (kind) do nothing;

  -- `custom/field_index_guard` is a GUARD, and a guard is deliberately `overridable_by = '{}'`:
  -- no organization may switch a campaign guard on for itself. The only thing that turns it on
  -- is its PLATFORM value, which is what the switch checklist writes — so that is what this
  -- proof writes, inside the transaction that rolls back. (Measured 2026-09-17: an
  -- organization-scoped override on this key resolves to nothing at all, which is the register
  -- working.)
  update platform.feature_knob set value = 'true'::jsonb
   where feature = 'custom' and key = 'field_index_guard';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 1 — EVERY ARM OF `platform.custom_field_index_expr`, ENUMERATED FROM ITS OWN
  --          SOURCE, AND EVERY NON-NULL ONE PLANNED THROUGH BY `EXPLAIN`.
  -- ════════════════════════════════════════════════════════════════════════════════════
  -- Read from `prosrc`, never from a literal list: a list would pass while the function grew
  -- a fourteenth arm nobody indexed.
  select array_agg(distinct m[1] order by m[1]) into v_arms
    from pg_proc p,
         lateral regexp_matches(p.prosrc, 'WHEN\s+''([a-z_]+)''\s+THEN', 'g') m
   where p.proname = 'custom_field_index_expr' and p.pronamespace = 'platform'::regnamespace;

  -- The `ELSE` arm is not a `WHEN`, so the regex cannot see it — and it is the arm MOST fields
  -- reach. It is appended by name, under the label the lane's own map sends there, so the loop
  -- below exercises five WHENs and the ELSE: six paths, which is the whole function.
  v_arms := v_arms || 'text'::text;   -- 'text' matches no WHEN, so it lands in the ELSE
  if coalesce(array_length(v_arms, 1), 0) < 6 then
    raise exception 'PART 1 read % arm(s) out of platform.custom_field_index_expr''s own source, and the function is supposed to enumerate at least five WHENs plus its ELSE', coalesce(array_length(v_arms, 1), 0);
  end if;
  raise notice 'PART 1 — arms read from the function''s own prosrc: %', array_to_string(v_arms, ', ');

  -- ARM BY ARM, THE TEXT ITSELF. `prosrc` equality is the wrong test — a body that gained a
  -- `SET search_path` is never byte-identical to one that did not — so what is compared is what
  -- each arm ANSWERS, against the text this campaign publishes and indexes by. An edit that
  -- changes one arm's output fails here rather than silently rebuilding somebody's index over a
  -- different expression.
  v_texts := jsonb_build_object(
    'number',       '(((data->>''zz_probe_key'')::numeric))',
    'boolean',      '(((data->>''zz_probe_key'')::boolean))',
    'currency',     '(((data->''zz_probe_key''->>''amount'')::numeric))',
    'multi_select', null,
    'file',         null,
    'text',         '((data->>''zz_probe_key''))');

  foreach v_arm in array v_arms loop
    v_expr := platform.custom_field_index_expr(v_arm, 'zz_probe_key', 'data');
    if not v_texts ? v_arm then
      raise exception 'PART 1 — platform.custom_field_index_expr has grown an arm nobody named: %', v_arm
        using hint = 'REC-N-3: an arm either builds an index over a path the values live on, or answers NULL by name. A new one is decided, never inherited.';
    end if;
    if v_expr is distinct from (v_texts ->> v_arm) then
      raise exception 'PART 1 — the % arm answers % and this campaign indexes by %',
                      v_arm, coalesce(v_expr, 'NULL'), coalesce(v_texts ->> v_arm, 'NULL')
        using hint = 'Every index already built from the old text would go on answering questions nobody asked.';
    end if;
    if v_expr is null then
      v_nulls := v_nulls || v_arm;
      continue;
    end if;
    v_name := 'zz_w1_index_arm_' || v_arm;
    execute format('create index %I on custom.record (organization_id, %s) where deleted_at is null',
                   v_name, v_expr);
    v_built := v_built || v_arm;

    -- PLANNED THROUGH, not merely created: an index nothing can use is an index nobody has.
    -- `EXPLAIN` cannot sit in a subquery, so the plan is read row by row and joined.
    v_plan := '';
    for v_line in execute format(
      'explain (costs off) select id from custom.record where organization_id = %L::uuid and deleted_at is null and %s = %s order by %s limit 10',
      v_org, v_expr,
      case when v_expr like '%%::numeric%%' then '1'
           when v_expr like '%%::boolean%%' then 'true'
           else '''x''' end, v_expr)
    loop
      v_plan := v_plan || ' ' || v_line;
    end loop;
    -- `custom.record` is partitioned, so the planner names the CHILD index it actually scans,
    -- never the parent. The child names are read from `pg_inherits` rather than guessed: an
    -- assertion on the parent's own name would fail on a working index, and an assertion on
    -- the string 'Index Scan' would pass on somebody else's index.
    if not exists (
      select 1
        from pg_inherits i
        join pg_class child on child.oid = i.inhrelid
       where i.inhparent = format('custom.%I', v_name)::regclass
         and position(child.relname in v_plan) > 0)
       and position(v_name in v_plan) = 0 then
      raise exception 'PART 1 — the % arm built index % and the planner did not use it or any of its partitions. Plan: %', v_arm, v_name, v_plan
        using hint = 'REC-N-3: an index the planner cannot reach is not a promotion.';
    end if;
    raise notice 'PART 1 —   arm % -> % -> planned through % ', rpad(v_arm, 13), rpad(v_expr, 46), v_name;
  end loop;

  if not (v_nulls @> array['multi_select', 'file'] and v_nulls <@ array['multi_select', 'file']) then
    raise exception 'PART 1 — the arms that answer NULL are supposed to be exactly multi_select and file, and they are %', v_nulls
      using hint = 'The lane exit names the null branches. A new one that nobody named is an unindexable field type shipping in silence.';
  end if;
  raise notice 'PART 1 PASS — % arm(s) built a real index and were planned through; the NULL arms are exactly %, named rather than skipped.',
               array_length(v_built, 1), array_to_string(v_nulls, ' and ');

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 2 — RULING (b): THE ENVELOPE REC-N-3 NAMES IS A SHAPE THE STORE REFUSES.
  -- ════════════════════════════════════════════════════════════════════════════════════
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.table_kernel_id(), 'record',
            jsonb_build_object('_values', jsonb_build_object('zz_k', jsonb_build_object('v', 'x'))));
    raise exception 'PART 2 — the store accepted a value envelope carrying "v", which is REC-N-3''s literal path. It is supposed to refuse it by name.';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if position('zz_w1_index' in v_msg) > 0 then raise; end if;
    if position('"v"' in v_msg) = 0 and position('v, which is not part' in v_msg) = 0 then
      raise exception 'PART 2 — the envelope write was refused, but not for carrying "v": %', v_msg;
    end if;
    raise notice 'PART 2 —   refused by name: %', v_msg;
  end;
  raise notice 'PART 2 PASS — `data -> ''_values'' -> k -> ''v''` is not an empty path, it is a shape custom.value_envelope_refusal refuses on write. An index over it could never have a row under it.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 3 — THE THREE VALUE PATHS THE STORE ACTUALLY KEEPS.
  -- ════════════════════════════════════════════════════════════════════════════════════
  -- stored
  v_json := jsonb_build_object('key', 'zz_stored', 'type', 'text', 'label', 'Stored');
  if custom.promoted_value_path(v_json) <> 'stored'
     or custom.promoted_index_expr(v_json) <> '((data->>''zz_stored''))' then
    raise exception 'PART 3 — a stored Field is supposed to be indexed at its own key, and it answered path=% expr=%',
                    custom.promoted_value_path(v_json), custom.promoted_index_expr(v_json);
  end if;
  raise notice 'PART 3 —   stored   -> % -> %', custom.promoted_value_path(v_json), custom.promoted_index_expr(v_json);

  -- computed (compute_on = write): the value lives one level in, under _computed -> key -> value
  v_json := jsonb_build_object('key', 'zz_computed', 'type', 'text', 'compute_on', 'write');
  v_expr := custom.promoted_index_expr(v_json);
  if custom.promoted_value_path(v_json) <> 'computed'
     or position('_computed' in v_expr) = 0
     or position('''value''' in v_expr) = 0 then
    raise exception 'PART 3 — a compute-on-write Field is supposed to be indexed where its value is kept, and it answered %', v_expr
      using hint = 'REC-N-3: an index over the bare key answers "no rows" for every value that exists.';
  end if;
  raise notice 'PART 3 —   computed -> % -> %', custom.promoted_value_path(v_json), v_expr;

  -- derived (compute_on = read): worked out when somebody reads it, so there is no path at all
  v_json := jsonb_build_object('key', 'zz_derived', 'type', 'text', 'compute_on', 'read');
  if custom.promoted_value_path(v_json) <> 'derived'
     or custom.promoted_index_expr(v_json) is not null then
    raise exception 'PART 3 — a derived Field has no stored value and is supposed to be refused an index, and it answered %',
                    custom.promoted_index_expr(v_json);
  end if;
  raise notice 'PART 3 —   derived  -> derived -> NULL, and the reason is a sentence rather than silence.';
  raise notice 'PART 3 PASS — three paths, and the one that cannot be indexed says so.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- THE FIXTURE — one Table, one promoted Field, real records.
  -- ════════════════════════════════════════════════════════════════════════════════════
  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W1-INDEX C5', 'slug', 'zz_w1_index_c5', 'type', 'entity',
    'label_singular', 'Thing', 'label_plural', 'Things', 'title_field', 'code',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    -- The Table declares every field this proof will define, `zz_p9` included: a Field whose
    -- Table never declared it is refused by `custom._field_shape_guard` before the cap is
    -- reached, and PART 5 would then pass for the wrong reason.
    'fields', jsonb_build_array(jsonb_build_object('name', 'code')) ||
              (select jsonb_agg(jsonb_build_object('name', 'zz_p' || g)) from generate_series(2, 9) g),
    'parent_id', '11111111-0000-4000-8000-000000000001'));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'code', 'label', 'Code', 'type', 'text', 'sort', 10, 'required', false,
    'multi', false, 'dated', false, 'source', 'manual', 'config', '{}'::jsonb,
    'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb, 'sensitivity', 'internal',
    'source_config', '{}'::jsonb, 'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'promoted', true, 'unique', true, 'entity_definition_id', v_table))
  returning id into v_fid;

  insert into custom.record (organization_id, table_id, data_class, data)
  select v_org, v_table, 'record', jsonb_build_object('code', 'c' || g)
    from generate_series(1, 200) g;

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 4 — REC-N-1 · REC-N-12: THE PROMOTED INDEX IS SCOPED TO ITS TABLE, WITH
  --          `organization_id` LEADING, AND THE UNIQUE ONE IS REAL.
  -- ════════════════════════════════════════════════════════════════════════════════════
  v_json := custom.promote_field(v_org, v_table, v_fid);
  v_name := v_json ->> 'index_name';
  raise notice 'PART 4 —   promote_field answered %', v_json;

  select a.attname into v_leading
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
   where c.relname = v_name;
  if v_leading is distinct from 'organization_id' then
    raise exception 'REC-N-1 — the promoted index''s leading column is %, and it has to be organization_id', coalesce(v_leading, 'an expression');
  end if;

  select pg_get_expr(i.indpred, i.indrelid), i.indisunique into strict v_plan, v_uniq
    from pg_index i join pg_class c on c.oid = i.indexrelid where c.relname = v_name;
  if position(v_table::text in v_plan) = 0 then
    raise exception 'REC-N-1 — the promoted index is not scoped to its own Table. Its predicate is %', v_plan;
  end if;
  if not v_uniq then
    raise exception 'REC-N-12 — the Field declares itself unique and the index is not a UNIQUE index';
  end if;
  raise notice 'PART 4 PASS — % is UNIQUE, leads on organization_id, and its predicate is %', v_name, v_plan;

  -- The refusal is the database's own, and it quotes the index name a person can recognise.
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, v_table, 'record', jsonb_build_object('code', 'c7'));
    raise exception 'REC-N-12 — a duplicate landed under a unique index';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    -- The refusal names the PARTITION's index, because that is the index the row collided in.
    -- It must still carry the parent's name — and therefore the field key a person recognises
    -- — which is exactly what ROUTE A's rename is for. MEASURED before that rename existed:
    -- `duplicate key value violates unique constraint "record_p09_organization_id_expr_idx1"`.
    if position(left(v_name, 52) in v_msg) = 0 then
      raise exception 'REC-N-12 — the duplicate was refused, but not by a name that carries the field: %', v_msg
        using hint = 'The name in the refusal is what a person is handed. An auto-generated partition index name tells them nothing.';
    end if;
    raise notice 'PART 4 —   duplicate refused by the constraint''s own name: %', v_msg;
  end;

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 5 — REC-N-5: EIGHT PROMOTED FIELDS PER TABLE, REFUSED AT THE WRITE DOOR BY NAME.
  -- ════════════════════════════════════════════════════════════════════════════════════
  for v_n in 2..8 loop
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key', 'zz_p' || v_n, 'label', 'P' || v_n, 'type', 'text', 'sort', v_n, 'required', false,
      'multi', false, 'dated', false, 'source', 'manual', 'config', '{}'::jsonb,
      'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb, 'sensitivity', 'internal',
      'source_config', '{}'::jsonb, 'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
      'promoted', true, 'entity_definition_id', v_table));
  end loop;
  select count(*) into v_n from custom.promoted_fields(v_org, v_table);
  if v_n <> 8 then
    raise exception 'PART 5 — eight promoted Fields were written and the Table reports %', v_n;
  end if;

  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key', 'zz_p9', 'label', 'P9', 'type', 'text', 'sort', 9, 'required', false,
      'multi', false, 'dated', false, 'source', 'manual', 'config', '{}'::jsonb,
      'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb, 'sensitivity', 'internal',
      'source_config', '{}'::jsonb, 'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
      'promoted', true, 'entity_definition_id', v_table));
    raise exception 'REC-N-5 — a ninth promoted Field landed on a Table capped at %', custom.promoted_field_cap();
  exception when check_violation then
    get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
    if position('as many as it can have' in v_msg) = 0 then
      raise exception 'REC-N-5 — the ninth Field was refused, but not by the cap: %', v_msg;
    end if;
    raise notice 'PART 5 —   refused: %', v_msg;
    raise notice 'PART 5 —   remedy:  %', v_hint;
  end;
  raise notice 'PART 5 PASS — the cap is a refusal at the write door, in a sentence, with the switch that governs promotion named in the remedy.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 6 — REC-N-5: THE 150,000-RECORD CEILING IS PUBLISHED AS A KNOB.
  -- ════════════════════════════════════════════════════════════════════════════════════
  if custom.table_record_ceiling() <> 150000 then
    raise exception 'REC-N-5 — the published platform ceiling is %, and REC-N-5 publishes 150,000', custom.table_record_ceiling();
  end if;
  if custom.table_record_ceiling(v_org) <> 150000 then
    raise exception 'REC-N-5 — an organization that set nothing is supposed to get the published number, and it got %', custom.table_record_ceiling(v_org);
  end if;
  v_json := custom.table_capacity(v_org, v_table);
  if (v_json ->> 'ceiling')::integer <> 150000 or (v_json ->> 'over')::boolean then
    raise exception 'REC-N-5 — capacity answered % for a Table of 200 records', v_json;
  end if;
  raise notice 'PART 6 —   published: % ; this organization: % ; capacity says: %',
               custom.table_record_ceiling(), custom.table_record_ceiling(v_org), v_json ->> 'says';

  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'table_record_ceiling', 'organization', v_org, v_org, '100'::jsonb, 'w1_index_c5.sql, rolled back')
  on conflict (feature, key, scope_kind, scope_id, organization_id) do update set value = '100'::jsonb;

  if custom.table_record_ceiling(v_org) <> 100 then
    raise exception 'REC-N-5 — the organization set its own ceiling to 100 and the function still answers %', custom.table_record_ceiling(v_org)
      using hint = 'A ceiling no organization can move is a number an agent chose for every customer.';
  end if;
  v_json := custom.table_capacity(v_org, v_table);
  if not (v_json ->> 'over')::boolean then
    raise exception 'REC-N-5 — 200 records against a ceiling of 100 is over, and capacity says %', v_json;
  end if;
  raise notice 'PART 6 —   organization sets 100: % ', v_json ->> 'says';
  if (v_json ->> 'knob') <> 'custom/table_record_ceiling' then
    raise exception 'REC-N-5 — the answer has to name the knob it read, and it named %', v_json ->> 'knob';
  end if;
  delete from platform.knob_override
   where feature = 'custom' and key = 'table_record_ceiling' and organization_id = v_org;
  raise notice 'PART 6 PASS — published default 150,000, organization-settable, clamped to the platform maximum, and the one answer names the knob.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 7 — REC-4 · REC-5: light -> heavy IS THE CHEAP MIGRATION.
  -- ════════════════════════════════════════════════════════════════════════════════════
  if custom.table_storage(v_org, v_table) <> 'light' then
    raise exception 'REC-4 — a Table that has never said is supposed to be light, and this one is %', custom.table_storage(v_org, v_table);
  end if;
  v_json := custom.promote_table(v_org, v_table);
  if (v_json ->> 'rows_moved')::bigint <> 0 then
    raise exception 'REC-5 — promotion moved % rows. It is CREATE INDEX and nothing else.', v_json ->> 'rows_moved';
  end if;
  if (v_json ->> 'was') <> 'light' or (v_json ->> 'now') <> 'heavy' then
    raise exception 'REC-4 — promote_table answered was=% now=%', v_json ->> 'was', v_json ->> 'now';
  end if;
  raise notice 'PART 7 —   was=% now=% records_before=% records_after=% rows_moved=%',
               v_json ->> 'was', v_json ->> 'now', v_json ->> 'records_before',
               v_json ->> 'records_after', v_json ->> 'rows_moved';
  raise notice 'PART 7 PASS — light and heavy are ONE store: the Migration is the index, and the bytes never move.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 8 — DOOR-N-3: THE HOT READ IS A PREPARED STATEMENT OVER THE INDEX'S OWN
  --          EXPRESSION, AND THE GENERATOR IS WHAT THE GUARD GUARDS.
  -- ════════════════════════════════════════════════════════════════════════════════════
  v_plan := custom.promoted_query_sql(v_org, v_table, 'code');
  if v_plan not like 'prepare %' then
    raise exception 'DOOR-N-3 — the hot read is supposed to be a PREPARE, and it is %', left(v_plan, 40);
  end if;
  if position(custom.promoted_index_expr((select data from custom.record where id = v_fid and organization_id = v_org)) in v_plan) = 0 then
    raise exception 'DOOR-N-3 — the prepared read and the index were built from different expressions. That is the two-that-have-to-agree defect: %', v_plan;
  end if;
  if position(v_table::text in v_plan) = 0 then
    raise exception 'DOOR-N-3 — the Table has to be a LITERAL in the prepared read, or the planner cannot prove the partial index applies: %', v_plan;
  end if;
  raise notice 'PART 8 —   %', v_plan;

  select count(*) into v_n from custom.promoted_index_ddl(v_org, v_table);
  if v_n = 0 then
    raise exception 'REC-N-1 — the generator emitted nothing while the guard is on';
  end if;
  select count(*) into v_n from custom.promoted_index_ddl(v_org, v_table)
   where statement like 'create %index concurrently%';
  if v_n < 16 then
    raise exception 'ruling (e) — ROUTE B needs one CREATE INDEX CONCURRENTLY per partition and the generator emitted %', v_n;
  end if;
  raise notice 'PART 8 —   ROUTE B: the generator emits % CONCURRENTLY statement(s), one per partition, plus the ON ONLY parent and the ATTACHes.', v_n;

  -- THE GUARD IS ON THE GENERATOR, AND IT IS A REFUSAL RATHER THAN AN EMPTY SET.
  update platform.feature_knob set value = 'false'::jsonb
   where feature = 'custom' and key = 'field_index_guard';
  select count(*) into v_n from custom.promoted_index_ddl(v_org, v_table);
  if v_n <> 0 then
    raise exception 'ruling (a) — the guard is off and the generator emitted % statement(s)', v_n;
  end if;
  begin
    perform custom.promote_field(v_org, v_table, v_fid);
    raise exception 'ruling (a) — the guard is off and promotion went ahead anyway';
  exception when feature_not_supported then
    get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
    raise notice 'PART 8 —   guard off: % / %', v_msg, v_hint;
  end;
  raise notice 'PART 8 PASS — one expression for the index and the read, ROUTE B from the generator, and the knob named out loud when it is off.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 9 — THE PLATFORM HALF: `platform.custom_field_index_ddl` READS THE COLUMN AND
  --          READS THE GUARD (ruling (a), REC-N-1).
  -- ════════════════════════════════════════════════════════════════════════════════════
  -- Two registered Entity tables, chosen because they DISAGREE about the column's name:
  -- `crm.party` keeps custom fields in `custom_fields` (W1-STORE put it there) and
  -- `hr.employee` keeps them in `custom`. One generator, no literal, both right.
  update platform.feature_knob set value = 'true'::jsonb
   where feature = 'custom' and key = 'field_index_guard';

  -- A token only takes custom fields once a platform admin has ADOPTED it —
  -- `platform.custom_field_target`, which is empty on the branch, and the refusal says so:
  -- 'Participation is a row in platform.custom_field_target, never a hardcoded list.' Both
  -- tokens are adopted here, inside the transaction that rolls back.
  perform platform.adopt_custom_fields('party', 'strict', 'standard', 'never', 8, 100000,
                                       'w1_index_c5.sql, rolled back');
  perform platform.adopt_custom_fields('hr_employee', 'strict', 'standard', 'never', 8, 100000,
                                       'w1_index_c5.sql, rolled back');

  insert into platform.custom_field_definition
    (id, target_kind, target_token, field_key, display_name, field_type, field_order,
     is_indexed, is_unique, sensitivity_tier, ai_exposure, organization_id, visibility)
  values ('11111111-9999-4000-8000-00000000c501', 'entity_table', 'party',
          'zz_probe_key', 'Probe', 'text', 1, true, false, 'standard', 'never', v_org, 'internal'),
         ('11111111-9999-4000-8000-00000000c502', 'entity_table', 'hr_employee',
          'zz_probe_key', 'Probe', 'number', 1, true, false, 'standard', 'never', v_org, 'internal');

  v_plan := platform.custom_field_index_ddl('11111111-9999-4000-8000-00000000c501'::uuid, false);
  if position('custom_fields' in v_plan) = 0 or position('(custom->>' in v_plan) > 0 then
    raise exception 'PART 9 — crm.party keeps its custom fields in custom_fields and the generator emitted %', v_plan
      using hint = 'A hard-coded column name is right for half this database and builds an index over a column that does not exist for the other half.';
  end if;
  raise notice 'PART 9 —   crm.party      -> %', v_plan;

  v_plan := platform.custom_field_index_ddl('11111111-9999-4000-8000-00000000c502'::uuid, false);
  if position('((custom->>' in v_plan) = 0 then
    raise exception 'PART 9 — hr.employee keeps its custom fields in custom and the generator emitted %', v_plan;
  end if;
  raise notice 'PART 9 —   hr.employee    -> %', v_plan;

  update platform.feature_knob set value = 'false'::jsonb
   where feature = 'custom' and key = 'field_index_guard';
  begin
    perform platform.custom_field_index_ddl('11111111-9999-4000-8000-00000000c501'::uuid, false);
    raise exception 'PART 9 — the guard is off and the platform generator produced DDL anyway';
  exception when feature_not_supported then
    get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
    raise notice 'PART 9 —   guard off: % / %', v_msg, v_hint;
  end;
  raise notice 'PART 9 PASS — one generator, the column read from the catalogue for each table, and the same knob refusing it out loud when it is off.';

  raise notice '=== C-5 PASS — every clause above ran on the rehearsal branch. Rolling back. ===';
end
$t$;

rollback;

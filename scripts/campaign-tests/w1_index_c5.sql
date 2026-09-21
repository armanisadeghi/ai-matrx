-- W1-INDEX — CHECK C-5, THE INDEX AND PROMOTION LAYER, PROVEN ON THE MAIN DATABASE FROM THE
-- SEAT OF A SIGNED-IN PERSON.
--   REC-4 · REC-5 · REC-N-1 · REC-N-2 · REC-N-3 · REC-N-5 · REC-N-12 · DOOR-N-3.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w1_index_c5.sql
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and it ROLLS
-- BACK. Everything it makes — one disposable organization, its home, its Table, its Fields,
-- its 200 records, two knob rows and every index built over them — disappears with it.
--
-- 🚨 RE-POINTED TO THE MAIN DATABASE (lane SEAT-SUITES, 2026-09-19). This file used to refuse
-- to run anywhere but the rehearsal branch. That branch is dead weight — 226 functions in
-- schema `custom` against main's 332, `authenticated` granted 29 of them against main's 103,
-- and no `custom.field_declare` at all, so the store these clauses are about is not there. The
-- owner's 2026-09-18 ruling is that there is no production and everything is the main
-- database, so the guard now names main's system_identifier 7642734024280108049, the fixture
-- is a DISPOSABLE organization rather than Matrx System (a live tenant), and the ceiling and
-- guard knobs are moved inside the transaction that rolls back.
--
-- 🚨 THE SEAT. This suite used to run every clause as the role that OWNS `custom.record`. In
-- that seat `custom.assert_client_may_reach` returns on its first line, EXECUTE grants are
-- free, SECURITY INVOKER and SECURITY DEFINER are the same thing, and `custom.record` is
-- directly readable — so it proved things about the store's internals and nothing about the
-- product. It now takes the seat `authenticated` in PART 0 and runs EVERY CLAUSE A PERSON
-- OWNS through the door that person reaches: a Table is declared with `custom.table_declare`,
-- a column with `custom.field_declare`, `promoted`/`unique` are ASKED FOR through
-- `custom.field_update`, records are written with `custom.record_write`, the columns are read
-- back with `custom.applicable_fields`, the rows with `custom.read_records`, and the capacity
-- answer with `custom.table_capacity`.
--
-- WHAT STEPS OUT OF THE SEAT, AND WHY. `custom.promote_field`, `custom.promoted_fields`,
-- `custom.promoted_index_expr`, `custom.promoted_value_path`, `custom.promoted_query_sql`,
-- `custom.promoted_index_ddl`, `custom.promoted_field_cap`, `custom.table_record_ceiling`,
-- `custom.table_storage` and every `platform.*` generator hold NO grant to `authenticated`
-- and no `platform.client_callable_door` row: building an index is DDL and is a SERVER lane,
-- not a browser's. Each of those steps out with `perform set_config('role', v_boss, true)`,
-- says so in a comment, and asserts no clause about what a PERSON may do while it is out.
--
-- 🚨 THE LOCK. `custom.promote_field` and `custom.promote_table` build indexes on SIXTEEN LIVE
-- hash partitions of `custom.record` and need ACCESS EXCLUSIVE on each, so under traffic they
-- die on a short `lock_timeout`. Every statement that builds an index raises it to 60s and
-- says why. A `deadlock detected` from a concurrent campaign lane doing the same thing is not
-- a failure of a clause — re-run the file.
--
-- WHAT MAKES IT FAIL — THE CHANGE, NAMED (rule 3): delete any arm of
-- `platform.custom_field_index_expr` and PART 1 fails on the arm that lost its EXPLAIN; point
-- `custom.promoted_index_expr` at the bare key for a computed Field and PART 3 fails because
-- the index it builds matches no row that exists; raise `custom.promoted_field_cap()` and
-- PART 5's ninth Field lands; take the `promoted` arm back out of `custom.field_update` and
-- PART 5 fails on the first Field, because nobody can ASK for an indexed column at all.

\set ON_ERROR_STOP on
\timing off

begin;

-- THE FLOOR. Every write in this file lands in `custom.record`, a LIVE table with sixteen hash
-- partitions that other campaign lanes are building indexes on at the same time, and main's
-- default `lock_timeout` is short enough that even the fixture writes lose that race. This is
-- the floor for the whole transaction; the statements that actually build an index raise it
-- again where they stand. MEASURED on main 2026-09-19: `lock_timeout` is 5s and
-- `statement_timeout` is 30s by default, and with three other lanes queued on `custom.record`
-- even inserting this suite's Home record loses on both.
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_table   uuid;
  v_fid     uuid;
  v_fid2    uuid;
  v_arms    text[];
  v_arm     text;
  v_expr    text;
  v_name    text;
  v_plan    text;
  v_n       integer;
  v_nulls   text[] := '{}';
  v_built   text[] := '{}';
  v_json    jsonb;
  v_msg     text;
  v_hint    text;
  v_caught  text;
  v_leading text;
  v_line    text;
  v_uniq    boolean;
  v_texts   jsonb;
  v_part    text;
  v_boss    text := current_user;   -- the connected role, for the server-lane statements below
begin
  if (pg_control_system()).system_identifier <> 7642734024280108049 then
    raise exception 'w1_index_c5.sql runs on the MAIN database only, and this is %',
                    (pg_control_system()).system_identifier;
  end if;

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- THE FIXTURES, as the connected role. A seat is a PERSON, and a person reaches an
  -- organization only through a membership and only where the store is switched on.
  -- ════════════════════════════════════════════════════════════════════════════════════
  -- `platform.associations` refuses an automated write that does not name the system doing
  -- it, and the store's soft delete reaches that table. This suite is a named system.
  perform set_config('app.actor_system', 'campaign-test/w1_index_c5', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Greenline Landscaping Crew', 'greenline-landscaping-' || substr(v_org::text, 1, 8), 'GLC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- Without this the store is off globally and every door refuses a person by name. The
  -- superuser walked past this switch on its first line; `authenticated` does not.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_index_c5');

  -- A Home record has no client door of its own (a Home is made by the onboarding path, not
  -- by a person's browser), so it is written here, before the seat is taken.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- 🚨 `custom/field_index_guard` IS RETIRED, and finding that out is half of what re-pointing
  -- this file at the main database bought. The branch-era version of this suite turned that
  -- knob on at the top and off in PARTS 8 and 9 to watch the generators refuse. On main the
  -- knob row says in its own description: "Nothing reads this knob. Promoting a field,
  -- generating its index DDL, the cap on promoted fields per table and declaring work slots
  -- all follow the organization's own custom/system_enabled, read through
  -- custom.store_is_open (DOOR-FIX, 2026-09-19, defect B1)." MEASURED here: with the knob set
  -- to false the generator still emitted 264 statements, because nothing asks it any more.
  -- So the switch this file turns is the ONE a person actually has — the organization's own
  -- store switch, through `platform.unified_data_store_set`, in PART 9b — and the override
  -- written above IS that switch, on.

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 0 — TAKE THE SEAT AND PROVE IT.
  -- ════════════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART A — THE TABLE, ITS COLUMNS AND ITS ROWS, ALL THROUGH THE DOORS A PERSON REACHES.
  -- This is the part the old file did with nine raw INSERTs into `custom.record`, a table
  -- privilege no signed-in person holds — which is how a Field document could carry a shape
  -- (`promoted`, `unique`) that no door would ever have produced.
  -- ════════════════════════════════════════════════════════════════════════════════════
  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W1-INDEX C5', 'slug', 'greenline_jobs', 'type', 'entity',
    'label_singular', 'Thing', 'label_plural', 'Things', 'title_field', 'code',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    -- The Table declares every field this proof will define, `job_tag_9` included: a Field whose
    -- Table never declared it is refused by `custom._field_shape_guard` before the cap is
    -- reached, and PART 5 would then pass for the wrong reason.
    'fields', jsonb_build_array(jsonb_build_object('name', 'code')) ||
              (select jsonb_agg(jsonb_build_object('name', 'job_tag_' || g)) from generate_series(2, 9) g),
    'parent_id', v_home::text));

  -- A PERSON declares the column, then ASKS for it to be indexed and unique. `promoted` and
  -- `unique` are not something a browser can write into a document: they are a request the
  -- shape door either grants or refuses.
  v_fid := custom.field_declare(v_org, v_table, jsonb_build_object(
    'key', 'code', 'label', 'Code', 'plain', 'text', 'sort', 10));
  perform custom.field_update(v_org, v_fid, jsonb_build_object('promoted', true, 'unique', true));
  if not exists (select 1 from custom.applicable_fields(v_org, v_table, null) f
                  where f.data ->> 'key' = 'code'
                    and (f.data ->> 'promoted')::boolean and (f.data ->> 'unique')::boolean) then
    raise exception 'PART A — a person asked for `code` to be indexed and unique through custom.field_update and the column does not read back that way through custom.applicable_fields'
      using hint = 'That is the third defect this recipe found on 2026-09-19: field_update said yes and changed nothing.';
  end if;

  for v_n in 1..200 loop
    perform custom.record_write(v_org, v_table, jsonb_build_object('code', 'c' || v_n));
  end loop;
  select count(*) into v_n from custom.read_records(v_org, v_table, true, 500, 0);
  if v_n <> 200 then
    raise exception 'PART A — 200 records were written through custom.record_write and the read door hands back %', v_n;
  end if;
  raise notice 'PART A PASS — Table, an indexed unique column asked for through custom.field_update, and 200 records, every one of them through a client door.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 1 — EVERY ARM OF `platform.custom_field_index_expr`, ENUMERATED FROM ITS OWN
  --          SOURCE, AND EVERY NON-NULL ONE PLANNED THROUGH BY `EXPLAIN`.
  --
  -- OUT OF THE SEAT. This part reads `pg_proc.prosrc`, calls a `platform` generator with no
  -- client grant, and issues CREATE INDEX on `custom.record`: all three are operator work, and
  -- no clause here is about what a person may do.
  -- ════════════════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);

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
    'number',       '(((data->>''job_price'')::numeric))',
    'boolean',      '(((data->>''job_price'')::boolean))',
    'currency',     '(((data->''job_price''->>''amount'')::numeric))',
    'multi_select', null,
    'file',         null,
    'text',         '((data->>''job_price''))');

  -- THE LOCK AND THE CLOCK. Each CREATE INDEX below takes ACCESS EXCLUSIVE on all sixteen live
  -- partitions of `custom.record`, so under traffic it dies on the short `lock_timeout` this
  -- database sets; and MEASURED on main 2026-09-19, an index over EVERY row of a live
  -- `custom.record` also blew the `statement_timeout`. The clause is about what the arm
  -- BUILDS, not about how long the build takes, so the timeouts are raised and the probe
  -- indexes are scoped to THIS SUITE'S OWN disposable organization — which is also the
  -- organization the EXPLAIN below asks about, so the planner still has to reach them.
  set local lock_timeout = '10s';
  set local statement_timeout = '60s';

  foreach v_arm in array v_arms loop
    v_expr := platform.custom_field_index_expr(v_arm, 'job_price', 'data');
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
    v_name := 'greenline_index_arm_' || v_arm;
    execute format('create index %I on custom.record (organization_id, %s) where organization_id = %L::uuid and deleted_at is null',
                   v_name, v_expr, v_org);
    v_built := v_built || v_arm;

    -- STATISTICS FIRST. MEASURED on main 2026-09-19: a brand-new organization's rows sit in a
    -- partition whose statistics know nothing about them or about this expression, so the
    -- planner costed the probe index as worthless and reached for `record_pNN_organization_id_idx`
    -- with a Filter instead. One ANALYZE of the ONE partition this organization hashes to is
    -- what makes the question "can the planner reach it" rather than "has anybody measured it".
    select c.relname into v_part
      from custom.record r join pg_class c on c.oid = r.tableoid
     where r.organization_id = v_org limit 1;
    execute format('analyze custom.%I', v_part);

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

  perform set_config('role', 'authenticated', true);

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 2 — RULING (b): THE ENVELOPE REC-N-3 NAMES IS A SHAPE THE STORE REFUSES —
  --          AT THE DOOR A PERSON WRITES THROUGH, which is the only place the refusal
  --          could ever reach anybody. The old file INSERTed it straight into
  --          `custom.record`, so it proved the CHECK constraint and nothing a person meets.
  -- ════════════════════════════════════════════════════════════════════════════════════
  v_caught := null;
  begin
    perform custom.record_write(v_org, v_table, jsonb_build_object(
      'code', 'HARBORVIEW-SPRING-CLEANUP',
      '_values', jsonb_build_object('code', jsonb_build_object('v', 'x'))));
  exception when others then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'PART 2 — the write door accepted a value envelope carrying "v", which is REC-N-3''s literal path. It is supposed to refuse it by name.';
  end if;
  if position('"v"' in v_caught) = 0 and position('v, which is not part' in v_caught) = 0
     and position('_values' in v_caught) = 0 then
    raise exception 'PART 2 — the envelope write was refused, but not for carrying "v": %', v_caught;
  end if;
  raise notice 'PART 2 —   refused at the write door: %', v_caught;
  -- THE SECOND INPUT WITH A DIFFERENT EXPECTED ANSWER, so PART 2 is not a door that refuses
  -- everything: the same call, the same person, the same Table, without the envelope, LANDS.
  if custom.record_write(v_org, v_table, jsonb_build_object('code', 'CEDARBROOK-IRRIGATION-REPAIR')) is null then
    raise exception 'PART 2 — the same write without the envelope was refused too, so the refusal is not about the envelope';
  end if;
  raise notice 'PART 2 PASS — `data -> ''_values'' -> k -> ''v''` is not an empty path, it is a shape the WRITE DOOR refuses by name, and the same write without it lands.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 3 — THE THREE VALUE PATHS THE STORE ACTUALLY KEEPS.
  --
  -- OUT OF THE SEAT. `custom.promoted_value_path` and `custom.promoted_index_expr` decide
  -- WHERE AN INDEX GOES. They hold no client grant and no door row: this is the server lane
  -- reading its own map, and no clause here is about what a person may do.
  -- ════════════════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);

  -- stored
  v_json := jsonb_build_object('key', 'serial_number', 'type', 'text', 'label', 'Stored');
  if custom.promoted_value_path(v_json) <> 'stored'
     or custom.promoted_index_expr(v_json) <> '((data->>''serial_number''))' then
    raise exception 'PART 3 — a stored Field is supposed to be indexed at its own key, and it answered path=% expr=%',
                    custom.promoted_value_path(v_json), custom.promoted_index_expr(v_json);
  end if;
  raise notice 'PART 3 —   stored   -> % -> %', custom.promoted_value_path(v_json), custom.promoted_index_expr(v_json);

  -- computed (compute_on = write): the value lives one level in, under _computed -> key -> value
  v_json := jsonb_build_object('key', 'job_total', 'type', 'text', 'compute_on', 'write');
  v_expr := custom.promoted_index_expr(v_json);
  if custom.promoted_value_path(v_json) <> 'computed'
     or position('_computed' in v_expr) = 0
     or position('''value''' in v_expr) = 0 then
    raise exception 'PART 3 — a compute-on-write Field is supposed to be indexed where its value is kept, and it answered %', v_expr
      using hint = 'REC-N-3: an index over the bare key answers "no rows" for every value that exists.';
  end if;
  raise notice 'PART 3 —   computed -> % -> %', custom.promoted_value_path(v_json), v_expr;

  -- derived (compute_on = read): worked out when somebody reads it, so there is no path at all
  v_json := jsonb_build_object('key', 'crew_hours', 'type', 'text', 'compute_on', 'read');
  if custom.promoted_value_path(v_json) <> 'derived'
     or custom.promoted_index_expr(v_json) is not null then
    raise exception 'PART 3 — a derived Field has no stored value and is supposed to be refused an index, and it answered %',
                    custom.promoted_index_expr(v_json);
  end if;
  raise notice 'PART 3 —   derived  -> derived -> NULL, and the reason is a sentence rather than silence.';
  raise notice 'PART 3 PASS — three paths, and the one that cannot be indexed says so.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 4 — REC-N-1 · REC-N-12: THE PROMOTED INDEX IS SCOPED TO ITS TABLE, WITH
  --          `organization_id` LEADING, AND THE UNIQUE ONE IS REAL.
  --
  -- STILL OUT OF THE SEAT for the build and the catalogue read: `custom.promote_field` holds
  -- NO client grant and no `platform.client_callable_door` row — it is CREATE INDEX, a server
  -- lane, not a browser's. The DUPLICATE at the end goes back INTO the seat, because the
  -- person who is handed that refusal is the one writing the row.
  -- ════════════════════════════════════════════════════════════════════════════════════
  -- THE LOCK, again and for the same reason: sixteen live partitions, ACCESS EXCLUSIVE on each.
  set local lock_timeout = '10s';
  set local statement_timeout = '60s';
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

  perform set_config('role', 'authenticated', true);

  -- The refusal is the database's own, and it reaches A PERSON writing through the write door.
  -- It quotes an index name that person can recognise.
  v_caught := null;
  begin
    perform custom.record_write(v_org, v_table, jsonb_build_object('code', 'c7'));
  exception when others then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'REC-N-12 — a duplicate landed under a unique index, written through the door a person uses';
  end if;
  -- The refusal names the PARTITION's index, because that is the index the row collided in.
  -- It must still carry the parent's name — and therefore the field key a person recognises
  -- — which is exactly what ROUTE A's rename is for. MEASURED before that rename existed:
  -- `duplicate key value violates unique constraint "record_p09_organization_id_expr_idx1"`.
  if position(left(v_name, 52) in v_caught) = 0 then
    raise exception 'REC-N-12 — the duplicate was refused, but not by a name that carries the field: %', v_caught
      using hint = 'The name in the refusal is what a person is handed. An auto-generated partition index name tells them nothing.';
  end if;
  raise notice 'PART 4 —   duplicate refused, from the seat, by the constraint''s own name: %', v_caught;

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 5 — REC-N-5: EIGHT PROMOTED FIELDS PER TABLE, REFUSED BY NAME WHEN THE NINTH
  --          PERSON-MADE REQUEST ARRIVES. Every one of these nine is a PERSON declaring a
  --          column and asking for it to be indexed, through `custom.field_declare` and
  --          `custom.field_update` — the old file wrote nine Field rows straight into
  --          `custom.record` with `promoted` already in them.
  -- ════════════════════════════════════════════════════════════════════════════════════
  for v_n in 2..8 loop
    v_fid2 := custom.field_declare(v_org, v_table, jsonb_build_object(
      'key', 'job_tag_' || v_n, 'label', 'P' || v_n, 'plain', 'text', 'sort', v_n));
    perform custom.field_update(v_org, v_fid2, jsonb_build_object('promoted', true));
  end loop;
  select count(*) into v_n from custom.applicable_fields(v_org, v_table, null) f
   where (f.data ->> 'promoted')::boolean;
  if v_n <> 8 then
    raise exception 'PART 5 — eight columns were asked to be indexed and the read door reports %', v_n;
  end if;

  v_caught := null;
  v_hint := null;
  begin
    v_fid2 := custom.field_declare(v_org, v_table, jsonb_build_object(
      'key', 'job_tag_9', 'label', 'P9', 'plain', 'text', 'sort', 9));
    perform custom.field_update(v_org, v_fid2, jsonb_build_object('promoted', true));
  exception when others then
    get stacked diagnostics v_caught = message_text, v_hint = pg_exception_hint;
  end;
  if v_caught is null then
    perform set_config('role', v_boss, true);
    raise exception 'REC-N-5 — a ninth promoted Field landed on a Table capped at %', custom.promoted_field_cap();
  end if;
  if position('as many as it can have' in v_caught) = 0 then
    raise exception 'REC-N-5 — the ninth Field was refused, but not by the cap: %', v_caught;
  end if;
  raise notice 'PART 5 —   refused: %', v_caught;
  raise notice 'PART 5 —   remedy:  %', coalesce(v_hint, '(no hint)');
  raise notice 'PART 5 PASS — the cap is a refusal a PERSON is handed, in a sentence, the ninth time they ask for a column to be indexed.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 6 — REC-N-5: THE 150,000-RECORD CEILING IS PUBLISHED AS A KNOB, AND THE ANSWER
  --          A PERSON IS SHOWN COMES FROM `custom.table_capacity`, which IS a client door.
  -- ════════════════════════════════════════════════════════════════════════════════════
  v_json := custom.table_capacity(v_org, v_table);
  if (v_json ->> 'ceiling')::integer <> 150000 or (v_json ->> 'over')::boolean then
    raise exception 'REC-N-5 — capacity answered % for a Table of 200 records', v_json;
  end if;
  raise notice 'PART 6 —   from the seat, capacity says: %', v_json ->> 'says';

  -- OUT OF THE SEAT for the published numbers and for writing the override:
  -- `custom.table_record_ceiling` holds no client grant, and `platform.knob_override` is a
  -- table nobody signed in may write.
  perform set_config('role', v_boss, true);
  if custom.table_record_ceiling() <> 150000 then
    raise exception 'REC-N-5 — the published platform ceiling is %, and REC-N-5 publishes 150,000', custom.table_record_ceiling();
  end if;
  if custom.table_record_ceiling(v_org) <> 150000 then
    raise exception 'REC-N-5 — an organization that set nothing is supposed to get the published number, and it got %', custom.table_record_ceiling(v_org);
  end if;
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'table_record_ceiling', 'organization', v_org, v_org, '100'::jsonb, 'w1_index_c5.sql, rolled back')
  on conflict (feature, key, scope_kind, scope_id, organization_id) do update set value = '100'::jsonb;
  if custom.table_record_ceiling(v_org) <> 100 then
    raise exception 'REC-N-5 — the organization set its own ceiling to 100 and the function still answers %', custom.table_record_ceiling(v_org)
      using hint = 'A ceiling no organization can move is a number an agent chose for every customer.';
  end if;
  perform set_config('role', 'authenticated', true);

  -- AND THE PERSON IS TOLD, through the same door, with a different answer than before.
  v_json := custom.table_capacity(v_org, v_table);
  if not (v_json ->> 'over')::boolean then
    raise exception 'REC-N-5 — 200 records against a ceiling of 100 is over, and the door a person reads says %', v_json;
  end if;
  if (v_json ->> 'knob') <> 'custom/table_record_ceiling' then
    raise exception 'REC-N-5 — the answer has to name the knob it read, and it named %', v_json ->> 'knob';
  end if;
  raise notice 'PART 6 —   organization sets 100, and the same door now says: %', v_json ->> 'says';

  perform set_config('role', v_boss, true);
  delete from platform.knob_override
   where feature = 'custom' and key = 'table_record_ceiling' and organization_id = v_org;
  perform set_config('role', 'authenticated', true);
  raise notice 'PART 6 PASS — published default 150,000, organization-settable, and the one answer a PERSON reads names the knob it read.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 7 — REC-4 · REC-5: light -> heavy IS THE CHEAP MIGRATION, and it is a door a
  --          person reaches: `custom.promote_table` IS granted to `authenticated`.
  -- ════════════════════════════════════════════════════════════════════════════════════
  -- OUT for the before-reading only: `custom.table_storage` holds no client grant.
  perform set_config('role', v_boss, true);
  if custom.table_storage(v_org, v_table) <> 'light' then
    raise exception 'REC-4 — a Table that has never said is supposed to be light, and this one is %', custom.table_storage(v_org, v_table);
  end if;
  perform set_config('role', 'authenticated', true);

  -- THE LOCK: promote_table builds one index per promoted Field over sixteen live partitions.
  set local lock_timeout = '10s';
  set local statement_timeout = '60s';
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
  raise notice 'PART 7 PASS — light and heavy are ONE store: the Migration is the index, the bytes never move, and a signed-in person can ask for it.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 8 — DOOR-N-3: THE HOT READ IS A PREPARED STATEMENT OVER THE INDEX'S OWN
  --          EXPRESSION, AND THE GENERATOR IS WHAT THE GUARD GUARDS.
  --
  -- OUT OF THE SEAT for all of it. `custom.promoted_query_sql`, `custom.promoted_index_ddl`
  -- and `custom.promote_field` hold no client grant: this is the server lane reading the SQL
  -- it will run, and the knob it obeys.
  -- ════════════════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);

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

  raise notice 'PART 8 PASS — one expression for the index and the read, and ROUTE B from the generator. The switch that governs both is turned, from the seat, in PART 9b.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 9 — THE PLATFORM HALF: `platform.custom_field_index_ddl` READS THE COLUMN AND
  --          READS THE GUARD (ruling (a), REC-N-1). OUT OF THE SEAT throughout: every
  --          function and table here is platform-admin work.
  -- ════════════════════════════════════════════════════════════════════════════════════
  -- Two registered Entity tables, chosen because they DISAGREE about the column's name:
  -- `crm.party` keeps custom fields in `custom_fields` (W1-STORE put it there) and
  -- `hr.employee` keeps them in `custom`. One generator, no literal, both right.
  -- A token only takes custom fields once a platform admin has ADOPTED it —
  -- `platform.custom_field_target`. MEASURED on main 2026-09-19: `hr_employee` is adopted and
  -- `party` is not, and the refusal says so: 'Participation is a row in
  -- platform.custom_field_target, never a hardcoded list.' Both are adopted here, inside the
  -- transaction that rolls back.
  perform platform.adopt_custom_fields('party', 'strict', 'standard', 'never', 8, 100000,
                                       'w1_index_c5.sql, rolled back');
  perform platform.adopt_custom_fields('hr_employee', 'strict', 'standard', 'never', 8, 100000,
                                       'w1_index_c5.sql, rolled back');

  insert into platform.custom_field_definition
    (id, target_kind, target_token, field_key, display_name, field_type, field_order,
     is_indexed, is_unique, sensitivity_tier, ai_exposure, organization_id, visibility)
  values ('11111111-9999-4000-8000-00000000c501', 'entity_table', 'party',
          'job_price', 'Probe', 'text', 1, true, false, 'standard', 'never', v_org, 'internal'),
         ('11111111-9999-4000-8000-00000000c502', 'entity_table', 'hr_employee',
          'job_price', 'Probe', 'number', 1, true, false, 'standard', 'never', v_org, 'internal');

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

  raise notice 'PART 9 PASS — one generator, the column read from the catalogue for each table.';

  perform set_config('role', 'authenticated', true);

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 9b — ruling (a): THE SWITCH THAT GOVERNS PROMOTION IS THE ORGANIZATION'S OWN
  --           STORE SWITCH, and it is a door a PERSON turns. Both generators and the
  --           promotion itself follow it, and each REFUSES out loud rather than handing
  --           back an empty set that reads like "this Table has no promoted fields".
  -- ════════════════════════════════════════════════════════════════════════════════════
  -- THE SWITCH SCREEN'S OWN DOOR, from the seat: `platform.unified_data_store_set` is granted
  -- to `authenticated`.
  v_json := platform.unified_data_store_set(v_org, false, c_admin, 'w1_index_c5 9b');
  if coalesce((v_json ->> 'switched_on')::boolean, true) is not false then
    raise exception '9b: the store switch door said it turned the store off and it reads on: %', v_json;
  end if;

  -- OUT OF THE SEAT to ask the generators, which are server-lane and hold no client grant.
  perform set_config('role', v_boss, true);
  select count(*) into v_n from custom.promoted_index_ddl(v_org, v_table);
  if v_n <> 0 then
    raise exception 'ruling (a) — the organization''s store is off and the generator emitted % statement(s)', v_n;
  end if;
  v_caught := null;
  begin
    perform custom.promote_field(v_org, v_table, v_fid);
  exception when others then
    get stacked diagnostics v_caught = message_text, v_hint = pg_exception_hint;
  end;
  if v_caught is null then
    raise exception 'ruling (a) — the organization''s store is off and promotion went ahead anyway';
  end if;
  if v_caught not ilike '%switched off%' and v_caught not ilike '%system_enabled%' then
    raise exception 'ruling (a) — promotion was refused, but not by naming the store switch: %', v_caught;
  end if;
  raise notice 'PART 9b —   promotion refused: % / %', v_caught, coalesce(v_hint, '(no hint)');
  v_caught := null;
  begin
    perform platform.custom_field_index_ddl('11111111-9999-4000-8000-00000000c501'::uuid, false);
  exception when others then
    get stacked diagnostics v_caught = message_text, v_hint = pg_exception_hint;
  end;
  if v_caught is null then
    raise exception 'PART 9b — the organization''s store is off and the platform generator produced DDL anyway'
      using hint = 'GUARD-SWITCH 2026-09-19: this is the fifth reader of the retired knob, the one DOOR-FIX B1 did not move.';
  end if;
  raise notice 'PART 9b —   platform generator refused: % / %', v_caught, coalesce(v_hint, '(no hint)');
  perform set_config('role', 'authenticated', true);

  -- AND BACK ON, through the same door, with a different expected answer — so 9b is not a
  -- switch that refuses everything for ever.
  v_json := platform.unified_data_store_set(v_org, true, c_admin, 'w1_index_c5 9b control');
  if not coalesce((v_json ->> 'switched_on')::boolean, false) then
    raise exception '9b: the switch door said it turned the store on and it reads off: %', v_json;
  end if;
  if not coalesce((platform.unified_data_store_state(v_org) ->> 'switched_on')::boolean, false) then
    raise exception '9b: the switch door says this organization is off and it was just switched on';
  end if;
  perform set_config('role', v_boss, true);
  select count(*) into v_n from custom.promoted_index_ddl(v_org, v_table);
  perform set_config('role', 'authenticated', true);
  if v_n = 0 then
    raise exception '9b: the store is back on and the generator still emits nothing';
  end if;
  raise notice 'PART 9b PASS — the organization''s own store switch, turned from the seat, is what governs promotion, both generators and the cap; off it is a refusal that names the switch, on it emits % statement(s) again.', v_n;

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 10 — THE NEGATIVE CLAUSE, AS A REAL SECOND PERSON.
  -- `test@test.com` is a member of this organization and was shared nothing. Every refusal
  -- above is a STORE RULE; this one is the ACCESS question, which the old seat could not ask
  -- at all: as the owner of `custom.record`, `custom.assert_client_may_reach` returned true
  -- on its first line for every organization on this database.
  -- ════════════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 10a. She cannot add a column to a Table she is not an admin of.
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_table, jsonb_build_object(
      'key', 'crew_note', 'label', 'Sneaked in', 'plain', 'text', 'sort', 99));
  exception when others then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception '10a: test@test.com added a column to a Table she is not an admin of';
  end if;
  raise notice 'PART 10 —   she is refused the shape change: %', v_caught;

  -- 10b. Nor ask for one to be indexed.
  v_caught := null;
  begin
    perform custom.field_update(v_org, v_fid, jsonb_build_object('promoted', false));
  exception when others then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception '10b: test@test.com un-promoted a column on a Table she is not an admin of';
  end if;
  raise notice 'PART 10 —   she is refused the index request: %', v_caught;

  -- 10c. THE CONTROL, so 10a and 10b are not a door that refuses her everything: the Table she
  --      IS a member of, she reads — its rows and its columns, through the same doors.
  select count(*) into v_n from custom.read_records(v_org, v_table, true, 10, 0);
  if v_n <> 10 then
    raise exception '10c: the member who was refused the shape change cannot read the rows either, so the refusals above prove nothing (% rows)', v_n;
  end if;
  select count(*) into v_n from custom.applicable_fields(v_org, v_table, null);
  if v_n < 8 then
    raise exception '10c: she reads % of the Table''s columns', v_n;
  end if;
  raise notice 'PART 10 PASS — a member who is not an admin is refused the shape and the index request, and still reads % rows and % columns through the same doors.', 10, v_n;

  perform set_config('request.jwt.claims', c_admin_j, true);

  raise notice '=== C-5 PASS — every clause above ran on the MAIN database, every clause a PERSON owns from the seat `authenticated`, and this transaction rolls back. ===';
end
$t$;

rollback;

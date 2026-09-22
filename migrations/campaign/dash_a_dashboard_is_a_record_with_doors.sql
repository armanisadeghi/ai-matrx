-- target: branch,production
-- additive: yes
--   It ADDS eight new functions under this lane's reserved prefix `custom.dashboard_*`,
--   their `platform.client_callable_door` rows, and nothing else. No table, column, trigger,
--   policy or grant is touched; nothing existing is replaced, dropped or revoked; no row is
--   rewritten. A dashboard is stored as a `custom.record` of a new `data_class`, so no
--   business-shaped table is created and the provisioner is not involved.
--   The inverse is `migrations/inverse/dash_a_dashboard_is_a_record_with_doors_down.sql`.
-- guard: custom/system_enabled
--
-- LANE DASHBOARDS — PRODUCTS row 3, *"Show me jobs by stage this month and what's stuck."*
-- Champions: Airtable Interfaces (a chart is bound to a view and drills through to the
-- records it counts) and Linear Insights (one filter set across every panel on the view).
-- Contract rows: SCR-15 ChartBlock, SCR-16 DashboardCanvas, AGT-N-8 `record_aggregate`,
-- DOOR-10 "never post-filtered".
--
-- ════════════════════════════════════════════════════════════════════════════════
-- A DASHBOARD IS A RECORD. IT IS NOT A TABLE, AND IT IS NOT A PACKAGE'S PRIVATE FILE.
-- ════════════════════════════════════════════════════════════════════════════════
--
-- `@ai-matrx/records-ui` shipped dashboards as rows of a package-owned system Table called
-- `records_ui_dashboard`, declared into whichever organization happened to open the screen.
-- That is the same second store lane FORMS found and removed for forms on 2026-09-20, and
-- it costs the same three things every time:
--
--   · **Nothing else can see them.** An agent asked for a dashboard cannot write one,
--     because the Table it would have to write into is a shape only that screen knows.
--   · **The rules live in TypeScript.** Which chart kinds exist, what a block may measure,
--     whether a grouping names a real Field — all of it is checked in a browser that the
--     caller controls, and not at all on the way in.
--   · **The organization ends up with a stray Table** in its own Tables list, which a person
--     can open, edit and break, and whose rows are JSON strings of somebody else's schema.
--
-- So a Dashboard here is a `custom.record` with `data_class = 'dashboard'` living under the
-- **Presentation kernel** — the kernel this platform already minted for exactly this kind of
-- object and has never used. Everything the store does to a record it now does to a
-- dashboard for free and without a line of code: Visibility, sharing, History with an
-- author on every version, comments, the change feed, export, soft delete and restore.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- WHAT A BLOCK IS, AND WHY IT IS VALIDATED HERE RATHER THAN DRAWN OPTIMISTICALLY
-- ════════════════════════════════════════════════════════════════════════════════
--
--   {"title": "Jobs by stage",
--    "kind": "column",                 ← number | bar | column | line | donut | table | stuck
--    "table_id": "…",                  ← absent means the dashboard's own subject Table
--    "group_by": ["stage"],
--    "bucket": {"key": "created_at", "by": "month"},
--    "measures": [{"op": "count"}, {"op": "sum", "key": "amount"}],
--    "filter": {"stage": "open",
--               "created_at": {"from": "2026-09-01", "to": "2026-10-01"}},
--    "limit": 50, "span": 6}
--
-- and the seventh kind, which is a LIST and not a chart:
--
--   {"title": "Stuck", "kind": "stuck", "state_key": "stage", "days": 14}
--
-- `custom.dashboard_block_normalize` refuses an unknown kind, an unknown measure, an
-- unknown bucket, a group that names no Field of that Table, a stuck block with no state
-- Field and a window that is not a window — every one of them BY NAME, with the real keys
-- in the hint. A block that cannot be drawn is refused when it is WRITTEN, not silently
-- rendered as an empty frame that reads like "there is no data" the first time somebody
-- looks at it a month later.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- THE RUNG, AND WHY READING IS NOT THE SAME ACT AS WRITING
-- ════════════════════════════════════════════════════════════════════════════════
--
-- Declaring a dashboard is ADMIN on its subject Table — the rung `custom.form_declare` and
-- `custom.rule_declare` already ask for, because all three publish something about a Table
-- that everyone in the organization then sees.
--
-- RUNNING one is VIEWER, and the numbers are the caller's own. `custom.dashboard_run` does
-- not compute anything itself: it hands every block to `custom.record_aggregate`, whose
-- visibility predicate sits in the same WHERE as the filter and below the aggregate node.
-- So a member who has been shared eleven of a Table's two hundred records opens the
-- organization's dashboard and sees ELEVEN — not two hundred, and not a refusal. That is
-- the whole product: one dashboard, and every person's own honest answer on it.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- WHY `dashboard_run` EXISTS AT ALL, RATHER THAN THE SCREEN ASKING ONCE PER BLOCK
-- ════════════════════════════════════════════════════════════════════════════════
--
-- Lane LATENCY measured a round trip from a laptop to this database at 223 ms. An
-- eight-block canvas that asks per block is eight round trips — about two seconds of
-- nothing but network, before a single row is read — and it is eight chances for two
-- blocks to disagree because a record was written between them. `custom.dashboard_run`
-- answers the WHOLE canvas in ONE call and ONE snapshot, which is what makes Linear
-- Insights' "one filter set across every panel" an honest statement rather than eight
-- panels that each fetched separately.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ─────────────────────────────────────────────────────────────────────────────
-- The closed vocabularies, as the only copy (rule 15 — no literals in a gate).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.dashboard_kinds()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$ select array['number', 'bar', 'column', 'line', 'donut', 'table', 'stuck']::text[] $fn$;

comment on function custom.dashboard_kinds() is
  'SCR-15: the closed set of block shapes. A shape nobody drew is not offered, so a screen '
  'never has to render a kind it does not know.';

create or replace function custom.dashboard_class()
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $fn$ select 'dashboard'::text $fn$;

comment on function custom.dashboard_class() is
  'SCR-16: the data_class a dashboard record carries. One copy, so the declaring door and '
  'every reader cannot drift the way custom.agg_subscriptions drifted from record_write.';

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.dashboard_field_keys — the Field keys of one Table, for refusing by name.
--
-- It reads `custom.applicable_fields`, the door every other Field reader uses, so a block
-- and a grid can never disagree about what a column is called.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.dashboard_field_keys(p_organization_id uuid, p_table_id uuid)
returns text[]
language sql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
  select coalesce(array_agg(f.data ->> 'key' order by f.data ->> 'key'), '{}'::text[])
    from custom.applicable_fields(p_organization_id, p_table_id, null) f
   where nullif(f.data ->> 'key', '') is not null;
$fn$;

comment on function custom.dashboard_field_keys(uuid, uuid) is
  'DASHBOARDS: the Field keys of one Table, read through custom.applicable_fields so a '
  'block names the same columns the grid does. Used only to refuse a typo BY NAME.';

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.dashboard_block_normalize — one block, judged and given its defaults.
--
-- WHAT IT REFUSES, and each refusal names the thing and offers the real ones:
--   · a kind that is not a kind                      22023
--   · a measure or bucket the aggregate door refuses 22023 (asked of ITS vocabulary, not a copy)
--   · a group, measure, bucket or filter key that is no Field of that Table   22023
--   · a `stuck` block with no state Field, or a non-positive number of days   22004
--   · anything that is not an object                                         22004
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.dashboard_block_normalize(
  p_organization_id uuid,
  p_subject_table_id uuid,
  p_block jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_kind   text;
  v_table  uuid;
  v_keys   text[];
  v_groups jsonb := '[]'::jsonb;
  v_meas   jsonb := '[]'::jsonb;
  v_bucket jsonb := null;
  v_filter jsonb := '{}'::jsonb;
  v_key    text;
  v_op     text;
  v_by     text;
  m        jsonb;
  v_days   integer;
  v_state  text;
  v_out    jsonb;
begin
  if p_block is null or jsonb_typeof(p_block) is distinct from 'object' then
    raise exception 'A dashboard block has to be written down before it can be saved.'
      using errcode = '22004',
            hint = 'SCR-15: a block is {"title": …, "kind": "column", "group_by": ["stage"], "measures": [{"op":"count"}]}.';
  end if;

  v_kind := lower(btrim(coalesce(p_block ->> 'kind', 'number')));
  if not (v_kind = any (custom.dashboard_kinds())) then
    raise exception 'custom.dashboard_declare: "%" is not a shape a block can take', v_kind
      using errcode = '22023',
            hint = format('The shapes are %s.', array_to_string(custom.dashboard_kinds(), ', '));
  end if;

  -- A block may look at ANOTHER Table — "jobs by stage" beside "invoices by month" is one
  -- canvas. Absent means the dashboard's own subject, which is what almost every block is.
  v_table := coalesce(nullif(p_block ->> 'table_id', '')::uuid, p_subject_table_id);
  if v_table is null then
    raise exception 'A dashboard block has to say which table it is about.'
      using errcode = '22004',
            hint = 'Either the dashboard names a subject table or the block names its own table_id.';
  end if;

  -- The caller must be able to KNOW this Table before a block over it is saved. Otherwise a
  -- dashboard could be used to find out that a Table exists, which is the leak VIS-5 closes.
  perform custom.assert_may_know_table(p_organization_id, v_table, 'custom.dashboard_declare');

  v_keys := custom.dashboard_field_keys(p_organization_id, v_table);

  -- ── the groups ──────────────────────────────────────────────────────────────
  for v_key in select (e #>> '{}') from jsonb_array_elements(coalesce(p_block -> 'group_by', '[]'::jsonb)) e loop
    perform custom.agg_assert_key(v_key);
    if not (v_key = any (v_keys)) then
      raise exception 'custom.dashboard_declare: this table has no field called "%", so a block cannot group by it', v_key
        using errcode = '22023',
              hint = format('Its fields are %s.', array_to_string(v_keys, ', '));
    end if;
    v_groups := v_groups || to_jsonb(v_key);
  end loop;

  -- ── the measures, judged against the AGGREGATE DOOR's own vocabulary ────────
  for m in select e from jsonb_array_elements(coalesce(p_block -> 'measures', '[]'::jsonb)) e loop
    v_op := lower(coalesce(m ->> 'op', 'count'));
    if not (v_op = any (custom.agg_operations())) then
      raise exception 'custom.dashboard_declare: "%" is not something a block can measure', v_op
        using errcode = '22023',
              hint = format('Legal measures: %s.', array_to_string(custom.agg_operations(), ', '));
    end if;
    if v_op = 'count' then
      v_meas := v_meas || jsonb_build_object('op', 'count');
    else
      v_key := custom.agg_assert_key(m ->> 'key');
      if not (v_key = any (v_keys)) then
        raise exception 'custom.dashboard_declare: this table has no field called "%", so a block cannot measure it', v_key
          using errcode = '22023',
                hint = format('Its fields are %s.', array_to_string(v_keys, ', '));
      end if;
      v_meas := v_meas || jsonb_build_object('op', v_op, 'key', v_key);
    end if;
  end loop;
  if jsonb_array_length(v_meas) = 0 then
    -- A group with no measure is a question nobody asks. Same default as AGT-N-8's door.
    v_meas := jsonb_build_array(jsonb_build_object('op', 'count'));
  end if;

  -- ── the bucket ──────────────────────────────────────────────────────────────
  if p_block -> 'bucket' is not null and jsonb_typeof(p_block -> 'bucket') = 'object' then
    v_key := custom.agg_assert_key(p_block -> 'bucket' ->> 'key');
    v_by  := lower(coalesce(p_block -> 'bucket' ->> 'by', 'month'));
    if not (v_by = any (custom.agg_buckets())) then
      raise exception 'custom.dashboard_declare: "%" is not a period a line can run along', v_by
        using errcode = '22023',
              hint = format('Legal buckets: %s.', array_to_string(custom.agg_buckets(), ', '));
    end if;
    if v_key <> 'created_at' and not (v_key = any (v_keys)) then
      raise exception 'custom.dashboard_declare: this table has no field called "%", so a block cannot run along it', v_key
        using errcode = '22023',
              hint = format('Its fields are %s, and created_at is always available.', array_to_string(v_keys, ', '));
    end if;
    v_bucket := jsonb_build_object('key', v_key, 'by', v_by);
  end if;

  -- ── the filter, equality or a window, checked against the SAME field list ───
  if p_block -> 'filter' is not null and jsonb_typeof(p_block -> 'filter') = 'object' then
    for v_key in select k from jsonb_object_keys(p_block -> 'filter') k loop
      perform custom.agg_assert_key(v_key);
      if v_key not in ('created_at', 'updated_at') and not (v_key = any (v_keys)) then
        raise exception 'custom.dashboard_declare: this table has no field called "%", so a block cannot filter on it', v_key
          using errcode = '22023',
                hint = format('Its fields are %s, and created_at and updated_at are always available.', array_to_string(v_keys, ', '));
      end if;
      if jsonb_typeof(p_block -> 'filter' -> v_key) = 'object' then
        -- Built here and thrown away: this is the window's OWN validation, run at write
        -- time so "start" instead of "from" is a sentence now rather than a total quietly
        -- over all of time later.
        perform custom.dashboard_window_sql(v_key, p_block -> 'filter' -> v_key);
      end if;
    end loop;
    v_filter := p_block -> 'filter';
  end if;

  v_out := jsonb_build_object(
    'title', coalesce(nullif(btrim(coalesce(p_block ->> 'title', '')), ''), initcap(v_kind)),
    'kind', v_kind,
    'table_id', v_table,
    'group_by', v_groups,
    'measures', v_meas,
    'bucket', v_bucket,
    'filter', v_filter,
    'limit', greatest(least(coalesce(nullif(p_block ->> 'limit', '')::integer, 50), 500), 1),
    'span', greatest(least(coalesce(nullif(p_block ->> 'span', '')::integer, 6), 12), 2));

  -- ── the seventh kind: a LIST of what has not moved ──────────────────────────
  if v_kind = 'stuck' then
    v_state := nullif(btrim(coalesce(p_block ->> 'state_key', '')), '');
    if v_state is null then
      raise exception 'A "stuck" block has to say which field it is watching for a change.'
        using errcode = '22004',
              hint = format('Send state_key with one of this table''s fields: %s.', array_to_string(v_keys, ', '));
    end if;
    perform custom.agg_assert_key(v_state);
    if not (v_state = any (v_keys)) then
      raise exception 'custom.dashboard_declare: this table has no field called "%", so nothing can be stuck on it', v_state
        using errcode = '22023',
              hint = format('Its fields are %s.', array_to_string(v_keys, ', '));
    end if;
    v_days := coalesce(nullif(p_block ->> 'days', '')::integer, 14);
    if v_days < 1 then
      raise exception 'A "stuck" block counts whole days, so it needs at least one.'
        using errcode = '22023',
              hint = 'days is how long a record may sit on the same value before it counts as stuck. 14 is the default.';
    end if;
    v_out := v_out || jsonb_build_object('state_key', v_state, 'days', v_days);
  end if;

  return v_out;
end;
$fn$;

comment on function custom.dashboard_block_normalize(uuid, uuid, jsonb) is
  'SCR-15: one block, judged against the aggregate door''s own vocabularies and the subject '
  'Table''s own Fields, and given its defaults. A block that cannot be drawn is refused when '
  'it is written, by name, rather than drawn as an empty frame a month later.';

-- NO CLIENT LANE FOR custom.dashboard_block_normalize OR custom.dashboard_field_keys — but
-- BOTH ARE STILL DECLARED, because `provision_shape_guard` is right: a SECURITY DEFINER
-- function runs as `postgres` with BYPASSRLS, and somebody has to say IN DATA who may call
-- it. "No client, ever" is an access decision and it is written down as one.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'dashboard_field_keys',
        'p_organization_id uuid, p_table_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id and p_table_id are never checked here because this function is never reached with a caller''s arguments: its two callers are custom.dashboard_block_normalize and nothing else, and that function has already run custom.assert_may_know_table against the very same pair before calling it. It reads no record of the Table — only the Field keys custom.applicable_fields answers, and only so that a typo can be refused by name.',
        'dash_a_dashboard_is_a_record_with_doors.sql',
        'server_only: it is the judging half of custom.dashboard_declare and custom.dashboard_run, both of which have already decided access against the same organization and Table before calling it; no client ever needs a list of Field keys from a separate round trip, and giving one would be a second way to learn a Table exists.',
        false, false)
on conflict do nothing;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'dashboard_block_normalize',
        'p_organization_id uuid, p_subject_table_id uuid, p_block jsonb',
        array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[],
        'p_organization_id and the table the block names are both checked by custom.assert_may_know_table, which asks custom.assert_client_may_reach first, so a table id from another tenant reads as absent and is refused; NULL on either is refused there. It writes nothing, executes nothing from the block, reads no record of that Table, and returns only the caller''s own block with defaults filled in.',
        'dash_a_dashboard_is_a_record_with_doors.sql',
        'server_only: it is called by custom.dashboard_declare on the way in and by custom.dashboard_run on the way out, each of which has already taken its own access decision; a client reaches the same judgement, with the same refusals by name, through custom.dashboard_declare, which is where a person is standing when a block is wrong.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.dashboard_declare — the ONE way a dashboard comes into existence.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.dashboard_declare(
  p_organization_id uuid,
  p_table_id uuid,
  p_name text,
  p_blocks jsonb default '[]'::jsonb,
  p_presentation jsonb default '{}'::jsonb,
  p_dashboard_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_blocks jsonb := '[]'::jsonb;
  v_name   text;
  v_doc    jsonb;
  v_id     uuid;
  b        jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.dashboard_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboard_declare');

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null then
    raise exception 'A dashboard has to be called something.'
      using errcode = '22004',
            hint = 'SCR-16: the name is what a person clicks to switch between dashboards.';
  end if;

  if p_table_id is null then
    raise exception 'A dashboard has to say what it is a dashboard about.'
      using errcode = '22004',
            hint = 'p_table_id names the Table most of its blocks ask about. A single block may still name another table_id of its own.';
  end if;

  -- SAME RUNG AS A FORM AND A RULE, AND FOR THE SAME REASON: this publishes something
  -- about a Table that everybody in the organization then sees on that Table's own page.
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.dashboard_declare',
                                          'admin'::public.permission_level, 'table');

  if jsonb_typeof(coalesce(p_blocks, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'A dashboard''s blocks are a list.'
      using errcode = '22004',
            hint = 'Send [] for a dashboard with no blocks yet, or a list of block objects.';
  end if;

  for b in select e from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) e loop
    v_blocks := v_blocks || custom.dashboard_block_normalize(p_organization_id, p_table_id, b);
  end loop;

  v_doc := jsonb_build_object(
    'name', v_name,
    'subject_table_id', p_table_id,
    'blocks', v_blocks,
    'presentation', case when jsonb_typeof(coalesce(p_presentation, '{}'::jsonb)) = 'object'
                         then coalesce(p_presentation, '{}'::jsonb) else '{}'::jsonb end);

  if p_dashboard_id is null then
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, custom.presentation_kernel_id(), custom.dashboard_class(), v_doc)
    returning id into v_id;
    return v_id;
  end if;

  -- RE-STATING A DASHBOARD, not patching one. The whole document moves at once so a save
  -- that dropped a block cannot half-land, and the version moves so History names who did
  -- it — the same shape custom.form_declare's update arm has.
  update custom.record
     set data = v_doc, updated_at = now(), version = version + 1
   where organization_id = p_organization_id
     and id = p_dashboard_id
     and table_id = custom.presentation_kernel_id()
     and data_class = custom.dashboard_class()
     and deleted_at is null
  returning id into v_id;
  if v_id is null then
    raise exception 'There is no dashboard % in this organization.', p_dashboard_id
      using errcode = '23503',
            hint = 'A dashboard id from another organization reads as absent — organizations are hard walls (REC-29).';
  end if;
  return v_id;
end;
$fn$;

comment on function custom.dashboard_declare(uuid, uuid, text, jsonb, jsonb, uuid) is
  'SCR-16: the ONE door a dashboard comes through. A dashboard is a custom.record of class '
  'dashboard under the Presentation kernel, so Visibility, History, sharing, comments and '
  'the change feed apply to it for free. Admin on the subject Table, like a form and a Rule.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'dashboard_declare',
        'p_organization_id uuid, p_table_id uuid, p_name text, p_blocks jsonb, p_presentation jsonb, p_dashboard_id uuid',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'jsonb'::regtype,
              'jsonb'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door and then by custom.assert_client_may_reach on entry; NULL is refused there. p_table_id is checked by custom.assert_client_may_change at the ADMIN rung against THIS organization, so a table id from another tenant reads as absent and is refused. Every block is judged by custom.dashboard_block_normalize, which asks custom.assert_may_know_table for any table_id the block names and refuses every group, measure, bucket, filter and state key that is not a declared Field of that Table, BY NAME. Nothing in p_blocks or p_presentation is executed: the block is stored as data and is re-judged by the same function every time it is run. p_dashboard_id is matched together with the organization, the Presentation kernel and the dashboard class, so another tenant''s record is absent.',
        'dash_a_dashboard_is_a_record_with_doors.sql',
        null, true, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.dashboards — the list, narrowed the way custom.forms is narrowed.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.dashboards(p_organization_id uuid, p_table_id uuid default null)
returns table(dashboard_id uuid, table_id uuid, name text, blocks jsonb,
              presentation jsonb, block_count integer, version integer,
              created_at timestamptz, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboards');
  return query
    select d.id,
           nullif(d.data ->> 'subject_table_id', '')::uuid,
           d.data ->> 'name',
           coalesce(d.data -> 'blocks', '[]'::jsonb),
           coalesce(d.data -> 'presentation', '{}'::jsonb),
           jsonb_array_length(coalesce(d.data -> 'blocks', '[]'::jsonb)),
           d.version,
           d.created_at,
           d.updated_at
      from custom.record d
     where d.organization_id = p_organization_id
       and d.table_id = custom.presentation_kernel_id()
       and d.data_class = custom.dashboard_class()
       and d.deleted_at is null
       -- THE DASHBOARD RECORD'S OWN VISIBILITY. It is a record, so sharing one is sharing
       -- a record and nothing here had to invent a second answer for it.
       and d.id in (select v from custom.query_visible_ids(p_organization_id,
                                                           custom.presentation_kernel_id()) v)
       -- AND ONLY OVER TABLES THIS CALLER CAN ALREADY OPEN, so the dashboard list is not a
       -- second way to learn that a Table exists (VIS-5, the same wall custom.forms has).
       and nullif(d.data ->> 'subject_table_id', '')::uuid
             in (select v from custom.query_visible_ids(p_organization_id,
                                                        custom.table_kernel_id()) v)
       and (p_table_id is null or nullif(d.data ->> 'subject_table_id', '')::uuid = p_table_id)
     order by d.created_at desc;
end;
$fn$;

comment on function custom.dashboards(uuid, uuid) is
  'SCR-16: an organization''s dashboards, narrowed twice — to the dashboard records this '
  'caller may see, and within those to the Tables this caller can already open. It returns '
  'no number and no record: the numbers come from custom.dashboard_run, under the '
  'caller''s own principal.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'dashboards',
        'p_organization_id uuid, p_table_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. The rows are narrowed twice: to dashboard records in custom.query_visible_ids for THIS caller, and to dashboards whose subject Table is in custom.query_visible_ids for this caller — so neither a dashboard nor a Table can be learned about through this door, and a p_table_id from another tenant returns zero rows. It returns the saved blocks and no number computed over any record.',
        'dash_a_dashboard_is_a_record_with_doors.sql',
        null, true, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.dashboard_stuck — THE SEVENTH SHAPE. Not a chart: a list of what has not moved.
--
-- *"…and what's stuck"* is the second half of the product's own sentence, and it is the
-- half no chart library has ever answered, because it is not an aggregate — it is a page of
-- real records, ordered by how long they have sat still.
--
-- HOW "NO CHANGE IN N DAYS" IS MEASURED, AND WHAT IT FALLS BACK TO. Every Value this store
-- writes carries its own envelope, and `_values.<key>.at` is the moment THAT value was last
-- written — so "the stage has not changed in fourteen days" is read off the record itself
-- and needs no history scan. A record whose state Field has no envelope yet (written before
-- provenance, or imported) falls back to `updated_at`, which is the honest second-best: the
-- last time anything on it moved. The answer SAYS which of the two it used, per row, so
-- nobody has to guess whether a date means what they think it means.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.dashboard_stuck(
  p_organization_id uuid,
  p_table_id uuid,
  p_state_key text,
  p_days integer default 14,
  p_filter jsonb default '{}'::jsonb,
  p_limit integer default 50,
  p_required text default 'viewer'::text)
returns table(record_id uuid, title text, state text, last_changed_at timestamptz,
              days_unchanged numeric, measured_from text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_key     text;
  v_state   text;
  v_title   text;
  v_when    text;
  v_from    text;
  v_where   text[] := '{}';
  v_sql     text;
  v_titlek  text;
  v_days    integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboard_stuck');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.dashboard_stuck');

  v_key  := custom.agg_assert_key(p_state_key);
  v_days := greatest(coalesce(p_days, 14), 1);

  -- The state as a person reads it — through the same value reader every other door uses,
  -- so a Value envelope is unwrapped exactly once in this store and not twice.
  v_state := custom.agg_value_sql(v_key);

  -- WHEN IT LAST MOVED, and where that moment came from.
  v_when := format(
    'coalesce(nullif(r.data -> ''_values'' -> %L ->> ''at'', '''')::timestamptz, r.updated_at)',
    v_key);
  v_from := format(
    'case when nullif(r.data -> ''_values'' -> %L ->> ''at'', '''') is null '
    'then ''the record''''s own last change'' else ''the moment this field was last written'' end',
    v_key);

  -- The title the Table itself declares, so the list reads like the grid does. A Table with
  -- no title_field has rows with no name, and the list says null rather than inventing one.
  select nullif(t.data ->> 'title_field', '') into v_titlek
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id();
  v_title := case when v_titlek is null then 'null::text' else custom.agg_value_sql(v_titlek) end;

  -- The same filter vocabulary the aggregate door takes: a scalar is an equality, an object
  -- is a window. One reading of a filter on this platform, not two.
  if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
    for v_key in select k from jsonb_object_keys(p_filter) k loop
      if jsonb_typeof(p_filter -> v_key) = 'object' then
        v_where := array_append(v_where, custom.dashboard_window_sql(v_key, p_filter -> v_key));
      else
        v_where := array_append(v_where,
          format('%s = %L', custom.agg_value_sql(v_key), p_filter ->> v_key));
      end if;
    end loop;
  end if;

  -- ONE STATEMENT, and Visibility is a predicate in its own WHERE — the same shape
  -- custom.agg_sql builds, for the same reason (DOOR-10, READ-PERF): the rows this person
  -- may not see are never fetched, so they cannot be listed and then hidden.
  v_sql := format($q$
    select r.id,
           (%s)::text as title,
           (%s)::text as state,
           (%s) as last_changed_at,
           round(extract(epoch from (now() - (%s))) / 86400.0, 1)::numeric as days_unchanged,
           (%s)::text as measured_from
      from custom.record r
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %s
       and (%s) < (now() - make_interval(days => %s))
       %s
     order by (%s) asc
     limit %s
  $q$,
    v_title, v_state, v_when, v_when, v_from,
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                 p_required::public.permission_level, 'r'),
    v_when, v_days,
    case when cardinality(v_where) = 0 then '' else 'and ' || array_to_string(v_where, ' and ') end,
    v_when,
    greatest(least(coalesce(p_limit, 50), 500), 1));

  return query execute v_sql;
end;
$fn$;

comment on function custom.dashboard_stuck(uuid, uuid, text, integer, jsonb, integer, text) is
  'SCR-15 / PRODUCTS row 3: the records that have sat on the same value of one Field for '
  'longer than N days. Measured off the Value envelope''s own `at`, falling back to the '
  'record''s updated_at and SAYING which it used. Visibility is a predicate in the same '
  'WHERE, so an invisible record is never fetched and then hidden.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'dashboard_stuck',
        'p_organization_id uuid, p_table_id uuid, p_state_key text, p_days integer, p_filter jsonb, p_limit integer, p_required text',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'int4'::regtype,
              'jsonb'::regtype, 'int4'::regtype, 'text'::regtype]::oid[],
        'p_organization_id and p_table_id are checked by custom.assert_may_know_table, which asks custom.assert_client_may_reach first; a table from another tenant reads as absent. p_state_key and every key of p_filter go through custom.agg_assert_key, which refuses anything that is not a field identifier BY SHAPE before it reaches format, and every value is placed with quote_literal or as a validated timestamptz — never concatenated. The visibility predicate from custom.visible_predicate_sql sits in the statement''s own WHERE, so the rows this caller may not see are never read. It returns at most 500 rows and no field of a record other than its title and the one state field named.',
        'dash_a_dashboard_is_a_record_with_doors.sql',
        null, true, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.dashboard_run — the WHOLE canvas, in ONE call, under the caller's own principal.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.dashboard_run(
  p_organization_id uuid,
  p_dashboard_id uuid,
  p_filter jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_doc     jsonb;
  v_name    text;
  v_subject uuid;
  v_out     jsonb := '[]'::jsonb;
  v_rows    jsonb;
  v_block   jsonb;
  v_merged  jsonb;
  v_started timestamptz;
  b         jsonb;
  k         text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboard_run');

  select d.data into v_doc
    from custom.record d
   where d.organization_id = p_organization_id
     and d.id = p_dashboard_id
     and d.table_id = custom.presentation_kernel_id()
     and d.data_class = custom.dashboard_class()
     and d.deleted_at is null;
  if v_doc is null then
    raise exception 'There is no dashboard % in this organization.', p_dashboard_id
      using errcode = '02000',
            hint = 'A dashboard id from another organization reads as absent — organizations are hard walls (REC-29).';
  end if;

  -- READING A DASHBOARD IS VIEWER ON THE DASHBOARD RECORD, asked of the one ladder. The
  -- NUMBERS are a separate question and are asked again, per block, under this same
  -- principal — which is why a member shared eleven of two hundred records sees eleven.
  perform custom.assert_client_may_change(p_organization_id, p_dashboard_id, 'custom.dashboard_run',
                                          'viewer'::public.permission_level, 'dashboard');

  v_name    := v_doc ->> 'name';
  v_subject := nullif(v_doc ->> 'subject_table_id', '')::uuid;

  for b in select e from jsonb_array_elements(coalesce(v_doc -> 'blocks', '[]'::jsonb)) e loop
    -- RE-JUDGED ON THE WAY OUT, NOT TRUSTED BECAUSE IT WAS JUDGED ON THE WAY IN. A Field
    -- can be deleted or renamed after a block was saved, and a block that names a column
    -- that no longer exists must SAY so rather than raise from inside a generated statement.
    begin
      v_block := custom.dashboard_block_normalize(p_organization_id, v_subject, b);
    exception when others then
      v_out := v_out || jsonb_build_object(
        'title', coalesce(b ->> 'title', 'Block'),
        'kind', coalesce(b ->> 'kind', 'number'),
        'refused', sqlerrm,
        'sqlstate', sqlstate);
      continue;
    end;

    -- ONE FILTER BAR ACROSS EVERY PANEL (SCR-16, Linear Insights). The canvas's filter is
    -- merged over each block's own, and the block's own wins on a key they share — so a
    -- block that was deliberately scoped to one stage stays scoped while the bar moves the
    -- rest of the canvas.
    v_merged := coalesce(v_block -> 'filter', '{}'::jsonb);
    if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
      for k in select kk from jsonb_object_keys(p_filter) kk loop
        if not (v_merged ? k) then
          v_merged := v_merged || jsonb_build_object(k, p_filter -> k);
        end if;
      end loop;
    end if;

    v_started := clock_timestamp();
    begin
      if v_block ->> 'kind' = 'stuck' then
        select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_rows
          from custom.dashboard_stuck(p_organization_id,
                                      (v_block ->> 'table_id')::uuid,
                                      v_block ->> 'state_key',
                                      (v_block ->> 'days')::integer,
                                      v_merged,
                                      (v_block ->> 'limit')::integer,
                                      'viewer') s;
      else
        select coalesce(jsonb_agg(jsonb_build_object('groups', a.groups,
                                                     'measures', a.measures,
                                                     'row_count', a.row_count)), '[]'::jsonb)
          into v_rows
          from custom.record_aggregate(p_organization_id,
                                       (v_block ->> 'table_id')::uuid,
                                       coalesce(v_block -> 'group_by', '[]'::jsonb),
                                       coalesce(v_block -> 'measures', '[]'::jsonb),
                                       v_block -> 'bucket',
                                       v_merged,
                                       (v_block ->> 'limit')::integer,
                                       'viewer') a;
      end if;
    exception when others then
      -- NOTHING FAILS SILENTLY: one block that refuses is one block that says why, and the
      -- other seven still answer. A canvas that went blank because one Field was renamed
      -- would be the screen telling a lie about the whole organization.
      v_out := v_out || (v_block || jsonb_build_object('refused', sqlerrm, 'sqlstate', sqlstate));
      continue;
    end;

    v_out := v_out || (v_block || jsonb_build_object(
      'rows', v_rows,
      'filter', v_merged,
      'ms', round(extract(epoch from (clock_timestamp() - v_started)) * 1000.0, 1)));
  end loop;

  return jsonb_build_object(
    'dashboard_id', p_dashboard_id,
    'name', v_name,
    'subject_table_id', v_subject,
    'presentation', coalesce(v_doc -> 'presentation', '{}'::jsonb),
    'filter', coalesce(p_filter, '{}'::jsonb),
    'blocks', v_out);
end;
$fn$;

comment on function custom.dashboard_run(uuid, uuid, jsonb) is
  'SCR-16: the WHOLE canvas in ONE call and ONE snapshot — eight blocks are eight aggregates '
  'inside one transaction rather than eight round trips that can disagree. Every block is '
  'answered by custom.record_aggregate (or custom.dashboard_stuck) under the CALLER''S OWN '
  'principal, so two people open the same dashboard and each sees their own honest numbers. '
  'One block that refuses says why and the rest still answer.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'dashboard_run',
        'p_organization_id uuid, p_dashboard_id uuid, p_filter jsonb',
        array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. The dashboard is matched together with the organization, the Presentation kernel and the dashboard class, so another tenant''s record is absent, and the caller is then checked by custom.assert_client_may_change at the VIEWER rung against the dashboard record itself. Every number is computed by custom.record_aggregate or custom.dashboard_stuck under the CALLER''S OWN principal, whose visibility predicate sits in the same WHERE as the filter and below the aggregate node — so the answer is over exactly the records this caller may see and no other row is ever fetched. Every block is re-judged by custom.dashboard_block_normalize before it runs; nothing stored in the document is executed. p_filter goes through the same validation as a stored filter.',
        'dash_a_dashboard_is_a_record_with_doors.sql',
        null, true, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.dashboard_delete — through the store's own delete, not a second one.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.dashboard_delete(p_organization_id uuid, p_dashboard_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_exists boolean;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.dashboard_delete');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboard_delete');

  select true into v_exists
    from custom.record d
   where d.organization_id = p_organization_id
     and d.id = p_dashboard_id
     and d.table_id = custom.presentation_kernel_id()
     and d.data_class = custom.dashboard_class()
     and d.deleted_at is null;
  if not coalesce(v_exists, false) then
    raise exception 'There is no dashboard % in this organization.', p_dashboard_id
      using errcode = '02000',
            hint = 'It may already have been removed. A dashboard id from another organization reads as absent (REC-29).';
  end if;

  -- ADMIN ON THE DASHBOARD ITSELF, which is the rung the store asks for throwing a record
  -- away anywhere else. Removing a dashboard removes nothing else: the records it counted
  -- are untouched, which is the whole reason a dashboard is safe to make.
  perform custom.assert_client_may_change(p_organization_id, p_dashboard_id, 'custom.dashboard_delete',
                                          'admin'::public.permission_level, 'dashboard');

  update custom.record
     set deleted_at = now(), updated_at = now()
   where organization_id = p_organization_id
     and id = p_dashboard_id
     and deleted_at is null;
  return true;
end;
$fn$;

comment on function custom.dashboard_delete(uuid, uuid) is
  'SCR-16: a soft delete of the dashboard record, at the ADMIN rung on the dashboard itself. '
  'The records it counted are untouched — that is what makes a dashboard safe to throw away.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'dashboard_delete',
        'p_organization_id uuid, p_dashboard_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door and then by custom.assert_client_may_reach on entry; NULL is refused there. The dashboard is matched together with the organization, the Presentation kernel and the dashboard class, so another tenant''s record is absent, and the caller is then checked by custom.assert_client_may_change at the ADMIN rung against the dashboard record itself. It soft-deletes exactly that one row and touches no record of any other table.',
        'dash_a_dashboard_is_a_record_with_doors.sql',
        null, true, false)
on conflict do nothing;

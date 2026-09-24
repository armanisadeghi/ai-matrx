-- target: branch,production
-- additive: yes
--   It REPLACES two functions of schema `custom` (`dashboard_block_normalize`, `dashboard_run`) with
--   their existing signatures, security and search_path, keeping every existing branch, and adds one
--   SECURITY INVOKER helper (`dashboard_target_field_assert`). What changes: a block target may name
--   a goal column instead of a fixed number. No table, column, trigger, policy or grant is touched;
--   no row of anybody's data is written; a fixed-number target answers exactly as before.
-- guard: custom/system_enabled
-- lane: S3
-- lock: custom
-- based-on: custom.dashboard_block_normalize(uuid, uuid, jsonb) 327b9588847703903a0079b364b784c20d275c0ced3a325b52aa4e1bf5c785c0
-- based-on: custom.dashboard_run(uuid, uuid, jsonb, jsonb, text) 511d16a4413fbe74a1db93f63f66ad0565f8e32cefa4d17a08a0062141ef9f97
--
-- LANE S3 (UI-CHAMPIONS-PLAN rev 2, row 18) — A TARGET READ FROM A GOAL COLUMN.
--
-- ORDER: after uichamp_s3_a_number_knows_last_month_and_its_target.sql and its grant (the
-- based-on lines name that file's bodies, so it is refused by name on a database S3 has not
-- reached). Independent of S2-PRIME's follow-up, which touches record_aggregate / agg_sql only.
-- Same signatures (CREATE OR REPLACE), so every grant stays; one new internal helper (SECURITY
-- INVOKER; it only refuses). Inverse: migrations/inverse/uichamp_s3_a_target_can_be_read_from_a_goal_column_down.sql.
--
-- THE USE CASE. Rincon Plumbing Co quotes every job before the truck rolls. The owner's question
-- on the 23rd is not only "how much have we invoiced" but "how much of what we QUOTED have we
-- invoiced" — the realization number every trade business watches, because a job invoiced under
-- its quote is margin given away. The goal is not one number somebody typed into the dashboard; it
-- is a column on the Jobs table ("Quoted"), different for every job and every month. Linear
-- Insights and Metabase let a goal be a fixed number; Airtable's interface goals and Salesforce
-- report goals also read it from a field. Now the store does both.
--
-- WHAT CHANGES
--   1. A block's target is `{"value": 25000, …}` (unchanged) OR `{"field": "quoted_total",
--      "op": "sum" | "avg" | "min" | "max", …}` — exactly one of the two, judged by name on the
--      way in: a column the table does not have, both at once, `op` on a fixed number, an `op`
--      that is not one of the four, and `per: "bucket"` with a column (one goal for the whole
--      window; the chart still draws its even share per bucket as the pace) are each refused.
--   2. `custom.dashboard_run` reads the goal column through `custom.record_aggregate` over exactly
--      the records the block's own number read — the same merged filter, the same current window
--      (a compared block's comparison, with the bucket's date when it names none), the same reader
--      — so "invoiced against quoted" is about the same jobs. The answer's `target.value` is that
--      goal; `progress` and `pace` follow from it as they did from a fixed number.
--   3. A reader who may not read the goal column (its sensitivity asks more than the level she
--      holds on the Table, floored at viewer — every record an aggregate counts passed viewer) is
--      refused THE TARGET by the column's own name (`target.refused`), and the block still draws
--      its number. `custom.dashboard_target_field_assert` is that one test.
--
-- LOCKS. create function, create or replace function, comment: catalogue only. Nothing
-- on custom.record; no row of anybody's data is written. Not window-class.

create function custom.dashboard_target_field_assert(p_organization_id uuid, p_table_id uuid, p_field_key text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- SECURITY INVOKER on purpose: it only ever refuses, and its one caller (custom.dashboard_run)
-- is a definer, so it reads as that door does. Called directly, it runs as the caller under RLS
-- and can tell her nothing about a column she could not already ask about.
declare
  v_me    uuid := custom.query_principal();
  v_field uuid;
  v_label text;
  v_level public.permission_level;
begin
  -- The server lane carries no principal and reads every column, exactly as its aggregate does.
  if v_me is null then
    return;
  end if;
  select f.id, coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key')
    into v_field, v_label
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and f.data ->> 'key' = p_field_key
   limit 1;
  if v_field is null then
    raise exception 'This table has no column called "%", so a target cannot be read from it.', p_field_key
      using errcode = '22023', hint = 'Give the target a fixed value, or name a column this table has.';
  end if;
  -- The FLOOR of what this reader holds on the records the goal adds up: every one of them
  -- passed the aggregate's own `viewer` test, and the Table's level lifts them all. A column
  -- whose sensitivity asks for more than that is a column some of those records would hide.
  v_level := coalesce(custom.effective_level(v_me, p_organization_id, p_table_id), 'viewer'::public.permission_level);
  if not iam.may_touch_field(v_me, v_field, p_organization_id, v_level, 'read') then
    raise exception 'You cannot read the % column of this table, so it cannot be this block''s target.', v_label
      using errcode = '42501',
            hint = 'Ask somebody who is Admin on the table to move you up, or give the target a fixed number.';
  end if;
end;
$function$;

comment on function custom.dashboard_target_field_assert(uuid, uuid, text) is
  'S3: a block target read from a goal column is refused, by the column''s own name, when the caller could not read that column on the records the goal adds up (the table level, floored at viewer, against the column''s sensitivity). Server lane: no principal, no check.';


CREATE OR REPLACE FUNCTION custom.dashboard_block_normalize(p_organization_id uuid, p_subject_table_id uuid, p_block jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  v_cmp    jsonb;
  v_tgt    jsonb;
  v_mkeys  text[] := '{}';
  v_mk     text;
  v_per    text;
  v_value  numeric;
  v_label  text;
  v_field  text;
  v_top    text;
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
      v_mkeys := array_append(v_mkeys, 'count');
    else
      v_key := custom.agg_assert_key(m ->> 'key');
      if not (v_key = any (v_keys)) then
        raise exception 'custom.dashboard_declare: this table has no field called "%", so a block cannot measure it', v_key
          using errcode = '22023',
                hint = format('Its fields are %s.', array_to_string(v_keys, ', '));
      end if;
      v_meas := v_meas || jsonb_build_object('op', v_op, 'key', v_key);
      v_mkeys := array_append(v_mkeys, v_op || '_' || v_key);
    end if;
  end loop;
  if jsonb_array_length(v_meas) = 0 then
    -- A group with no measure is a question nobody asks. Same default as AGT-N-8's door.
    v_meas := jsonb_build_array(jsonb_build_object('op', 'count'));
    v_mkeys := array['count'];
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

  -- ── S3: the comparison this block makes ────────────────────────────────────
  if p_block ? 'compare' and jsonb_typeof(p_block -> 'compare') <> 'null' then
    if v_kind = 'stuck' then
      raise exception 'A "not moving" block lists records; it has no period to compare with another.'
        using errcode = '22023', hint = 'Leave compare off this block, or make it a number, line or column block.';
    end if;
    if jsonb_typeof(p_block -> 'compare') <> 'object' then
      raise exception 'A block''s comparison is written as an object, such as {"against": "previous_period", "period": "month"}.'
        using errcode = '22023', hint = format('against is one of %s.', array_to_string(custom.agg_compare_kinds(), ', '));
    end if;
    v_cmp := p_block -> 'compare';
    v_key := coalesce(nullif(btrim(coalesce(v_cmp ->> 'key', '')), ''), v_bucket ->> 'key');
    if v_key is null then
      raise exception 'This block has no date to compare along.'
        using errcode = '22004',
              hint = format('Give its comparison a key — a date field of this table (%s) or created_at — or give the block a bucket.', array_to_string(v_keys, ', '));
    end if;
    perform custom.agg_assert_key(v_key);
    if v_key not in ('created_at', 'updated_at') and not (v_key = any (v_keys)) then
      raise exception 'custom.dashboard_declare: this table has no field called "%", so a block cannot compare along it', v_key
        using errcode = '22023',
              hint = format('Its fields are %s, and created_at and updated_at are always available.', array_to_string(v_keys, ', '));
    end if;
    v_cmp := v_cmp || jsonb_build_object('key', v_key);
    -- Judged by the SAME function the run uses, so a block that saves is a block that runs.
    perform custom.agg_compare_windows(p_organization_id, v_cmp, v_bucket);
    v_out := v_out || jsonb_build_object('compare', v_cmp);
  end if;

  -- ── S3: the target this block is measured against ──────────────────────────
  -- A target is a FIXED NUMBER ({"value": 25000}) or A GOAL COLUMN ({"field": "quoted_total"}):
  -- the same Table's Field, added up over exactly the records the block's own number reads
  -- (the same filter, the same window, the same reader), so "invoiced against quoted" is one
  -- tile. Exactly one of the two.
  if p_block ? 'target' and jsonb_typeof(p_block -> 'target') <> 'null' then
    if v_kind = 'stuck' then
      raise exception 'A "not moving" block lists records; there is no total for a target to measure.'
        using errcode = '22023', hint = 'Put the target on a number, line or column block.';
    end if;
    v_tgt := p_block -> 'target';
    if jsonb_typeof(v_tgt) <> 'object' then
      raise exception 'A target is written as an object, such as {"value": 120000, "label": "Monthly target"} or {"field": "quoted_total", "label": "Quoted"}.'
        using errcode = '22023', hint = 'A target has: value or field, op, label, measure, per.';
    end if;
    for v_mk in select k from jsonb_object_keys(v_tgt) k loop
      if v_mk not in ('value', 'field', 'op', 'label', 'measure', 'per') then
        raise exception '"%" is not part of a target', v_mk
          using errcode = '22023', hint = 'A target has: value or field, op, label, measure, per.';
      end if;
    end loop;
    v_field := nullif(btrim(coalesce(v_tgt ->> 'field', '')), '');
    if v_field is not null and v_tgt ? 'value' and jsonb_typeof(v_tgt -> 'value') <> 'null' then
      raise exception 'A target is a number or a column, and this one names both.'
        using errcode = '22023', hint = 'Keep value (a fixed number, such as 25000) or field (a column of this table that holds the goal), not both.';
    end if;
    if v_field is null then
      if v_tgt ? 'op' then
        raise exception 'op belongs to a target read from a column; a fixed number has nothing to add up.'
          using errcode = '22023', hint = 'Leave op off, or give the target a field instead of a value.';
      end if;
      begin
        v_value := case when jsonb_typeof(v_tgt -> 'value') in ('number', 'string') then (v_tgt ->> 'value')::numeric end;
      exception when others then
        v_value := null;
      end;
      if v_value is null then
        raise exception 'A target needs a number to aim at, or a column that holds it.'
          using errcode = '22023', hint = 'value is the number this block''s measure is aiming for, such as 120000; field is a column of this table that holds the goal, such as quoted_total.';
      end if;
    else
      perform custom.agg_assert_key(v_field);
      if not (v_field = any (v_keys)) then
        raise exception 'custom.dashboard_declare: this table has no field called "%", so a target cannot be read from it', v_field
          using errcode = '22023',
                hint = format('Its fields are %s.', array_to_string(v_keys, ', '));
      end if;
      v_top := lower(coalesce(nullif(btrim(coalesce(v_tgt ->> 'op', '')), ''), 'sum'));
      if v_top not in ('sum', 'avg', 'min', 'max') then
        raise exception '"%" is not how a goal column is added up', v_top
          using errcode = '22023', hint = 'op is sum (the goals of every record added together — the default), avg, min or max.';
      end if;
      -- WHO may read the goal column is asked where it is READ (custom.dashboard_run), per
      -- reader: this function also re-judges every block on the way out, and a column one
      -- reader may not see must cost that reader the target, never the whole block.
    end if;
    v_mk := coalesce(nullif(btrim(coalesce(v_tgt ->> 'measure', '')), ''), v_mkeys[1]);
    if not (v_mk = any (v_mkeys)) then
      raise exception 'This block does not measure "%", so a target cannot be set on it', v_mk
        using errcode = '22023', hint = format('This block measures %s.', array_to_string(v_mkeys, ', '));
    end if;
    v_per := lower(coalesce(nullif(btrim(coalesce(v_tgt ->> 'per', '')), ''), 'period'));
    if v_per not in ('period', 'bucket') then
      raise exception '"%" is not what a target can be per', v_per
        using errcode = '22023', hint = 'per is "period" (the whole window — a monthly target) or "bucket" (every bar or point — a weekly target on a weekly chart).';
    end if;
    if v_per = 'bucket' and v_bucket is null then
      raise exception 'A target per bucket needs a block that has buckets.'
        using errcode = '22023', hint = 'Give the block a bucket, or set per to "period".';
    end if;
    if v_per = 'bucket' and v_field is not null then
      raise exception 'A target read from a column is one number for the whole window, so it cannot be per bucket.'
        using errcode = '22023', hint = 'Set per to "period" (the chart draws its even share per bucket), or give a fixed value per bucket.';
    end if;
    v_label := coalesce(nullif(btrim(coalesce(v_tgt ->> 'label', '')), ''), 'Target');
    if length(v_label) > 80 then
      raise exception 'A target''s label is a few words, and this one is % characters.', length(v_label)
        using errcode = '22023', hint = 'Keep it to 80 characters: "Monthly target", "Goal", "Budget".';
    end if;
    v_out := v_out || jsonb_build_object('target',
      case when v_field is null
           then jsonb_build_object('value', v_value, 'label', v_label, 'measure', v_mk, 'per', v_per)
           else jsonb_build_object('field', v_field, 'op', v_top, 'label', v_label, 'measure', v_mk, 'per', v_per) end);
  end if;

  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.dashboard_run(p_organization_id uuid, p_dashboard_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_compare jsonb DEFAULT NULL::jsonb, p_grain text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc     jsonb;
  v_name    text;
  v_subject uuid;
  v_out     jsonb := '[]'::jsonb;
  v_rows    jsonb;
  v_block   jsonb;
  v_merged  jsonb;
  v_started timestamptz;
  v_grain   text;
  v_cmp     jsonb;
  v_windows jsonb;
  v_note    text;
  v_extra   jsonb;
  v_tgt     jsonb;
  v_mk      text;
  v_op      text;
  v_cur     numeric;
  v_pri     numeric;
  v_additive boolean;
  v_tval    numeric;
  v_tnote   text;
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

  v_name    := v_doc ->> 'name';
  v_subject := nullif(v_doc ->> 'subject_table_id', '')::uuid;

  -- READING A DASHBOARD IS KNOWING ITS TABLE, and nothing more, because a dashboard holds no
  -- record: every number below is produced by custom.record_aggregate under THIS caller's own
  -- principal, and this caller could ask that door the same question about the same Table
  -- directly. Asking about the dashboard RECORD instead protected nothing and, under
  -- custom/member_default_visibility = shared_only, refused an organization's own members
  -- their own organization's dashboard (measured 2026-09-20).
  perform custom.assert_may_know_table(p_organization_id, v_subject, 'custom.dashboard_run');

  -- S3: THE CANVAS'S DATE GRAIN AND COMPARISON, judged once for the whole run — a picker that
  -- sends a grain the store does not cut is the caller's mistake, not eight blocks' mistakes.
  v_grain := lower(nullif(btrim(coalesce(p_grain, '')), ''));
  if v_grain is not null and not (v_grain = any (custom.agg_buckets())) then
    raise exception '"%" is not a date grain', v_grain
      using errcode = '22023',
            hint = format('A dashboard can be cut by %s.', array_to_string(custom.agg_buckets(), ', '));
  end if;
  if p_compare is not null and jsonb_typeof(p_compare) <> 'null' then
    perform custom.agg_compare_windows(p_organization_id,
      case when jsonb_typeof(p_compare) = 'object' and not (p_compare ? 'key')
           then p_compare || '{"key": "created_at"}'::jsonb else p_compare end, null);
  end if;

  for b in select e from jsonb_array_elements(coalesce(v_doc -> 'blocks', '[]'::jsonb)) e loop
    -- RE-JUDGED ON THE WAY OUT, NOT TRUSTED BECAUSE IT WAS JUDGED ON THE WAY IN. A Field
    -- can be deleted or renamed after a block was saved, and a block naming a Table THIS
    -- caller may not know is refused here by the same wall — so a canvas that reaches
    -- somebody else's Table loses that ONE block and answers the rest.
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
    -- merged over each block's own, and the block's own wins on a key they share.
    v_merged := coalesce(v_block -> 'filter', '{}'::jsonb);
    if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
      for k in select kk from jsonb_object_keys(p_filter) kk loop
        if not (v_merged ? k) then
          v_merged := v_merged || jsonb_build_object(k, p_filter -> k);
        end if;
      end loop;
    end if;

    -- S3: the canvas's grain re-cuts every bucketed block; the block's own comparison wins over
    -- the canvas's, as its own filter does.
    if v_grain is not null and jsonb_typeof(v_block -> 'bucket') = 'object' then
      v_block := jsonb_set(v_block, '{bucket,by}', to_jsonb(v_grain));
    end if;
    v_cmp := null; v_windows := null; v_note := null;
    if v_block ->> 'kind' <> 'stuck' then
      v_cmp := coalesce(v_block -> 'compare',
                        case when p_compare is not null and jsonb_typeof(p_compare) = 'object' then p_compare end);
      if v_cmp is not null and nullif(v_cmp ->> 'key', '') is null
         and jsonb_typeof(v_block -> 'bucket') is distinct from 'object' then
        v_note := 'This block has no date to compare along, so it shows this period alone. Give it a bucket, or give its comparison a date field.';
        v_cmp := null;
      end if;
    end if;

    v_started := clock_timestamp();
    begin
      if v_cmp is not null then
        v_windows := custom.agg_compare_windows(p_organization_id, v_cmp,
                       case when jsonb_typeof(v_block -> 'bucket') = 'object' then v_block -> 'bucket' end);
      end if;
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
        select coalesce(jsonb_agg(
                 jsonb_build_object('groups', a.groups, 'measures', a.measures, 'row_count', a.row_count)
                 || case when v_cmp is null then '{}'::jsonb else jsonb_build_object(
                      'prior_groups', a.prior_groups, 'prior_measures', a.prior_measures,
                      'prior_row_count', a.prior_row_count, 'delta', a.delta,
                      'position', a.compare -> 'position') end), '[]'::jsonb)
          into v_rows
          from custom.record_aggregate(p_organization_id,
                                       (v_block ->> 'table_id')::uuid,
                                       coalesce(v_block -> 'group_by', '[]'::jsonb),
                                       coalesce(v_block -> 'measures', '[]'::jsonb),
                                       v_block -> 'bucket',
                                       v_merged,
                                       (v_block ->> 'limit')::integer,
                                       'viewer',
                                       v_cmp) a;
      end if;
    exception when others then
      -- NOTHING FAILS SILENTLY: one block that refuses is one block that says why, and the
      -- other seven still answer. A canvas that went blank because one Field was renamed
      -- would be the screen telling a lie about the whole organization.
      v_out := v_out || (v_block || jsonb_build_object('refused', sqlerrm, 'sqlstate', sqlstate));
      continue;
    end;

    -- ── S3: the totals and the target, worked out HERE from the rows the store just answered,
    -- so the tile, the chart and the ring can never disagree with each other ─────────────
    v_extra := '{}'::jsonb;
    if v_block ->> 'kind' <> 'stuck' then
      v_tgt := v_block -> 'target';
      v_mk := coalesce(v_tgt ->> 'measure',
                       case when (v_block -> 'measures' -> 0 ->> 'op') = 'count' or (v_block -> 'measures' -> 0 ->> 'op') is null
                            then 'count' else (v_block -> 'measures' -> 0 ->> 'op') || '_' || (v_block -> 'measures' -> 0 ->> 'key') end);
      v_op := split_part(v_mk, '_', 1);
      -- A total across groups is a sum only for a measure that adds up; an average of averages
      -- is not the average, so a one-row answer is the only total such a measure has.
      v_additive := v_op in ('count', 'sum', 'filled', 'empty');
      if v_additive or jsonb_array_length(v_rows) = 1 then
        select sum(case when jsonb_typeof(r -> 'measures' -> v_mk) = 'number' then (r -> 'measures' ->> v_mk)::numeric end),
               sum(case when jsonb_typeof(r -> 'prior_measures' -> v_mk) = 'number' then (r -> 'prior_measures' ->> v_mk)::numeric end)
          into v_cur, v_pri
          from jsonb_array_elements(v_rows) r;
        v_cur := coalesce(v_cur, case when v_additive then 0 end);
        if v_cmp is not null then
          v_pri := coalesce(v_pri, case when v_additive then 0 end);
        else
          v_pri := null;
        end if;
        v_extra := v_extra || jsonb_build_object('totals', jsonb_build_object(
          'measure', v_mk, 'current', v_cur, 'prior', v_pri,
          'change', v_cur - v_pri,
          'change_pct', case when v_pri is null or v_cur is null or v_pri = 0 then null
                             else round((v_cur - v_pri) / abs(v_pri) * 100, 1) end));
      else
        v_cur := null;
      end if;
      if v_tgt is not null then
        -- S3: A TARGET READ FROM A GOAL COLUMN is that column added up over exactly the records
        -- this block's own number read — the same merged filter, the same current window, the
        -- same reader through the same door — so the goal and the number cannot disagree about
        -- which jobs they are about. A column this reader may not read refuses the TARGET by
        -- name and the block still draws its number.
        v_tval := null; v_tnote := null;
        if v_tgt ? 'field' then
          begin
            perform custom.dashboard_target_field_assert(p_organization_id, (v_block ->> 'table_id')::uuid, v_tgt ->> 'field');
            select case when jsonb_typeof(a.measures -> ((v_tgt ->> 'op') || '_' || (v_tgt ->> 'field'))) = 'number'
                        then (a.measures ->> ((v_tgt ->> 'op') || '_' || (v_tgt ->> 'field')))::numeric end
              into v_tval
              from custom.record_aggregate(p_organization_id,
                                           (v_block ->> 'table_id')::uuid,
                                           '[]'::jsonb,
                                           jsonb_build_array(jsonb_build_object('op', v_tgt ->> 'op', 'key', v_tgt ->> 'field')),
                                           null,
                                           v_merged,
                                           1,
                                           'viewer',
                                           case when v_cmp is null then null
                                                else v_cmp || jsonb_build_object('key',
                                                       coalesce(nullif(v_cmp ->> 'key', ''), v_block -> 'bucket' ->> 'key')) end) a
             limit 1;
            if v_tval is null and v_tgt ->> 'op' = 'sum' then v_tval := 0; end if;
          exception when others then
            v_tval := null;
            v_tnote := sqlerrm;
          end;
        else
          v_tval := (v_tgt ->> 'value')::numeric;
        end if;
        v_extra := v_extra || jsonb_build_object('target', v_tgt || jsonb_build_object(
          'value', v_tval,
          'current', v_cur,
          'progress', case when v_cur is null or v_tval is null or v_tval = 0 then null
                           else round(v_cur / v_tval, 4) end,
          'pace', case
            when v_tval is null then null
            when jsonb_typeof(v_block -> 'bucket') is distinct from 'object' then null
            when v_tgt ->> 'per' = 'bucket' then v_tval
            when coalesce((v_windows ->> 'bucket_count')::integer, 0) > 0
              then round(v_tval / (v_windows ->> 'bucket_count')::integer, 2)
            else null end)
          || case when v_tnote is null then '{}'::jsonb else jsonb_build_object('refused', v_tnote) end);
      end if;
    end if;

    v_out := v_out || (v_block || v_extra || jsonb_build_object(
      'rows', v_rows,
      'filter', v_merged,
      'compare', v_windows,
      'ms', round(extract(epoch from (clock_timestamp() - v_started)) * 1000.0, 1))
      || case when v_note is null then '{}'::jsonb else jsonb_build_object('compare_refused', v_note) end);
  end loop;

  return jsonb_build_object(
    'dashboard_id', p_dashboard_id,
    'name', v_name,
    'subject_table_id', v_subject,
    'presentation', coalesce(v_doc -> 'presentation', '{}'::jsonb),
    'filter', coalesce(p_filter, '{}'::jsonb),
    'grain', v_grain,
    'compare', case when jsonb_typeof(p_compare) = 'object' then p_compare end,
    'calendar', custom.agg_calendar(p_organization_id),
    'blocks', v_out);
end;
$function$;


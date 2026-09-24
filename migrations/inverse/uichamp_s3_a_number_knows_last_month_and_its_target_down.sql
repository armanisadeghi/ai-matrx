-- chair-step: the inverse of uichamp_s3_a_number_knows_last_month_and_its_target.sql. It DROPS
--   the widened `custom.record_aggregate` (9 arguments), `custom.dashboard_run` (5) and
--   `custom.agg_sql` (9) and CREATES each again byte for byte as the main database held it before
--   (2026-09-23), re-points the two `platform.client_callable_door` rows at the old identities,
--   puts `custom.dashboard_block_normalize` back, drops the nine helper functions and deletes the
--   two knob rows. WHAT IT UNDOES: a comparison, a date-grain override and a target are refused
--   again ("function … does not exist" for the new arguments); buckets are cut in UTC with ISO
--   weeks and answer Postgres's `timestamptz::text` again. WHAT IT DOES NOT UNDO: a saved block's
--   `compare` and `target` keys stay in the dashboard document — they are that organization's own
--   data, and the old normalizer simply does not echo them. An organization's override of
--   custom/time_zone or custom/week_start is deleted with the knob (the knob row cascades nothing
--   else; delete the override first if the knob refuses). The grant file's inverse runs FIRST;
--   this file then re-opens the signed-in lane on the two older doors.
-- lane: S3
-- lock: custom,platform
-- based-on: custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb) f8e6cc4fa4f54c43f19785397ded0dadc2cda824bf8a5545abfaf37e30dc7e3c
-- based-on: custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb) 02cd908334062135eaa14bb1ad6707f7f53f85561f4fd4a009404ecaf42758b1
-- based-on: custom.dashboard_run(uuid, uuid, jsonb, jsonb, text) 511d16a4413fbe74a1db93f63f66ad0565f8e32cefa4d17a08a0062141ef9f97
-- based-on: custom.dashboard_block_normalize(uuid, uuid, jsonb) 327b9588847703903a0079b364b784c20d275c0ced3a325b52aa4e1bf5c785c0

set local lock_timeout = '5s';
set local statement_timeout = '120s';

drop function custom.dashboard_run(uuid, uuid, jsonb, jsonb, text);
drop function custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb);
drop function custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb);

CREATE OR REPLACE FUNCTION custom.agg_sql(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_group_sel  text[] := '{}';
  v_group_lbl  text[] := '{}';
  v_meas_sel   text[] := '{}';
  v_key        text;
  v_op         text;
  v_by         text;
  m            jsonb;
  v_sql        text;
  v_val        text;
begin
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.record_aggregate: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  for v_key in select (e #>> '{}') from jsonb_array_elements(coalesce(p_group_by, '[]'::jsonb)) e loop
    v_group_sel := array_append(v_group_sel, custom.agg_value_sql(v_key));
    v_group_lbl := array_append(v_group_lbl, quote_literal(custom.agg_assert_key(v_key)));
  end loop;

  if p_bucket is not null and jsonb_typeof(p_bucket) = 'object' then
    v_key := custom.agg_assert_key(p_bucket ->> 'key');
    v_by  := lower(coalesce(p_bucket ->> 'by', 'month'));
    if not (v_by = any (custom.agg_buckets())) then
      raise exception 'custom.record_aggregate: "%" is not a bucket', v_by
        using errcode = '22023',
              hint = format('Legal buckets: %s.', array_to_string(custom.agg_buckets(), ', '));
    end if;
    if v_key = 'created_at' then
      v_group_sel := array_append(v_group_sel, format('date_trunc(%L, r.created_at)::text', v_by));
    else
      v_group_sel := array_append(v_group_sel,
        format('date_trunc(%L, (nullif(%s, '''')::timestamptz))::text', v_by, custom.agg_value_sql(v_key)));
    end if;
    v_group_lbl := array_append(v_group_lbl, quote_literal(v_key || '_' || v_by));
  end if;

  for m in select e from jsonb_array_elements(coalesce(p_measures, '[]'::jsonb)) e loop
    v_op := lower(coalesce(m ->> 'op', 'count'));
    if not (v_op = any (custom.agg_operations())) then
      raise exception 'custom.record_aggregate: "%" is not a measure', v_op
        using errcode = '22023',
              hint = format('Legal measures: %s.', array_to_string(custom.agg_operations(), ', '));
    end if;
    if v_op = 'count' then
      v_meas_sel := array_append(v_meas_sel, quote_literal('count') || ', count(*)::numeric');
    else
      v_key := custom.agg_assert_key(m ->> 'key');
      v_val := custom.agg_value_sql(v_key);
      -- ── GRID-PRIMITIVES G1: THE SUMMARY BAR'S OTHER FOUR. ────────────────────────────
      -- BLANK is what the older grid's summary bar means by it (column-summaries.ts
      -- isBlank): no value, JSON null, or the empty string. An empty list is a value.
      if v_op = 'median' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('(percentile_cont(0.5) within group (order by nullif(%s, '''')::numeric))::numeric', v_val));
      elsif v_op = 'filled' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('(count(*) filter (where nullif(%s, '''') is not null))::numeric', v_val));
      elsif v_op = 'empty' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('(count(*) filter (where nullif(%s, '''') is null))::numeric', v_val));
      elsif v_op = 'unique' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('(count(distinct nullif(%s, '''')))::numeric', v_val));
      else
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('%s(nullif(%s, '''')::numeric)::numeric', v_op, v_val));
      end if;
    end if;
  end loop;
  if cardinality(v_meas_sel) = 0 then
    v_meas_sel := array[quote_literal('count') || ', count(*)::numeric'];
  end if;

  v_sql := format($q$
    select %s as groups,
           jsonb_build_object(%s) as measures,
           count(*)::bigint as row_count
      from custom.record r
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %s
       and %s
     %s
     order by count(*) desc
     limit %s
  $q$,
    case when cardinality(v_group_sel) = 0 then '''{}''::jsonb'
         else 'jsonb_build_object(' ||
              (select string_agg(v_group_lbl[i] || ', ' || v_group_sel[i], ', ')
                 from generate_subscripts(v_group_sel, 1) i) || ')' end,
    array_to_string(v_meas_sel, ', '),
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                 p_required::public.permission_level, 'r'),
    custom.record_filter_sql(p_filter),
    case when cardinality(v_group_sel) = 0 then ''
         else 'group by ' || (select string_agg(i::text, ', ')
                                from generate_subscripts(v_group_sel, 1) i) end,
    custom.page_size(p_organization_id, 'custom.record_aggregate', p_limit, 200));

  return v_sql;
end;
$function$

;

comment on function custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text) is
  'W4-AGG / AGT-N-8: the ONE statement the eighth verb runs. A filter value that is a scalar is an equality; one that is an object is a half-open moment window (DASHBOARDS, 2026-09-20) — both in the same WHERE as Visibility, below the aggregate node.';

CREATE OR REPLACE FUNCTION custom.record_aggregate(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text)
 RETURNS TABLE(groups jsonb, measures jsonb, row_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_map jsonb;
  v_row record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_aggregate');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.record_aggregate');

  -- CHOICE-VALUE. One map per call: the filter is normalised to what is STORED before the
  -- statement is built, and the groups are named on the way out.
  v_map := custom.choice_field_map(p_organization_id, p_table_id);

  for v_row in execute custom.agg_sql(p_organization_id, p_table_id, p_group_by, p_measures,
                                      p_bucket, custom.choice_filter_normalize(v_map, p_filter),
                                      p_limit, p_required) loop
    groups    := custom.choice_render_groups(v_map, v_row.groups);
    measures  := v_row.measures;
    row_count := v_row.row_count;
    return next;
  end loop;
end;
$function$

;

comment on function custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text) is
  'W4-AGG / AGT-N-8, THE EIGHTH VERB: group, count, sum, avg, min, max and bucket over one Table, computed INSIDE one query whose Visibility join sits below the aggregate node. A row the principal may not see is never fetched, so it can neither be counted nor be inferred from a total.';

update platform.client_callable_door d
   set identity_args = pg_get_function_identity_arguments('custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text)'::regprocedure),
       identity_argtypes = platform.door_argtypes(p.proargtypes),
       reason = 'Totals and counts grouped by a field or bucketed by time. The visibility join is inside the aggregate''s own statement, below the aggregate node, so the numbers are computed over the rows this person may see and the rest are never fetched.'
  from pg_catalog.pg_proc p
 where p.oid = 'custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text)'::regprocedure
   and d.schema_name = 'custom' and d.function_name = 'record_aggregate';

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
$function$

;

CREATE OR REPLACE FUNCTION custom.dashboard_run(p_organization_id uuid, p_dashboard_id uuid, p_filter jsonb DEFAULT '{}'::jsonb)
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
$function$

;

comment on function custom.dashboard_run(uuid, uuid, jsonb) is
  'SCR-16: the WHOLE canvas in ONE call and ONE snapshot. Reading it is knowing its subject Table (VIS-5) — a dashboard holds no record — and every number is answered by custom.record_aggregate or custom.dashboard_stuck under the CALLER''S OWN principal, so a member shared fifty of two hundred records sees fifty on the organization''s own dashboard. One block that refuses says why and the rest still answer.';

update platform.client_callable_door d
   set identity_args = pg_get_function_identity_arguments('custom.dashboard_run(uuid, uuid, jsonb)'::regprocedure),
       identity_argtypes = platform.door_argtypes(p.proargtypes)
  from pg_catalog.pg_proc p
 where p.oid = 'custom.dashboard_run(uuid, uuid, jsonb)'::regprocedure
   and d.schema_name = 'custom' and d.function_name = 'dashboard_run';

drop function custom.agg_delta(jsonb, jsonb);
drop function custom.agg_zero(jsonb);
drop function custom.agg_compare_windows(uuid, jsonb, jsonb);
drop function custom.agg_compare_kinds();
drop function custom.agg_bucket_ordinal(text, timestamp, timestamp, text);
drop function custom.agg_parse_moment(text, text, text);
drop function custom.agg_moment_sql(text, text);
drop function custom.agg_local_label(timestamp, text);
drop function custom.agg_period_step(text);
drop function custom.agg_period_start(timestamp, text, text);
drop function custom.agg_calendar(uuid);

delete from platform.feature_knob where feature = 'custom' and key in ('time_zone', 'week_start');

-- A dropped function takes its grant with it. The two door rows now name the older identities
-- again; their signed-in lane is opened and the declared-doors sweep hands the grant back, so a
-- signed-in chart and dashboard answer exactly as they did before the up file (measured on the
-- clone 2026-09-24: without this, dashboard_run was left with no EXECUTE for authenticated).
update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null
 where schema_name = 'custom' and function_name in ('record_aggregate', 'dashboard_run');

select custom.reopen_declared_doors();

-- chair-step: one new door, custom.record_aggregate_as_of (signed-in callers), with its platform.client_callable_door row; custom.reopen_declared_doors() opens it to authenticated. It replaces no body; no table, no policy, no existing grant changes. Inverse: migrations/inverse/visionreach_w3_a_table_as_it_stood_is_measured_in_the_store_down.sql
-- lock: custom
-- lane: VISION-REACH
--
-- LANE 5 VISION-REACH, WAVE 3 — A TABLE AS IT STOOD IS MEASURED IN THE STORE.
--
-- THE DEFECT: the records tool's `record_aggregate` with `as_of` read EVERY page of
-- custom.query_table_as_of into Python and added it up there; cost grew with the table, and on the
-- clone's 5,000-visit ledger it did not finish inside the client's wait (custom.query_table_as_of
-- costs ~16 ms a record: a per-record visibility question, the per-record field mask, the history
-- read). A total over part of the table is the $640 defect, so a slow whole-table walk was the only
-- honest option the tool had.
--
-- THE FIX: one door that measures in one statement — the visible set once (custom.query_visible_ids),
-- the columns the question reads checked once and refused by name if hidden
-- (custom.agg_fields_readable_assert), the past read set-based from history.row_versions (the rows
-- history.record_at reads, DISTINCT ON the record), the world clock applied per value
-- (history.value_in_force) exactly as custom.query_record_as_of applies it.
--
-- PERMISSION CHANGE (announced in common-docs operations/for-arman/2026-10-02): a new door signed-in
-- people may call. It hands out numbers per group, only over records and columns the caller may
-- already read through custom.query_table_as_of and custom.record_aggregate.

create function custom.record_aggregate_as_of(
  p_organization_id uuid, p_table_id uuid, p_recorded_at timestamptz,
  p_measure text default 'count', p_field_key text default null, p_group_by text default null,
  p_match jsonb default '{}'::jsonb)
 returns table(bucket text, result numeric, row_count bigint, not_numbers bigint, a_non_number text)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
#variable_conflict use_column
declare
  v_measure text := lower(coalesce(nullif(btrim(p_measure), ''), 'count'));
  v_keys    text[] := '{}';
  v_key     text;
  v_label   text;
  v_ids     uuid[];
begin
  -- A TABLE AS IT STOOD, MEASURED IN THE STORE (VISION-REACH W3, 2026-10-02). "What was the total
  -- copay before this morning's correction" used to be answered by the records tool reading every
  -- page of custom.query_table_as_of into Python and adding it up there. Now it is one statement:
  --   WHICH RECORDS — custom.query_visible_ids, the one ladder, exactly the set the page door reads;
  --   WHICH COLUMNS — every column the question reads (the measured one, the group, each match) is
  --     asked custom.agg_fields_readable_assert, the aggregate door's own refusal, BEFORE anything
  --     is read: a column this reader may not see is refused by its name, as custom.record_aggregate
  --     refuses it;
  --   WHAT IT SAID THEN — each record's latest version at or before the moment (history.row_versions,
  --     the rows history.record_at reads, chosen set-based), then the world clock's value in force
  --     today (history.value_in_force), exactly as custom.query_record_as_of reads one record.
  -- The match is the records tool's: equality ignoring case and surrounding spaces; null means
  -- "had no value".
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_aggregate_as_of');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.record_aggregate_as_of');
  if p_recorded_at is null then
    raise exception 'An as-of question needs the moment it is about.' using errcode = '22004',
      hint = 'Send p_recorded_at, e.g. 2026-09-25T17:00:00Z, or ask custom.record_aggregate about now. Nothing was measured.';
  end if;
  if v_measure not in ('count', 'sum', 'avg', 'min', 'max') then
    raise exception '"%" is not a measure an as-of question can take.', p_measure using errcode = '22023',
      hint = 'count, sum, avg, min or max. Nothing was measured.';
  end if;
  if v_measure <> 'count' and nullif(p_field_key, '') is null then
    raise exception 'A % needs the column it measures.', v_measure using errcode = '22004',
      hint = 'Send p_field_key. Nothing was measured.';
  end if;
  if p_match is not null and jsonb_typeof(p_match) not in ('object', 'null') then
    raise exception 'A match is a set of column conditions, like {"status": "Completed"}.' using errcode = '22023',
      hint = 'Nothing was measured.';
  end if;

  if nullif(p_field_key, '') is not null then v_keys := v_keys || custom.agg_assert_key(p_field_key); end if;
  if nullif(p_group_by, '') is not null then v_keys := v_keys || custom.agg_assert_key(p_group_by); end if;
  for v_key in select k from jsonb_object_keys(coalesce(nullif(p_match, 'null'::jsonb), '{}'::jsonb)) k loop
    v_keys := v_keys || custom.agg_assert_key(v_key);
  end loop;
  perform custom.agg_fields_readable_assert(p_organization_id, p_table_id, v_keys, 'viewer');

  -- A column worked out on read is not in a past version of the record.
  select coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key') into v_label
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and f.data ->> 'key' = any (v_keys)
     and f.data ->> 'type' = 'formula'
   limit 1;
  if v_label is not null then
    raise exception '% is worked out when a record is read, and a past version of a record does not carry it, so it cannot be measured as of a moment.', v_label
      using errcode = '22023', hint = 'Ask without as_of to measure it now. Nothing was measured.';
  end if;

  select coalesce(array_agg(v), '{}'::uuid[]) into v_ids
    from custom.query_visible_ids(p_organization_id, p_table_id, 'viewer') v;

  return query
  with doc as (
    select distinct on (rv.row_id) rv.row_id,
           coalesce(rv.row_data -> 'data', rv.row_data) as d
      from history.row_versions rv
     where rv.entity_type = 'custom.record'
       and rv.organization_id = p_organization_id
       and rv.row_id = any (v_ids)
       and rv.occurred_at <= p_recorded_at
     order by rv.row_id, rv.occurred_at desc, rv.id desc
  ), val as (
    select d,
           custom.agg_value_text(history.value_in_force(d, p_field_key, current_date) -> 'value') as x,
           custom.agg_value_text(history.value_in_force(d, p_group_by, current_date) -> 'value') as g
      from doc
     where d is not null
       and not exists (
         select 1 from jsonb_each(coalesce(nullif(p_match, 'null'::jsonb), '{}'::jsonb)) w
          where case when jsonb_typeof(w.value) = 'null'
                     then custom.agg_value_text(history.value_in_force(d, w.key, current_date) -> 'value') is not null
                     else lower(btrim(coalesce(custom.agg_value_text(history.value_in_force(d, w.key, current_date) -> 'value'), '')))
                          <> lower(btrim(w.value #>> '{}')) end)
  )
  select case when nullif(p_group_by, '') is null then 'all' else val.g end,
         case v_measure
           when 'count' then count(*)::numeric
           when 'sum' then sum(case when val.x ~ '^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$' then val.x::numeric end)
           when 'avg' then avg(case when val.x ~ '^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$' then val.x::numeric end)
           when 'min' then min(case when val.x ~ '^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$' then val.x::numeric end)
           else max(case when val.x ~ '^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$' then val.x::numeric end)
         end,
         count(*)::bigint,
         count(*) filter (where nullif(val.x, '') is not null and val.x !~ '^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$')::bigint,
         min(val.x) filter (where nullif(val.x, '') is not null and val.x !~ '^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$')
    from val
   group by 1;
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, reason, declared_by,
   anonymous_callers, signed_in_callers, argument_rules)
values
  ('custom', 'record_aggregate_as_of',
   'p_organization_id uuid, p_table_id uuid, p_recorded_at timestamp with time zone, p_measure text, p_field_key text, p_group_by text, p_match jsonb',
   'A count or total of one Table AS IT STOOD at a moment, measured in the store instead of every page of custom.query_table_as_of being added up by the client. It answers only about the records custom.query_visible_ids gives this caller (the one ladder, the same set the as-of page door reads), refuses by name any column the question reads that the caller may not see (custom.agg_fields_readable_assert, the aggregate door''s own check, asked before anything is read), and returns numbers per group, never a record. Keys are refused by shape (custom.agg_assert_key) and values are compared as data, never SQL.',
   'visionreach_w3_a_table_as_it_stood_is_measured_in_the_store.sql',
   false, true,
   jsonb_build_object(
     'version', 1,
     'declared_by', 'visionreach_w3_a_table_as_it_stood_is_measured_in_the_store.sql',
     'declared_at', '2026-10-02 lane VISION-REACH, per-door reading of the body',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object(
         'type', 'uuid', 'entity', 'organization',
         'check', 'this body decides it with custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-10-02 lane VISION-REACH — read from this body'),
       'p_table_id', jsonb_build_object(
         'type', 'uuid',
         'check', 'this body decides it with custom.assert_may_know_table(arg1, arg2), then hands it to custom.query_visible_ids, which decides every row — the caller''s own visible ids in that Table.',
         'foreign', jsonb_build_object('not_a_leak', true, 'same_as_invented', true),
         'verified', '2026-10-02 lane VISION-REACH — read from this body'))))
on conflict do nothing;

-- The door is declared, so the store's own re-grant opens it to signed-in callers (and only to them).
select custom.reopen_declared_doors();

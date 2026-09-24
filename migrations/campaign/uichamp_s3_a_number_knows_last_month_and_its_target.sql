-- chair-step: two client doors change signature — `custom.record_aggregate` gains `p_compare` and
--   four answer columns, `custom.dashboard_run` gains `p_compare` and `p_grain` — and a return
--   type cannot be widened (nor a defaulted argument added without a second overload) by CREATE
--   OR REPLACE, so each is DROPPED and CREATED again in this one transaction, with its
--   `platform.client_callable_door` row re-pointed at the new identity before commit. The
--   internal `custom.agg_sql` gains `p_window` the same way. The additive allow-list refuses a
--   DROP by name and it is right to: a person reads what the CREATE puts back. Every existing
--   argument keeps its name, position and default, so every caller (dashboard_run,
--   agg_digest_assemble, agg_explain, the records client) still resolves unchanged; with no
--   comparison asked, record_aggregate answers exactly the rows it answered before, plus four
--   null columns. `custom.dashboard_block_normalize` is REPLACED (same signature) so a block
--   may carry `compare` and `target`. New: two knobs (`custom/time_zone`, `custom/week_start`)
--   and nine helper functions. No table, column, trigger or policy is touched; no row of
--   anybody's data is rewritten. The EXECUTE grant a signed-in person needs on the two
--   re-created doors is the NEXT file, `uichamp_s3_a_signed_in_person_may_compare_periods.sql`.
--   The inverse is `migrations/inverse/uichamp_s3_a_number_knows_last_month_and_its_target_down.sql`.
-- lane: S3
-- lock: custom,platform
-- based-on: custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text) 5be78bb8bcd509e3409e9bbab2f8a84c09493f97af5b48d93b398b460c4d81d4
-- based-on: custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text) 2fc059996700007178ba555217f1ffc18d39e67a0324efab1463c6792245c964
-- based-on: custom.dashboard_run(uuid, uuid, jsonb) fd4b265ac01f209d8d90d9168a4b515b1f82ae2b4e242b5465ca7e4078ffbdbd
-- based-on: custom.dashboard_block_normalize(uuid, uuid, jsonb) 8f58721c64583e3c5a4846481af544e3790cce71c2cd97ccace63e9b23d4b92e
--
-- LANE S3 (UI-CHAMPIONS-PLAN rev 2, rows 17, 18, 20) — PERIOD COMPARISON, DATE GRAIN, TARGETS.
--
-- THE USE CASE. Rincon Plumbing Co's office manager opens the Jobs dashboard on the 23rd and
-- wants the three numbers every owner of a trade business asks for: how much we have billed
-- this month, how that compares with last month at the same point, and how far we are from the
-- month's target — and the same thing week by week on a chart, with last month's weeks drawn
-- behind this month's and the target's weekly pace as a line. Metabase, Linear Insights and
-- every champion dashboard answer that question in one tile; the store could not.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- WHAT CHANGES
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- 1. THE CALENDAR IS THE ORGANIZATION'S. Two knobs, `custom/time_zone` (default "UTC") and
--    `custom/week_start` (default "monday"), both overridable by an organization. Defaults are
--    exactly what the store did before (Postgres buckets in the session's UTC and ISO weeks
--    start on Monday), so no organization's chart moves until it sets them. A month bucket for
--    a plumber in Camarillo now starts at midnight in Camarillo, and a date-only value
--    ("2026-09-01") is that local day, never the UTC midnight that lands on the 31st in
--    California. `custom.agg_calendar(org)` answers both and refuses a time zone Postgres does
--    not know, by the knob's name.
--
-- 2. A BUCKET SAYS ITS OWN LOCAL MOMENT. The bucket group's value is ISO 8601 with the
--    organization's offset ("2026-09-07T00:00:00-07:00"), so a browser in any time zone parses
--    the exact instant and reads the local date from the first ten characters. It was
--    Postgres's `timestamptz::text` in UTC ("2026-09-07 00:00:00+00").
--
-- 3. `custom.record_aggregate(…, p_compare)`. `p_compare` is
--      { "against": "previous_period" | "same_period_last_year" | "range",
--        "key":     <the date Field the period runs along; default the bucket's key>,
--        "period":  day | week | month | quarter | year   (the calendar period containing "at"),
--        "at":      <anchor moment, default now()>,
--        "from", "to":  <an explicit current window instead of a period>,
--        "to_date": true  (compare the part of the period that has happened with the same
--                          part of the one before: "month to date"),
--        "baseline": {"from", "to"}  (the fixed period "range" compares against) }
--    The door runs the SAME aggregate twice under the SAME principal, once over the current
--    window and once over the prior one, and answers one row per group with both series:
--    `groups/measures/row_count` (current), `prior_groups/prior_measures/prior_row_count`,
--    `delta` ({<measure>: {current, prior, change, change_pct}}) and `compare` (the two windows,
--    as local ISO moments, the calendar they were cut with and the row's bucket `position`).
--    Groups are matched by value;
--    a bucket is matched by its POSITION in its own window (week 1 of September with week 1 of
--    August), computed from the calendar, never from which weeks happened to have rows.
--    "Previous period of the same length": a calendar period's predecessor (August before
--    September), or an explicit window shifted back by its own length.
--
-- 4. A BLOCK CARRIES `compare` AND `target`. `dashboard_block_normalize` judges both on the way
--    in, by name: `target {value, label, measure, per: period|bucket}` — value is a number,
--    measure one of the block's own measures, `per: bucket` only on a bucketed block.
--
-- 5. `custom.dashboard_run(…, p_compare, p_grain)`. `p_grain` re-cuts every bucketed block to one
--    grain (the canvas's date-grain picker); `p_compare` compares every block that did not say
--    its own (the block's own wins, as its own filter does). Each block's answer gains
--    `compare` (the windows), `totals` ({measure, current, prior, change, change_pct} for an
--    additive measure), and `target` with `current`, `progress` (current ÷ target) and, on a
--    bucketed block, `pace` (the target's even share of one bucket, or the target itself when
--    `per: bucket`) — the line a chart draws. A block with no date to compare along says so in
--    `compare_refused` and still draws; nothing fails silently.
--
-- LOCKS. `create function`, `drop function`, `create or replace function`, `insert`, `update`
-- of two rows of `platform.client_callable_door`, `comment on`: ACCESS SHARE on catalogue
-- relations, nothing on `custom.record` (scripts/lib/ddl-lock-footprint.json). Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The two knobs. Starting values are the store's own behaviour before this file.
-- ─────────────────────────────────────────────────────────────────────────────────────────

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, allowed_values, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'time_zone', '"UTC"'::jsonb, '"UTC"'::jsonb, 'string', null,
   'The time zone this organization''s days, weeks and months are counted in',
   'Every date grain (day, week, month, quarter, year) and every period comparison in the record '
   'store is cut at midnight in this time zone, and a date with no time ("2026-09-01") is that '
   'local day. An IANA name such as America/Los_Angeles. custom.agg_calendar refuses a name '
   'Postgres does not know, naming this knob.',
   'agent',
   'Lane S3 2026-09-23: UTC is what the store bucketed in before this knob existed, so no chart moves until an organization sets its own.',
   date '2026-12-23', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb),
  ('custom', 'week_start', '"monday"'::jsonb, '"monday"'::jsonb, 'enum',
   '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]'::jsonb,
   'The day this organization''s week starts on',
   'A week bucket and a "this week" comparison start on this day. Monday is the ISO week and '
   'what the store did before this knob existed; many US businesses count Sunday to Saturday.',
   'agent',
   'Lane S3 2026-09-23: ISO Monday is what date_trunc(''week'') always did, so no chart moves until an organization sets its own.',
   date '2026-12-23', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The calendar and its arithmetic.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.agg_calendar(p_organization_id uuid)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_tz text;
  v_ws text;
begin
  v_tz := coalesce(nullif(btrim(platform.knob_resolve('custom', 'time_zone', p_organization_id) #>> '{}'), ''), 'UTC');
  v_ws := lower(coalesce(nullif(btrim(platform.knob_resolve('custom', 'week_start', p_organization_id) #>> '{}'), ''), 'monday'));
  begin
    perform now() at time zone v_tz;
  exception when others then
    raise exception 'This organization''s time zone is set to "%", which is not a time zone the store knows.', v_tz
      using errcode = '22023',
            hint = 'Set the knob custom/time_zone to an IANA name such as America/Los_Angeles or Europe/London.';
  end;
  if not (v_ws = any (array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])) then
    raise exception 'This organization''s week is set to start on "%", which is not a day of the week.', v_ws
      using errcode = '22023',
            hint = 'Set the knob custom/week_start to monday, tuesday, wednesday, thursday, friday, saturday or sunday.';
  end if;
  return jsonb_build_object('time_zone', v_tz, 'week_start', v_ws);
end
$fn$;

comment on function custom.agg_calendar(uuid) is
  'S3: the organization''s calendar — custom/time_zone and custom/week_start — that every date grain and period comparison is cut with. Refuses a time zone or a day Postgres does not know, naming the knob.';

create function custom.agg_period_start(p_local timestamp, p_by text, p_week_start text default 'monday')
returns timestamp
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- A week that starts on day W is an ISO week shifted: move the moment forward by the days
  -- from W to the next Monday, truncate to the ISO week, and move back the same distance.
  select case
    when p_local is null then null
    when lower(p_by) = 'week' then
      date_trunc('week', p_local + make_interval(days => s)) - make_interval(days => s)
    else date_trunc(lower(p_by), p_local)
  end
  from (select (8 - coalesce(array_position(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
                                            lower(coalesce(p_week_start, 'monday'))), 1)) % 7 as s) x;
$fn$;

comment on function custom.agg_period_start(timestamp, text, text) is
  'S3: the local start of the day / week / month / quarter / year holding a local moment, with the week starting on the organization''s own day.';

create function custom.agg_period_step(p_by text)
returns interval
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select case lower(p_by)
    when 'day' then interval '1 day'
    when 'week' then interval '7 days'
    when 'month' then interval '1 month'
    when 'quarter' then interval '3 months'
    when 'year' then interval '1 year'
  end;
$fn$;

comment on function custom.agg_period_step(text) is
  'S3: how long one day / week / month / quarter / year is, as a calendar interval.';

create function custom.agg_local_label(p_local timestamp, p_tz text)
returns text
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  -- ISO 8601 with the offset the organization's clock had at that moment, so any browser
  -- parses the exact instant and the first ten characters are the local date.
  select case when p_local is null then null else
    to_char(p_local, 'YYYY-MM-DD"T"HH24:MI:SS')
    || case when s < 0 then '-' else '+' end
    || lpad((abs(s) / 3600)::text, 2, '0') || ':' || lpad(((abs(s) % 3600) / 60)::text, 2, '0')
  end
  from (select extract(epoch from (p_local - ((p_local at time zone p_tz) at time zone 'UTC')))::integer as s) x;
$fn$;

comment on function custom.agg_local_label(timestamp, text) is
  'S3: a local moment written as ISO 8601 with the organization''s offset ("2026-09-07T00:00:00-07:00").';

create function custom.agg_moment_sql(p_key text, p_tz text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- The two real columns are moments already. A document value that is a DATE ("2026-09-01")
  -- is that local day in the organization's time zone; anything else is read as a moment.
  select case
    when custom.agg_assert_key(p_key) in ('created_at', 'updated_at') then format('r.%I', p_key)
    else format(
      '(case when (%1$s) ~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'' then ((%1$s)::date::timestamp at time zone %2$L) '
      'else (nullif(%1$s, '''')::timestamptz) end)',
      custom.agg_value_sql(p_key), p_tz)
  end;
$fn$;

comment on function custom.agg_moment_sql(text, text) is
  'S3: the SQL that reads one Field (or created_at / updated_at) as a moment, a date-only value being that local day in the given time zone.';

create function custom.agg_parse_moment(p_raw text, p_tz text, p_what text)
returns timestamptz
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_raw text := nullif(btrim(coalesce(p_raw, '')), '');
begin
  if v_raw is null then
    return null;
  end if;
  begin
    if v_raw ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      return (v_raw::date::timestamp at time zone p_tz);
    end if;
    return v_raw::timestamptz;
  exception when others then
    raise exception '"%" is not a moment, so % cannot be read', v_raw, p_what
      using errcode = '22007',
            hint = 'Write a date or a timestamp: "2026-09-01" (that day, in this organization''s time zone) or "2026-09-01T08:00:00-07:00".';
  end;
end
$fn$;

comment on function custom.agg_parse_moment(text, text, text) is
  'S3: a caller''s date or timestamp as a moment; a date alone is local midnight in the organization''s time zone. Refuses by sentence, naming what was being read.';

create function custom.agg_bucket_ordinal(p_by text, p_window_from timestamp, p_at timestamp, p_week_start text)
returns integer
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- Which bucket of its window a local moment falls in: 0 for the window's first. Computed
  -- from the calendar, so a week with no jobs does not shift every later week by one.
  select case lower(p_by)
    when 'day'  then (b::date - a::date)
    when 'week' then (b::date - a::date) / 7
    when 'month' then ((extract(year from b) * 12 + extract(month from b)) - (extract(year from a) * 12 + extract(month from a)))::integer
    when 'quarter' then (((extract(year from b) * 12 + extract(month from b)) - (extract(year from a) * 12 + extract(month from a)))::integer) / 3
    when 'year' then (extract(year from b) - extract(year from a))::integer
  end
  from (select custom.agg_period_start(p_window_from, p_by, p_week_start) as a,
               custom.agg_period_start(p_at, p_by, p_week_start) as b) x;
$fn$;

comment on function custom.agg_bucket_ordinal(text, timestamp, timestamp, text) is
  'S3: the position of a local moment''s bucket inside a window (0 = the window''s first bucket), from the calendar alone.';

create function custom.agg_compare_kinds()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$ select array['previous_period', 'same_period_last_year', 'range']::text[] $fn$;

comment on function custom.agg_compare_kinds() is
  'S3: what a period may be compared against. previous_period = the period before, of the same length; same_period_last_year; range = a fixed baseline {from, to}.';

create function custom.agg_compare_windows(p_organization_id uuid, p_compare jsonb, p_bucket jsonb default null)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_cal     jsonb := custom.agg_calendar(p_organization_id);
  v_tz      text := v_cal ->> 'time_zone';
  v_ws      text := v_cal ->> 'week_start';
  v_against text;
  v_key     text;
  v_period  text;
  v_at      timestamptz;
  v_to_date boolean;
  v_k       text;
  v_s       timestamp;
  v_e       timestamp;
  v_cf      timestamptz;
  v_ct      timestamptz;
  v_pf      timestamptz;
  v_pt      timestamptz;
  v_len     interval;
  v_by      text;
  v_count   integer;
begin
  if p_compare is null or jsonb_typeof(p_compare) is distinct from 'object' then
    raise exception 'A comparison is written as an object, such as {"against": "previous_period", "period": "month"}.'
      using errcode = '22004',
            hint = format('against is one of %s.', array_to_string(custom.agg_compare_kinds(), ', '));
  end if;
  -- A KEY THAT IS NOT PART OF A COMPARISON IS A TYPO, AND A TYPO IS TOLD.
  for v_k in select k from jsonb_object_keys(p_compare) k loop
    if v_k not in ('against', 'key', 'period', 'at', 'from', 'to', 'to_date', 'baseline') then
      raise exception '"%" is not part of a comparison', v_k
        using errcode = '22023',
              hint = 'A comparison has: against, key, period, at, from, to, to_date, baseline.';
    end if;
  end loop;

  v_against := lower(coalesce(nullif(btrim(p_compare ->> 'against'), ''), 'previous_period'));
  if not (v_against = any (custom.agg_compare_kinds())) then
    raise exception '"%" is not something a period can be compared against', v_against
      using errcode = '22023',
            hint = format('Compare against one of %s.', array_to_string(custom.agg_compare_kinds(), ', '));
  end if;

  v_key := nullif(btrim(coalesce(p_compare ->> 'key', '')), '');
  if v_key is null and p_bucket is not null and jsonb_typeof(p_bucket) = 'object' then
    v_key := nullif(btrim(coalesce(p_bucket ->> 'key', '')), '');
  end if;
  if v_key is null then
    raise exception 'A comparison runs along a date, and this one does not say which.'
      using errcode = '22004',
            hint = 'Give the comparison a key (a date Field, or created_at), or give the block a bucket to run along.';
  end if;
  perform custom.agg_assert_key(v_key);

  v_at := coalesce(custom.agg_parse_moment(p_compare ->> 'at', v_tz, 'the comparison''s "at"'), now());
  v_to_date := coalesce((p_compare ->> 'to_date')::boolean, false);

  if (p_compare ? 'from') or (p_compare ? 'to') then
    -- AN EXPLICIT WINDOW. Both ends, because "the period before, of the same length" needs one.
    v_cf := custom.agg_parse_moment(p_compare ->> 'from', v_tz, 'the comparison''s "from"');
    v_ct := custom.agg_parse_moment(p_compare ->> 'to', v_tz, 'the comparison''s "to"');
    if v_cf is null or v_ct is null or v_ct <= v_cf then
      raise exception 'A comparison''s own window needs a "from" and a later "to".'
        using errcode = '22023',
              hint = 'from is included, to is not: {"from": "2026-09-01", "to": "2026-10-01"} is September. Or leave both out and name a period.';
    end if;
    v_period := null;
    v_len := v_ct - v_cf;
    if v_against = 'previous_period' then
      v_pf := v_cf - v_len; v_pt := v_cf;
    elsif v_against = 'same_period_last_year' then
      v_pf := v_cf - interval '1 year'; v_pt := v_ct - interval '1 year';
    end if;
  else
    v_period := lower(coalesce(nullif(btrim(p_compare ->> 'period'), ''),
                               case when p_bucket is not null and jsonb_typeof(p_bucket) = 'object'
                                    then nullif(btrim(p_bucket ->> 'by'), '') end,
                               'month'));
    if not (v_period = any (custom.agg_buckets())) then
      raise exception '"%" is not a period a comparison can take', v_period
        using errcode = '22023',
              hint = format('A period is one of %s.', array_to_string(custom.agg_buckets(), ', '));
    end if;
    v_s := custom.agg_period_start(v_at at time zone v_tz, v_period, v_ws);
    v_e := v_s + custom.agg_period_step(v_period);
    v_cf := v_s at time zone v_tz;
    v_ct := v_e at time zone v_tz;
    if v_against = 'previous_period' then
      v_pf := (v_s - custom.agg_period_step(v_period)) at time zone v_tz;
      v_pt := v_s at time zone v_tz;
    elsif v_against = 'same_period_last_year' then
      -- The same WEEK last year is 52 weeks back, so it still starts on this organization's day.
      v_pf := (v_s - case when v_period = 'week' then interval '364 days' else interval '1 year' end) at time zone v_tz;
      v_pt := (v_e - case when v_period = 'week' then interval '364 days' else interval '1 year' end) at time zone v_tz;
    end if;
  end if;

  if v_against = 'range' then
    if p_compare -> 'baseline' is null or jsonb_typeof(p_compare -> 'baseline') is distinct from 'object' then
      raise exception 'Comparing against a fixed range needs the range: {"baseline": {"from": …, "to": …}}.'
        using errcode = '22004',
              hint = 'from is included, to is not: {"from": "2026-01-01", "to": "2026-04-01"} is the first quarter.';
    end if;
    for v_k in select k from jsonb_object_keys(p_compare -> 'baseline') k loop
      if v_k not in ('from', 'to') then
        raise exception '"%" is not part of a baseline', v_k
          using errcode = '22023', hint = 'A baseline has exactly two parts: {"from": …, "to": …}.';
      end if;
    end loop;
    v_pf := custom.agg_parse_moment(p_compare -> 'baseline' ->> 'from', v_tz, 'the baseline''s "from"');
    v_pt := custom.agg_parse_moment(p_compare -> 'baseline' ->> 'to', v_tz, 'the baseline''s "to"');
    if v_pf is null or v_pt is null or v_pt <= v_pf then
      raise exception 'A baseline needs a "from" and a later "to".'
        using errcode = '22023', hint = 'from is included, to is not.';
    end if;
  elsif p_compare ? 'baseline' then
    raise exception 'A baseline belongs to "range" only; "%" works its own prior window out.', v_against
      using errcode = '22023', hint = 'Send against "range" with the baseline, or leave the baseline out.';
  end if;

  -- "MONTH TO DATE". The part of this period that has happened, beside the same part of the
  -- one it is compared with. A fixed baseline stays whole: it is a fixed thing.
  if v_to_date and v_at > v_cf and v_at < v_ct then
    if v_against <> 'range' then
      v_pt := least(v_pt, v_pf + (v_at - v_cf));
    end if;
    v_ct := v_at;
  end if;

  if p_bucket is not null and jsonb_typeof(p_bucket) = 'object' then
    v_by := lower(coalesce(nullif(btrim(p_bucket ->> 'by'), ''), 'month'));
    if v_by = any (custom.agg_buckets()) then
      v_count := custom.agg_bucket_ordinal(v_by, v_cf at time zone v_tz,
                                           (v_ct - interval '1 microsecond') at time zone v_tz, v_ws) + 1;
    end if;
  end if;

  return jsonb_build_object(
    'key', v_key,
    'against', v_against,
    'period', v_period,
    'to_date', v_to_date,
    'time_zone', v_tz,
    'week_start', v_ws,
    'grain', v_by,
    'bucket_count', v_count,
    'window', jsonb_build_object('from', custom.agg_local_label(v_cf at time zone v_tz, v_tz),
                                 'to', custom.agg_local_label(v_ct at time zone v_tz, v_tz)),
    'prior_window', jsonb_build_object('from', custom.agg_local_label(v_pf at time zone v_tz, v_tz),
                                       'to', custom.agg_local_label(v_pt at time zone v_tz, v_tz)));
end
$fn$;

comment on function custom.agg_compare_windows(uuid, jsonb, jsonb) is
  'S3: the two windows a comparison runs over — the current one (a calendar period holding "at", or an explicit from/to) and the prior one (the period before of the same length, the same period last year, or a fixed baseline) — as local ISO moments, with the calendar they were cut with and how many buckets the current window holds. Refuses every malformed part by name.';

create function custom.agg_zero(p_measures jsonb)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- The measures of a group that had no records in one window: a count is 0, a sum is nothing.
  select case when p_measures is null or jsonb_typeof(p_measures) <> 'object' then null else
    (select coalesce(jsonb_object_agg(k,
       case when k = 'count' or k like 'filled\_%' or k like 'empty\_%' or k like 'unique\_%'
            then to_jsonb(0) else 'null'::jsonb end), '{}'::jsonb)
       from jsonb_object_keys(p_measures) k)
  end;
$fn$;

create function custom.agg_delta(p_current jsonb, p_prior jsonb)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select case when p_current is null and p_prior is null then null else
    (select coalesce(jsonb_object_agg(x.k, jsonb_build_object(
              'current', x.c, 'prior', x.p,
              'change', x.c - x.p,
              'change_pct', case when x.p is null or x.c is null or x.p = 0 then null
                                 else round((x.c - x.p) / abs(x.p) * 100, 1) end)), '{}'::jsonb)
       from (select ks.k,
                    case when jsonb_typeof(p_current -> ks.k) = 'number' then (p_current ->> ks.k)::numeric end as c,
                    case when jsonb_typeof(p_prior -> ks.k) = 'number' then (p_prior ->> ks.k)::numeric end as p
               from (select jsonb_object_keys(coalesce(p_current, '{}'::jsonb) || coalesce(p_prior, '{}'::jsonb)) as k) ks) x)
  end;
$fn$;

comment on function custom.agg_delta(jsonb, jsonb) is
  'S3: each measure now and before, the change, and the change as a percent of before (null when before is nothing or zero — a percent of nothing is not a number).';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- custom.agg_sql — the statement builder. Same eight arguments, plus `p_window`; the bucket
-- is cut in the organization's calendar and answers a local ISO moment.
-- ─────────────────────────────────────────────────────────────────────────────────────────

drop function custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text);

create function custom.agg_sql(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text, p_window jsonb DEFAULT NULL::jsonb)
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
  v_cal        jsonb;
  v_tz         text;
  v_ws         text;
  v_window_sql text := 'true';
begin
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.record_aggregate: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  for v_key in select (e #>> '{}') from jsonb_array_elements(coalesce(p_group_by, '[]'::jsonb)) e loop
    v_group_sel := array_append(v_group_sel, custom.agg_value_sql(v_key));
    v_group_lbl := array_append(v_group_lbl, quote_literal(custom.agg_assert_key(v_key)));
  end loop;

  -- S3: THE ORGANIZATION'S CALENDAR, read once and only when a date is being cut.
  if (p_bucket is not null and jsonb_typeof(p_bucket) = 'object')
     or (p_window is not null and jsonb_typeof(p_window) = 'object') then
    v_cal := custom.agg_calendar(p_organization_id);
    v_tz  := v_cal ->> 'time_zone';
    v_ws  := v_cal ->> 'week_start';
  end if;

  if p_bucket is not null and jsonb_typeof(p_bucket) = 'object' then
    v_key := custom.agg_assert_key(p_bucket ->> 'key');
    v_by  := lower(coalesce(p_bucket ->> 'by', 'month'));
    if not (v_by = any (custom.agg_buckets())) then
      raise exception 'custom.record_aggregate: "%" is not a bucket', v_by
        using errcode = '22023',
              hint = format('Legal buckets: %s.', array_to_string(custom.agg_buckets(), ', '));
    end if;
    v_group_sel := array_append(v_group_sel,
      format('custom.agg_local_label(custom.agg_period_start((%s) at time zone %L, %L, %L), %L)',
             custom.agg_moment_sql(v_key, v_tz), v_tz, v_by, v_ws, v_tz));
    v_group_lbl := array_append(v_group_lbl, quote_literal(v_key || '_' || v_by));
  end if;

  -- S3: ONE HALF-OPEN WINDOW on one date, read in the SAME calendar as the bucket, so the
  -- window's first bucket and its first day are the same day. `from` and `to` arrive as
  -- moments custom.agg_compare_windows already judged; they are re-cast here, never spliced.
  if p_window is not null and jsonb_typeof(p_window) = 'object' then
    v_key := custom.agg_assert_key(p_window ->> 'key');
    v_window_sql := format('(%1$s >= %2$L::timestamptz and %1$s < %3$L::timestamptz)',
                           custom.agg_moment_sql(v_key, v_tz),
                           (p_window ->> 'from')::timestamptz, (p_window ->> 'to')::timestamptz);
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
    v_window_sql,
    case when cardinality(v_group_sel) = 0 then ''
         else 'group by ' || (select string_agg(i::text, ', ')
                                from generate_subscripts(v_group_sel, 1) i) end,
    custom.page_size(p_organization_id, 'custom.record_aggregate', p_limit, 200));

  return v_sql;
end;
$function$;

comment on function custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb) is
  'W4-AGG / AGT-N-8 + S3: the ONE statement the eighth verb runs. A filter value that is a scalar is an equality; one that is an object is a half-open moment window — both in the same WHERE as Visibility, below the aggregate node. A bucket is cut in the organization''s calendar (custom.agg_calendar) and answers a local ISO moment; p_window is one more half-open window on one date, read in that same calendar.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- custom.record_aggregate — the door. Same eight arguments, plus `p_compare`.
-- ─────────────────────────────────────────────────────────────────────────────────────────

drop function custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text);

create function custom.record_aggregate(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text, p_compare jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(groups jsonb, measures jsonb, row_count bigint, prior_groups jsonb, prior_measures jsonb, prior_row_count bigint, delta jsonb, compare jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_map    jsonb;
  v_row    record;
  v_filter jsonb;
  v_cmp    jsonb;
  v_bkey   text;
  v_by     text;
  v_ws     text;
  v_tz     text;
  v_cur    jsonb := '[]'::jsonb;
  v_pri    jsonb := '[]'::jsonb;
  v_match  jsonb;
  v_side   text;
  v_from   timestamp;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_aggregate');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.record_aggregate');

  -- CHOICE-VALUE. One map per call: the filter is normalised to what is STORED before the
  -- statement is built, and the groups are named on the way out.
  v_map := custom.choice_field_map(p_organization_id, p_table_id);
  v_filter := custom.choice_filter_normalize(v_map, p_filter);

  if p_compare is null or jsonb_typeof(p_compare) = 'null' then
    for v_row in execute custom.agg_sql(p_organization_id, p_table_id, p_group_by, p_measures,
                                        p_bucket, v_filter, p_limit, p_required) loop
      groups          := custom.choice_render_groups(v_map, v_row.groups);
      measures        := v_row.measures;
      row_count       := v_row.row_count;
      prior_groups    := null;
      prior_measures  := null;
      prior_row_count := null;
      delta           := null;
      compare         := null;
      return next;
    end loop;
    return;
  end if;

  -- ── S3: THE SAME QUESTION, TWICE, UNDER THE SAME PRINCIPAL ─────────────────────────────
  v_cmp := custom.agg_compare_windows(p_organization_id, p_compare, p_bucket);
  v_tz  := v_cmp ->> 'time_zone';
  v_ws  := v_cmp ->> 'week_start';
  -- The comparison names the period, so a window on the SAME date in the filter gives way to
  -- it; every other part of the filter narrows both series alike.
  v_filter := v_filter - (v_cmp ->> 'key');
  if p_bucket is not null and jsonb_typeof(p_bucket) = 'object' then
    v_by   := lower(coalesce(p_bucket ->> 'by', 'month'));
    v_bkey := (p_bucket ->> 'key') || '_' || v_by;
  end if;

  foreach v_side in array array['window', 'prior_window'] loop
    v_from := ((v_cmp -> v_side ->> 'from')::timestamptz) at time zone v_tz;
    for v_row in execute custom.agg_sql(p_organization_id, p_table_id, p_group_by, p_measures,
                                        p_bucket, v_filter, p_limit, p_required,
                                        jsonb_build_object('key', v_cmp ->> 'key',
                                                           'from', v_cmp -> v_side ->> 'from',
                                                           'to', v_cmp -> v_side ->> 'to')) loop
      -- A group is matched by its value; a bucket by its POSITION in its own window.
      if v_bkey is null then
        v_match := coalesce(v_row.groups, '{}'::jsonb);
      else
        v_match := (coalesce(v_row.groups, '{}'::jsonb) - v_bkey)
                   || jsonb_build_object('#', case when v_row.groups ->> v_bkey is null then null else
                        custom.agg_bucket_ordinal(v_by, v_from, left(v_row.groups ->> v_bkey, 19)::timestamp, v_ws) end);
      end if;
      if v_side = 'window' then
        v_cur := v_cur || jsonb_build_array(jsonb_build_object(
          'groups', custom.choice_render_groups(v_map, v_row.groups),
          'measures', v_row.measures, 'row_count', v_row.row_count, 'match', v_match));
      else
        v_pri := v_pri || jsonb_build_array(jsonb_build_object(
          'groups', custom.choice_render_groups(v_map, v_row.groups),
          'measures', v_row.measures, 'row_count', v_row.row_count, 'match', v_match));
      end if;
    end loop;
  end loop;

  return query
    select c.e -> 'groups',
           coalesce(c.e -> 'measures', custom.agg_zero(p.e -> 'measures')),
           coalesce((c.e ->> 'row_count')::bigint, 0),
           p.e -> 'groups',
           coalesce(p.e -> 'measures', custom.agg_zero(c.e -> 'measures')),
           coalesce((p.e ->> 'row_count')::bigint, 0),
           custom.agg_delta(coalesce(c.e -> 'measures', custom.agg_zero(p.e -> 'measures')),
                            coalesce(p.e -> 'measures', custom.agg_zero(c.e -> 'measures'))),
           -- The row's bucket POSITION rides with the windows, so a screen can name a
           -- position the current window has not reached yet ("week 6") without counting rows.
           v_cmp || jsonb_build_object('position', coalesce(c.e -> 'match' -> '#', p.e -> 'match' -> '#'))
      from (select e from jsonb_array_elements(v_cur) e) c
      full join (select e from jsonb_array_elements(v_pri) e) p
        on (c.e -> 'match') = (p.e -> 'match')
     order by coalesce(c.e -> 'match' ->> '#', p.e -> 'match' ->> '#')::integer nulls last,
              coalesce((c.e ->> 'row_count')::bigint, 0) desc,
              coalesce((p.e ->> 'row_count')::bigint, 0) desc;
end;
$function$;

comment on function custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb) is
  'AGT-N-8 + S3: group, bucket (in the organization''s calendar), filter and measure inside the read door, over the rows this person may see. With p_compare the same question is answered over the current window and the prior one (previous period, same period last year, or a fixed baseline), one row per group with both series, the delta and the two windows; without it the answer is what it always was, and the four comparison columns are null.';

update platform.client_callable_door d
   set identity_args = pg_get_function_identity_arguments('custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb)'::regprocedure),
       identity_argtypes = platform.door_argtypes(p.proargtypes),
       reason = 'Totals and counts grouped by a field or bucketed by time in the organization''s calendar, optionally compared with a prior window (S3). The visibility join is inside the aggregate''s own statement, below the aggregate node, for BOTH windows, so every number is computed over the rows this person may see and the rest are never fetched.'
  from pg_catalog.pg_proc p
 where p.oid = 'custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb)'::regprocedure
   and d.schema_name = 'custom' and d.function_name = 'record_aggregate';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- custom.dashboard_block_normalize — a block may carry `compare` and `target`.
-- ─────────────────────────────────────────────────────────────────────────────────────────

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
  if p_block ? 'target' and jsonb_typeof(p_block -> 'target') <> 'null' then
    if v_kind = 'stuck' then
      raise exception 'A "not moving" block lists records; there is no total for a target to measure.'
        using errcode = '22023', hint = 'Put the target on a number, line or column block.';
    end if;
    v_tgt := p_block -> 'target';
    if jsonb_typeof(v_tgt) <> 'object' then
      raise exception 'A target is written as an object, such as {"value": 120000, "label": "Monthly target"}.'
        using errcode = '22023', hint = 'A target has: value, label, measure, per.';
    end if;
    for v_mk in select k from jsonb_object_keys(v_tgt) k loop
      if v_mk not in ('value', 'label', 'measure', 'per') then
        raise exception '"%" is not part of a target', v_mk
          using errcode = '22023', hint = 'A target has: value, label, measure, per.';
      end if;
    end loop;
    begin
      v_value := case when jsonb_typeof(v_tgt -> 'value') in ('number', 'string') then (v_tgt ->> 'value')::numeric end;
    exception when others then
      v_value := null;
    end;
    if v_value is null then
      raise exception 'A target needs a number to aim at.'
        using errcode = '22023', hint = 'value is the number this block''s measure is aiming for, such as 120000.';
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
    v_label := coalesce(nullif(btrim(coalesce(v_tgt ->> 'label', '')), ''), 'Target');
    if length(v_label) > 80 then
      raise exception 'A target''s label is a few words, and this one is % characters.', length(v_label)
        using errcode = '22023', hint = 'Keep it to 80 characters: "Monthly target", "Goal", "Budget".';
    end if;
    v_out := v_out || jsonb_build_object('target', jsonb_build_object(
      'value', v_value, 'label', v_label, 'measure', v_mk, 'per', v_per));
  end if;

  return v_out;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- custom.dashboard_run — the canvas. Same three arguments, plus `p_compare` and `p_grain`.
-- ─────────────────────────────────────────────────────────────────────────────────────────

drop function custom.dashboard_run(uuid, uuid, jsonb);

create function custom.dashboard_run(p_organization_id uuid, p_dashboard_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_compare jsonb DEFAULT NULL::jsonb, p_grain text DEFAULT NULL::text)
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
        v_extra := v_extra || jsonb_build_object('target', v_tgt || jsonb_build_object(
          'current', v_cur,
          'progress', case when v_cur is null or (v_tgt ->> 'value')::numeric = 0 then null
                           else round(v_cur / (v_tgt ->> 'value')::numeric, 4) end,
          'pace', case
            when jsonb_typeof(v_block -> 'bucket') is distinct from 'object' then null
            when v_tgt ->> 'per' = 'bucket' then (v_tgt ->> 'value')::numeric
            when coalesce((v_windows ->> 'bucket_count')::integer, 0) > 0
              then round((v_tgt ->> 'value')::numeric / (v_windows ->> 'bucket_count')::integer, 2)
            else null end));
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

comment on function custom.dashboard_run(uuid, uuid, jsonb, jsonb, text) is
  'SCR-16 + S3: every block of one dashboard answered in one snapshot under the caller''s own principal. p_grain re-cuts every bucketed block to one date grain; p_compare compares every block that does not carry its own comparison. Each block answers its rows (with the prior series and deltas when compared), its windows, its totals and its target''s progress and pace; one block that refuses says why and the rest still answer.';

update platform.client_callable_door d
   set identity_args = pg_get_function_identity_arguments('custom.dashboard_run(uuid, uuid, jsonb, jsonb, text)'::regprocedure),
       identity_argtypes = platform.door_argtypes(p.proargtypes)
  from pg_catalog.pg_proc p
 where p.oid = 'custom.dashboard_run(uuid, uuid, jsonb, jsonb, text)'::regprocedure
   and d.schema_name = 'custom' and d.function_name = 'dashboard_run';

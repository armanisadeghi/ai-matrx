-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- Three ruled projections the timesheet renderers currently compute client-side as interims.
-- §9 rule 7: the renderer READS these facts, so the door serves them.
--
--   1. A `dst` block and midnight-crossing markers on `hr_timesheet_get`.
--   2. The actor's display name on the audit reads (`hr_timesheet_get` + `hr_punch_register`).
--   3. Rule names and thresholds on the calc evidence, replacing three bare uuids.
--
-- Authority: coordinator ruling (three projections); SPEC-TIME §9 rules 3 and 7.
--
-- Applied live as `hr_l3_56_timesheet_dst_actor_and_rule_evidence`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE DST FACTS ARE DERIVED FROM STORED BOUNDS, NOT FROM A CLOCK. Every figure comes from the
--    interval's own `started_at`/`ended_at` (UTC) read against its STAMPED `tz`. Nothing consults
--    `now()`, and nothing depends on the reader's locale — which is the whole reason the sentence
--    moves server-side. The client's Intl-derived interim can be swapped for `dst.sentence`
--    verbatim.
-- 2. ELAPSED vs WALL CLOCK IS THE WHOLE MECHANISM, AND BOTH ARE SERVED. `elapsed_hours` comes from
--    the UTC bounds (what the person actually worked); `wall_clock_hours` from the same bounds
--    rendered in the stamped zone (what the clock on the wall appeared to say). When they differ,
--    a transition happened inside the interval — that is the detection, and it needs no timezone
--    table lookup. Verified on the seeded weeks: the spring-forward interval reads wall-clock 8 /
--    elapsed 7, the fall-back one wall-clock 7 / elapsed 8.
-- 3. THE TRANSITION INSTANT IS FOUND GENERICALLY, NEVER ASSUMED TO BE 2:00 AM. `hr._dst_transition`
--    walks the span in 30-minute steps comparing the zone's UTC offset, so it works for zones that
--    shift at 00:00 or 03:00 and for the 30-minute shift in Lord Howe. Hardcoding 2:00 AM would be
--    right for America/Los_Angeles and wrong the first time somebody hires outside North America.
--    The announced wall time is the transition instant MINUS the signed shift, which is what
--    "clocks moved forward at 2:00 AM" actually names — the local time that was skipped or repeated.
-- 4. TWO GRAINS, BECAUSE THE READER ASKS TWO QUESTIONS. The interval block answers "why does this
--    shift's total not match its start and end times"; the week block answers "why is this week
--    167 hours". They are computed by the same helper over different bounds.
-- 5. `crosses_midnight` COMPARES THE LOCAL END DATE TO `local_work_date`, NOT TO THE START DATE. A
--    shift belongs to the work date it was stamped with; the question the renderer asks is whether
--    it runs past midnight OUT OF that date. `continues_into_date` carries the date it lands in, so
--    the renderer does not re-derive it and cannot disagree.
-- 6. THE ACTOR NAME REUSES hr_l3_41's SUPPRESSION, RATHER THAN A SECOND COPY OF IT.
--    `hr._subject_display_name` already implements the directory-tier rule (opt-out suppresses for
--    peers, never for HR or the subject). A null return means the renderer keeps its role wording —
--    "A manager" — so a restricted context degrades to exactly what it says today. One rule, two
--    callers; a parallel implementation is how the two would come to disagree about one person.
-- 7. 🚨 THE RULES JOIN MUST NOT FILTER `superseded`, AND THAT IS THE POINT. Three workweeks in this
--    database cite rules that hr_l3_54 superseded; those rows are RETAINED precisely so a snapshot
--    stays readable. Filtering them would blank the evidence on exactly the weeks whose evidence
--    matters most. The row's `status` is projected instead, so a reader can see they are looking at
--    the rule as it stood, not as it stands.
-- 9. THE HOUR FIGURES IN THE SENTENCE ARE FORMATTED ONCE, IN `hr._hours_text`. A plain FM mask
--    emits the trailing decimal point, so the first cut of this served "this wall-clock-8. shift
--    measured 7. hours" -- found by reading the sentence the door actually returned, not the SQL
--    that built it. 7.5 still renders as 7.5; 8.0000 renders as 8.
-- 8. THRESHOLDS ARE NORMALISED FOR DISPLAY, SOURCED FROM EACH RULE'S OWN PARAMETER NAMES. The
--    federal overtime row names its weekly threshold `threshold_hours`; California names the same
--    thing `weekly_threshold_hours`. A renderer should not have to know that. `weekly_ot_at` reads
--    whichever the row carries, and `jsonb_strip_nulls` drops what a rule does not have — the
--    federal row has no daily threshold, so it shows none rather than showing null.

-- ── 1. the DST helpers (decisions 1–4) ──────────────────────────────────────────────────────
-- decision 9: an FM mask still emits the decimal point when the value has no fraction, so a first
-- cut of this served "this wall-clock-8. shift measured 7. hours" -- caught by reading the actual
-- sentence rather than the code. These figures are read by people, so they are formatted once,
-- here, and every caller gets the same rendering.
create or replace function hr._hours_text(p_hours numeric)
returns text language sql immutable as $fn$
  select rtrim(rtrim(trim(to_char(p_hours, 'FM999999990.99')), '0'), '.');
$fn$;

create or replace function hr._dst_transition(p_tz text, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable
as $fn$
  -- decision 3: walk the span comparing the zone's own UTC offset. 30-minute steps cover the
  -- half-hour shift used in Australia/Lord_Howe; nothing here assumes a 2:00 AM North American rule.
  with steps as (
    select g t, ((g at time zone p_tz) - (g at time zone 'UTC')) off
      from generate_series(p_from, p_to, interval '30 minutes') g
  ), m as (
    select t, off, lag(off) over (order by t) prev from steps
  ), hit as (
    select t, off, prev from m where prev is not null and off <> prev order by t limit 1
  )
  select jsonb_build_object(
           'at_utc',        h.t,
           'at_local_date', (h.t at time zone p_tz)::date,
           'shift_minutes', round(extract(epoch from (h.off - h.prev)) / 60)::int,
           'direction',     case when h.off > h.prev then 'forward' else 'back' end,
           -- the wall time that was skipped (forward) or repeated (back)
           'at_local',      to_char((h.t at time zone p_tz) - (h.off - h.prev), 'FMHH12:MI AM'))
    from hit h;
$fn$;

create or replace function hr._interval_time_facts(
  p_started timestamptz, p_ended timestamptz, p_tz text, p_local_work_date date)
returns jsonb
language plpgsql stable
as $fn$
declare v_ls timestamp; v_le timestamp; v_elapsed numeric; v_wall numeric; v_dst jsonb; v_out jsonb;
begin
  if p_started is null or p_tz is null then
    return jsonb_build_object('crosses_midnight', false, 'continues_into_date', null, 'dst', null);
  end if;

  v_ls := p_started at time zone p_tz;
  v_le := case when p_ended is not null then p_ended at time zone p_tz end;

  -- decision 5: out of the stamped work date, not merely past the start's midnight
  v_out := jsonb_build_object(
    'crosses_midnight',    coalesce(v_le::date > p_local_work_date, false),
    'continues_into_date', case when v_le::date > p_local_work_date then v_le::date end);

  if p_ended is null then
    return v_out || jsonb_build_object('dst', null);
  end if;

  v_elapsed := round(extract(epoch from (p_ended - p_started)) / 3600.0, 4);
  v_wall    := round(extract(epoch from (v_le - v_ls))         / 3600.0, 4);
  v_out := v_out || jsonb_build_object('elapsed_hours', v_elapsed, 'wall_clock_hours', v_wall);

  v_dst := hr._dst_transition(p_tz, p_started, p_ended);
  if v_dst is null then
    return v_out || jsonb_build_object('dst', null);
  end if;

  -- §9 rule 3: the SERVER's sentence, composed from the stored span
  return v_out || jsonb_build_object('dst', v_dst || jsonb_build_object(
    'sentence', 'Clocks moved ' || (v_dst ->> 'direction') || ' at ' || (v_dst ->> 'at_local')
      || '; this wall-clock-' || hr._hours_text(v_wall)
      || ' shift measured '   || hr._hours_text(v_elapsed) || ' hours.'));
end
$fn$;

create or replace function hr._workweek_dst(p_tz text, p_start timestamptz, p_end timestamptz)
returns jsonb
language plpgsql stable
as $fn$
declare v_span numeric; v_dst jsonb;
begin
  if p_tz is null or p_start is null or p_end is null then return null; end if;
  v_span := round(extract(epoch from (p_end - p_start)) / 3600.0, 4);
  v_dst  := hr._dst_transition(p_tz, p_start, p_end);

  if v_dst is null then
    return jsonb_build_object('span_hours', v_span, 'observed', false, 'sentence', null);
  end if;

  return jsonb_build_object('span_hours', v_span, 'observed', true)
    || v_dst
    || jsonb_build_object('sentence',
         'Clocks moved ' || (v_dst ->> 'direction') || ' at ' || (v_dst ->> 'at_local')
         || ' on ' || (v_dst ->> 'at_local_date')
         || '; this workweek was ' || hr._hours_text(v_span) || ' hours long, not 168.');
end
$fn$;

-- ── 2. the rules evidence (decisions 7–8) ───────────────────────────────────────────────────
create or replace function hr._rules_evidence(p_ids uuid[])
returns jsonb
language sql stable security definer set search_path to 'hr','public'
as $fn$
  -- decision 7: NO status filter. Snapshots cite superseded rows and must stay readable.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',               r.id,
           'name',             rc.label,
           'jurisdiction_key', r.jurisdiction_key,
           'status',           r.status,
           'thresholds',       jsonb_strip_nulls(jsonb_build_object(
             -- decision 8: display keys normalised; values read from whatever the row names them
             'daily_ot_at',  case when rc.slug = 'overtime'    then r.parameters -> 'daily_threshold_hours' end,
             'weekly_ot_at', case when rc.slug = 'overtime'
                                  then coalesce(r.parameters -> 'weekly_threshold_hours',
                                                r.parameters -> 'threshold_hours') end,
             'dt_at',        case when rc.slug = 'double-time' then r.parameters -> 'daily_threshold_hours' end,
             'multiplier',   coalesce(r.parameters -> 'multiplier', r.parameters -> 'daily_multiplier'),
             'seventh_day_beyond_hours', r.parameters #> '{seventh_consecutive_day,beyond_hours}',
             'seventh_day_first_hours',  r.parameters #> '{seventh_consecutive_day,first_hours}')))
         order by rc.slug, r.jurisdiction_key), '[]'::jsonb)
    from unnest(coalesce(p_ids, '{}'::uuid[])) i(id)
    join hr.jurisdiction_rule r        on r.id  = i.id and r.deleted_at is null
    join hr.jurisdiction_rule_class rc on rc.id = r.rule_class_id;
$fn$;

revoke execute on function hr._dst_transition(text,timestamptz,timestamptz) from public, anon;
revoke execute on function hr._interval_time_facts(timestamptz,timestamptz,text,date) from public, anon;
revoke execute on function hr._workweek_dst(text,timestamptz,timestamptz) from public, anon;
revoke execute on function hr._rules_evidence(uuid[]) from public, anon;

-- ── 3. wire them into hr.timesheet_get ──────────────────────────────────────────────────────
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('hr.timesheet_get(uuid,uuid)'::regprocedure);

  if position('_interval_time_facts' in v_def) > 0 then
    raise notice 'hr_l3_56: timesheet_get already carries the projections';
    return;
  end if;

  -- (1) per-interval: crossing markers + the DST sentence
  if position('''started_at'', wi.started_at, ''ended_at'', wi.ended_at, ''tz'', wi.tz,' in v_def) = 0 then
    raise exception 'hr_l3_56: the interval projection has moved; refusing to guess';
  end if;
  v_def := replace(v_def,
    '''started_at'', wi.started_at, ''ended_at'', wi.ended_at, ''tz'', wi.tz,',
    '''started_at'', wi.started_at, ''ended_at'', wi.ended_at, ''tz'', wi.tz,' || E'\n' ||
    '               -- hr_l3_56: crossing markers and the server''''s DST sentence, from the stored' || E'\n' ||
    '               -- UTC bounds read in the STAMPED zone. The renderer reads; it does not derive.' || E'\n' ||
    '               ''time_facts'', hr._interval_time_facts(wi.started_at, wi.ended_at, wi.tz, wi.local_work_date),');

  -- (1b) per-week: the workweek DST block
  if position('''is_final'', ww.is_final,' in v_def) = 0 then
    raise exception 'hr_l3_56: the workweek projection has moved; refusing to guess';
  end if;
  v_def := replace(v_def,
    '''is_final'', ww.is_final,',
    '''is_final'', ww.is_final,' || E'\n' ||
    '      -- hr_l3_56 decision 4: why this week is 167 hours, not 168' || E'\n' ||
    '      ''dst'', hr._workweek_dst(ww.tz, ww.week_start_at, ww.week_end_at),');

  -- (2) the actor's name on BOTH audit blocks (punch chain and edit history)
  if (select count(*) from regexp_matches(v_def,
        '''actor'', jsonb_build_object\(''actor_type'', p\.actor_type,', 'g')) <> 2 then
    raise exception 'hr_l3_56: expected exactly 2 actor blocks in timesheet_get';
  end if;
  v_def := replace(v_def,
    '''actor'', jsonb_build_object(''actor_type'', p.actor_type,',
    '''actor'', jsonb_build_object(''actor_type'', p.actor_type,' || E'\n' ||
    '                                           -- hr_l3_56 decision 6: hr_l3_41''''s suppression,' || E'\n' ||
    '                                           -- not a second copy. NULL keeps the role wording.' || E'\n' ||
    '                                           ''actor_name'', hr._subject_display_name(p.actor_employment_id, v_uid),');

  -- (3) rule names and thresholds beside the bare ids, at both grains
  if position('''calc_ref'', jsonb_build_object(''rule_version_ids'', to_jsonb(ww.rule_version_ids),' in v_def) = 0
     or position('''calc_ref'', jsonb_build_object(''rule_version_ids'', to_jsonb(wi.rule_version_ids),' in v_def) = 0 then
    raise exception 'hr_l3_56: a calc_ref block has moved; refusing to guess';
  end if;
  v_def := replace(v_def,
    '''calc_ref'', jsonb_build_object(''rule_version_ids'', to_jsonb(ww.rule_version_ids),',
    '''calc_ref'', jsonb_build_object(''rule_version_ids'', to_jsonb(ww.rule_version_ids),' || E'\n' ||
    '                                     ''rules'', hr._rules_evidence(ww.rule_version_ids),');
  v_def := replace(v_def,
    '''calc_ref'', jsonb_build_object(''rule_version_ids'', to_jsonb(wi.rule_version_ids),',
    '''calc_ref'', jsonb_build_object(''rule_version_ids'', to_jsonb(wi.rule_version_ids),' || E'\n' ||
    '                                              ''rules'', hr._rules_evidence(wi.rule_version_ids),');

  execute v_def;
end
$mig$;

-- ── 4. the same actor name on hr.punch_register ─────────────────────────────────────────────
do $mig$
declare v_def text; v_n int;
begin
  v_def := pg_get_functiondef('hr.punch_register(jsonb,jsonb)'::regprocedure);

  if position('_subject_display_name' in v_def) > 0 then
    raise notice 'hr_l3_56: punch_register already names the actor';
    return;
  end if;

  v_n := (select count(*) from regexp_matches(v_def, '''actor_employment_id'', f\.actor_employment_id,', 'g'));
  if v_n <> 1 then
    raise exception 'hr_l3_56: expected exactly 1 actor block in punch_register, found %', v_n;
  end if;

  -- the block is wrapped in jsonb_strip_nulls, so a suppressed name drops the key entirely and
  -- the renderer keeps its role wording -- decision 6's degrade path, for free.
  v_def := replace(v_def,
    '''actor_employment_id'', f.actor_employment_id,',
    '''actor_employment_id'', f.actor_employment_id,' || E'\n' ||
    '                  ''actor_name'', hr._subject_display_name(f.actor_employment_id, v_uid),');

  execute v_def;
end
$mig$;

-- ── 5. self-assertions ──────────────────────────────────────────────────────────────────────
do $chk$
declare v_src text; v_j jsonb;
begin
  select prosrc into v_src from pg_proc where oid = 'hr.timesheet_get(uuid,uuid)'::regprocedure;
  if position('_interval_time_facts' in v_src) = 0
     or position('_workweek_dst' in v_src) = 0
     or position('_rules_evidence(ww.rule_version_ids)' in v_src) = 0
     or position('_rules_evidence(wi.rule_version_ids)' in v_src) = 0 then
    raise exception 'hr_l3_56: timesheet_get is missing one of the three projections';
  end if;
  if (select count(*) from regexp_matches(v_src, 'actor_name', 'g')) <> 2 then
    raise exception 'hr_l3_56: both audit blocks must name the actor';
  end if;

  select prosrc into v_src from pg_proc where oid = 'hr.punch_register(jsonb,jsonb)'::regprocedure;
  if position('actor_name' in v_src) = 0 then
    raise exception 'hr_l3_56: punch_register does not name the actor';
  end if;

  -- decision 6: one suppression rule, not a second implementation
  if position('directory_opt_out' in
      (select prosrc from pg_proc where oid = 'hr.timesheet_get(uuid,uuid)'::regprocedure)) > 0 then
    raise exception 'hr_l3_56: timesheet_get grew its own copy of the opt-out rule';
  end if;

  -- decision 7: superseded rules must still resolve, or the oldest snapshots go blank
  v_j := hr._rules_evidence((select array_agg(id) from hr.jurisdiction_rule where status = 'superseded'));
  if jsonb_array_length(v_j) <> 3 then
    raise exception 'hr_l3_56: superseded rules do not resolve; snapshot evidence would blank';
  end if;
  if not (v_j -> 0 ->> 'status' = 'superseded') then
    raise exception 'hr_l3_56: the evidence does not disclose that the rule is superseded';
  end if;

  -- decision 3: assert the finder DERIVES the transition, rather than asserting a string is absent.
  -- The first form of this check grepped prosrc for a wall time and matched its own explanatory
  -- comment -- the same self-match that bit check 17 and the arm_write gate. A positive assertion
  -- cannot do that.
  select prosrc into v_src from pg_proc
   where oid = 'hr._dst_transition(text,timestamptz,timestamptz)'::regprocedure;
  if position('generate_series' in v_src) = 0 or position('lag(off)' in v_src) = 0 then
    raise exception 'hr_l3_56: the transition is no longer derived from the zone''s own offset';
  end if;
end
$chk$;

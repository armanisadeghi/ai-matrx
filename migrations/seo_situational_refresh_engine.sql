-- KI-016 — SITUATIONAL STAMPS REFRESH THEMSELVES.
--
-- A situational stamp is a claim about NOW ("parked — 1 impression or fewer in
-- the last 28 days"). It carries an `as_of`, and C5 built the engine that
-- re-derives it. What was missing was anything that ever RAN that engine
-- unattended: a segment was only as fresh as the last time a person pressed
-- Re-evaluate, so "parked" quietly aged into a claim about last month while the
-- UI kept printing an as-of that looked current. An as-of that ages is worse
-- than no as-of at all — it is a lie with a timestamp on it.
--
-- 🚨 WHAT THIS IS NOT: a new scheduled task. `/operations/scheduled-tasks.md`
-- carried a PROPOSED `seo_situational_stamp_refresh` (daily 05:20 UTC) awaiting
-- Arman's approval by name and interval. It is superseded and never seeded.
-- Arman approved exactly ONE task for SEO engine automation —
-- `seo_engine_schedule_dispatcher`, every 15 minutes — and ruled that a row he
-- saves in the run console IS the approval record for that engine on that brand.
-- So this is an ENGINE in that console's registry, riding that one dispatcher,
-- with its cadence and bounds resolved through the existing cascade
-- (site > organization > system). Adding an engine is a row here and a row in
-- `CONSOLE_ENGINES`; it is never a second dispatcher and never a second cron.
--
-- THE THREE PIECES:
--   1. knobs — every ceiling this engine has is a platform.feature_knob row.
--   2. seo.fn_situational_sites_owing — the ONE "who needs this most" read, the
--      exact counterpart of seo.fn_topic_placement_sites_owing. The console and
--      the dispatcher share it; a second freshness metric is how a console comes
--      to disagree with the thing that spends.
--   3. seo.engine_schedules_due — one more branch, no new function.
--
-- Idempotent: additive knobs, CREATE OR REPLACE.

-- ───────────────────────── 1. the ceilings, as knobs ─────────────────────────

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description, set_by, basis, review_due)
values
  ('seo.situational_stamps', 'stale_after_hours', to_jsonb(24), to_jsonb(24), 'integer',
   'How old an as-of may get before a segment owes a refresh',
   'A condition matcher whose segment was last worked out longer ago than this is owed a re-derivation, and is what the run console counts as work.',
   'agent',
   'Search Console data lands once a day and the situational window is 28 days (seo.situational_stamps.window_days), so a segment cannot meaningfully change more than once a day — re-deriving more often would spend statement time to confirm yesterday''s answer. 24 hours also means an as-of a person reads is never more than one Search Console delivery behind, which is the strongest honesty this data can support. The pass costs no AI dollars (pure SQL, ~0.32 ms/stamp write measured 2026-08-23), so this number is about truthfulness, not budget.',
   (now() + interval '90 days')::date),
  ('seo.situational_stamps', 'max_passes_per_run', to_jsonb(25), to_jsonb(25), 'integer',
   'Round-trips one refresh run may take',
   'One evaluation pass writes at most writes_per_pass keywords and reports what is left; this is how many times a single run will go back for the rest before it stops and says the segment is still filling.',
   'agent',
   'Replaces a hard-coded 25 that had been sitting in the browser loop (MAX_EVALUATION_PASSES in features/marketing/search-console/data-dig.ts) — a ceiling in code is not a knob. 25 passes x writes_per_pass (8,000) is 200,000 keyword writes, and the largest 28-day window in the whole fleet is All Green Recycling at 27,234 keywords (measured 2026-08-23), so 25 clears the worst real case seven times over while still bounding a pathological loop. Every real segment measured so far finishes in ONE pass.',
   (now() + interval '90 days')::date)
on conflict (feature, key) do nothing;

-- ───────────────────────── 2. who owes a refresh ─────────────────────────────

create or replace function seo.fn_situational_sites_owing(p_limit integer default 100)
returns table(
  site_id uuid,
  organization_id uuid,
  matchers integer,
  stale_matchers integer,
  oldest_evaluated_at timestamptz,
  stamps integer
)
language sql
stable
security definer
set search_path to 'seo', 'web', 'platform', 'public', 'pg_temp'
as $$
  with hours as (
    select coalesce((k.value #>> '{}')::int, 24) as h
      from platform.feature_knob k
     where k.feature = 'seo.situational_stamps' and k.key = 'stale_after_hours'
  ),
  cutoff as (select now() - make_interval(hours => coalesce((select h from hours), 24)) as t),
  m as (
    select dm.site_id,
           count(*)::int as matchers,
           count(*) filter (
             where dm.last_evaluated_at is null or dm.last_evaluated_at < (select t from cutoff)
           )::int as stale_matchers,
           min(dm.last_evaluated_at) as oldest_evaluated_at
      from seo.dimension_value_matcher dm
     where dm.kind = 'condition'
       and dm.enabled
       and dm.deleted_at is null
     group by dm.site_id
  )
  select m.site_id,
         s.organization_id,
         m.matchers,
         m.stale_matchers,
         m.oldest_evaluated_at,
         (select count(*)::int
            from seo.keyword_facet kf
            join seo.dimension_value_matcher d2 on d2.id = kf.matcher_id
           where d2.site_id = m.site_id and d2.kind = 'condition'
             and kf.deleted_at is null) as stamps
    from m
    join web.site s on s.id = m.site_id and s.deleted_at is null and s.status = 'active'
   where m.stale_matchers > 0
   -- GREATEST NEED = the oldest claim. A NULL as-of has never been derived at
   -- all, which is the stalest thing there is, so it sorts first.
   order by m.oldest_evaluated_at asc nulls first, m.stale_matchers desc, m.site_id
   limit greatest(coalesce(p_limit, 100), 1);
$$;

comment on function seo.fn_situational_sites_owing(integer) is
  'THE "who owes a situational refresh" read (KI-016): sites with enabled condition matchers whose '
  'segment was last worked out longer ago than seo.situational_stamps.stale_after_hours, oldest '
  'first. The run console and seo.engine_schedules_due share it — a second freshness metric is how '
  'a console comes to disagree with the thing that spends.';

revoke all on function seo.fn_situational_sites_owing(integer) from public, anon;
grant execute on function seo.fn_situational_sites_owing(integer) to authenticated, service_role;

-- ───────────────────────── 3. what ONE brand's refresh looks like ────────────

create or replace function seo.situational_refresh_status(p_site_id uuid)
returns table(
  site_id uuid,
  matchers integer,
  stale_matchers integer,
  oldest_evaluated_at timestamptz,
  newest_evaluated_at timestamptz,
  stamps integer,
  stale_after_hours integer,
  autonomy jsonb
)
language sql
stable
security definer
set search_path to 'seo', 'web', 'platform', 'public', 'pg_temp'
as $$
  with hours as (
    select coalesce((k.value #>> '{}')::int, 24) as h
      from platform.feature_knob k
     where k.feature = 'seo.situational_stamps' and k.key = 'stale_after_hours'
  ),
  cutoff as (select now() - make_interval(hours => coalesce((select h from hours), 24)) as t)
  select p_site_id,
         count(dm.*)::int,
         count(dm.*) filter (
           where dm.last_evaluated_at is null or dm.last_evaluated_at < (select t from cutoff)
         )::int,
         min(dm.last_evaluated_at),
         max(dm.last_evaluated_at),
         (select count(*)::int
            from seo.keyword_facet kf
            join seo.dimension_value_matcher d2 on d2.id = kf.matcher_id
           where d2.site_id = p_site_id and d2.kind = 'condition' and kf.deleted_at is null),
         coalesce((select h from hours), 24),
         seo.fn_autonomy_gate(p_site_id, 'matcher_engine')
    from seo.dimension_value_matcher dm
   where dm.site_id = p_site_id and dm.kind = 'condition'
     and dm.enabled and dm.deleted_at is null;
$$;

comment on function seo.situational_refresh_status(uuid) is
  'One brand''s situational-refresh standing for the run console: how many condition matchers it '
  'has, how many are past their as-of, when the oldest was worked out, how many stamps they hold, '
  'and the autonomy mode the engine will obey. Same shape of answer as '
  'seo.topic_placement_status is for the placement engine.';

revoke all on function seo.situational_refresh_status(uuid) from public, anon;
grant execute on function seo.situational_refresh_status(uuid) to authenticated, service_role;

-- ───────────────────────── 4. the dispatcher learns the engine ───────────────

-- ONE branch added to the owed-work read and one to the in-flight fence. The
-- cascade, the due test, the ordering, the sites_per_run cap and the claim are
-- untouched: an engine is data to this function, never a fork of it.
create or replace function seo.engine_schedules_due(p_now timestamptz default now())
returns table(
  engine_slug text,
  site_id uuid,
  organization_id uuid,
  max_keywords_per_run integer,
  schedule_id uuid,
  scope_tier text
)
language sql
stable
security definer
set search_path to 'seo', 'web', 'public', 'pg_temp'
as $$
  with engines as (
    select distinct e.engine_slug
      from seo.engine_schedule e
     where e.deleted_at is null
       and e.enabled
  ),
  resolved as (
    select en.engine_slug, r.*
      from engines en
      cross join lateral seo.engine_schedule_resolve(en.engine_slug, null) r
  ),
  due as (
    select d.*
      from resolved d
     where d.enabled
       and case d.cadence
             when 'hourly' then
               d.last_dispatched_at is null
               or d.last_dispatched_at < date_trunc('hour', p_now)
             when 'daily' then
               p_now >= date_trunc('day', p_now) + coalesce(d.run_at_utc, time '00:00')
               and (
                 d.last_dispatched_at is null
                 or d.last_dispatched_at
                    < date_trunc('day', p_now) + coalesce(d.run_at_utc, time '00:00')
               )
             when 'weekly' then
               extract(dow from p_now)::int = coalesce(d.day_of_week, 0)
               and p_now >= date_trunc('day', p_now) + coalesce(d.run_at_utc, time '00:00')
               and (
                 d.last_dispatched_at is null
                 or d.last_dispatched_at
                    < date_trunc('day', p_now) + coalesce(d.run_at_utc, time '00:00')
               )
             -- An unrecognised cadence never fires. Silence beats guessing with money.
             else false
           end
  ),
  -- GREATEST NEED, from the read the engine and the console already use. Adding an
  -- engine adds a branch here (its own owed-work read) — never a new metric.
  need as (
    select 'seo.topic_placement'::text as engine_slug,
           n.site_id,
           n.pending_clicks,
           n.pending
      from seo.fn_topic_placement_sites_owing(100) n
    union all
    -- KI-016. "Need" for a refresh is STALENESS, not demand, so the ordering
    -- columns carry age: seconds since the oldest as-of (never derived = the
    -- stalest thing there is) and how many segments are past their window.
    select 'seo.situational_refresh'::text,
           r.site_id,
           coalesce(
             extract(epoch from (p_now - r.oldest_evaluated_at))::bigint,
             9223372036854775807)::bigint,
           r.stale_matchers
      from seo.fn_situational_sites_owing(100) r
  ),
  eligible as (
    select d.*, n.pending_clicks, n.pending
      from due d
      join need n
        on n.engine_slug = d.engine_slug
       and n.site_id = d.site_id
     where not exists (
       -- Never start a second paid pass over a site that already has one running.
       select 1
         from seo.collection_run cr
        where cr.site_id = d.site_id
          and cr.operation = case d.engine_slug
                               when 'seo.topic_placement' then 'keywords.topic_placement'
                               when 'seo.situational_refresh' then 'keywords.situational_refresh'
                               else null
                             end
          and cr.status not in ('completed', 'failed', 'abandoned', 'cancelled', 'expired')
          -- A run whose lease lapsed is dead, not in flight; otherwise one crashed
          -- process would fence a site forever.
          and coalesce(cr.lease_expires_at, cr.requested_at + interval '1 hour') > p_now
     )
  ),
  ranked as (
    select e.*,
           row_number() over (
             partition by e.schedule_id
             order by e.pending_clicks desc, e.pending desc, e.site_id
           ) as rn
      from eligible e
  )
  select r.engine_slug,
         r.site_id,
         r.organization_id,
         r.max_keywords_per_run,
         r.schedule_id,
         r.scope_tier
    from ranked r
   -- `sites_per_run` bounds the winning ROW's fan-out: a system row capped at 3 sends 3
   -- of the sites that fall through to it, and an organization's own row bounds only its
   -- own brands. The column lives on the row, so the cap does too.
   where r.rn <= greatest(r.sites_per_run, 1)
   order by r.pending_clicks desc, r.pending desc, r.site_id;
$$;

comment on function seo.engine_schedules_due(timestamptz) is
  'The engine/site pairs a dispatcher tick should run right now: cascade winner, enabled, '
  'window open, not already dispatched in this window, site owes work, no in-flight run, '
  'ordered by greatest need and capped by the winning rows sites_per_run. Two engines live here — '
  'seo.topic_placement (need = owed clicks) and seo.situational_refresh (need = age of the oldest '
  'as-of, KI-016). Read-only — seo.engine_schedules_claim is what the dispatcher actually calls.';

revoke all on function seo.engine_schedules_due(timestamptz) from public;
grant execute on function seo.engine_schedules_due(timestamptz) to service_role, postgres;

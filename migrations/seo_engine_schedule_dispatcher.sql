-- KI-049 — the SEO engine schedule DISPATCHER: ONE cascade+due resolver, in the database.
--
-- Arman approved exactly one scheduled task for this — `seo_engine_schedule_dispatcher`,
-- every 15 minutes — to fire the schedules he saves in the run console's Schedule tab.
-- A row he saves there IS the approval record; nothing else in this system may start a
-- paid SEO engine pass on a timer.
--
-- WHY THE CASCADE LIVES HERE AND NOWHERE ELSE. The frontend used to own a private copy
-- of "site > organization > system, nearest wins" (`resolveScheduleForSite` in
-- features/marketing/seo/run-console/data.ts). Two copies of a money-spending rule is a
-- guarantee that the console will one day SHOW one schedule while the dispatcher RUNS
-- another. `seo.engine_schedule_resolve` is now the only implementation; the frontend
-- reads through it and the dispatcher reads through it.
--
-- THE THREE OBJECTS:
--
--   seo.engine_schedule_resolve(engine_slug, site_ids)  — SECURITY INVOKER, STABLE.
--       The cascade itself. One row per site with the schedule that GOVERNS it,
--       whatever its enabled state (a disabled brand row still beats an enabled system
--       row — "a lower tier's own row is never overwritten by a higher one" means the
--       brand's OFF is an answer, not an absence). RLS applies normally, so the console
--       sees exactly what its operator is allowed to see.
--
--   seo.engine_schedules_due(p_now)                     — SECURITY DEFINER, STABLE.
--       The rows a tick should run: enabled winners whose window has opened and that
--       have not already fired inside it, restricted to sites that actually owe work,
--       ordered by GREATEST NEED (most owed clicks first — the same
--       seo.fn_topic_placement_sites_owing read the console and the engine already use;
--       no second coverage metric exists), capped by the winning row's own
--       `sites_per_run`, and skipping any site with an in-flight run of that operation.
--       Definer because the dispatcher must see every organization's sites; EXECUTE is
--       granted to service_role/postgres only, never to `authenticated`.
--
--   seo.engine_schedules_claim(p_now)                   — SECURITY DEFINER, VOLATILE.
--       The ONLY thing the dispatcher calls. Selects the due set and stamps
--       `last_dispatched_at` in the same statement under FOR UPDATE SKIP LOCKED, so two
--       overlapping ticks cannot double-spend: the loser either skips the locked row or
--       re-reads it already dispatched. A claim that is stamped and then FAILS does not
--       retry until the next window — for unattended spend, "misses one window" is the
--       correct failure direction and "runs twice" is not.
--
-- Idempotent: additive column, CREATE OR REPLACE functions.

-- ─────────────────────────── 1. the claim column ───────────────────────────

alter table seo.engine_schedule
  add column if not exists last_dispatched_at timestamptz;

comment on column seo.engine_schedule.last_dispatched_at is
  'When the dispatcher last fired this row. Stamped by seo.engine_schedules_claim under '
  'FOR UPDATE SKIP LOCKED; the due test refuses a row already dispatched inside the '
  'current window. Never written by the console UI.';

create index if not exists engine_schedule_dispatch_idx
  on seo.engine_schedule (engine_slug, enabled, last_dispatched_at)
  where deleted_at is null;

-- ─────────────────────────── 2. the cascade ───────────────────────────

create or replace function seo.engine_schedule_resolve(
  p_engine_slug text,
  p_site_ids uuid[] default null
)
returns table(
  site_id uuid,
  organization_id uuid,
  schedule_id uuid,
  scope_tier text,
  cadence text,
  run_at_utc time without time zone,
  day_of_week smallint,
  max_keywords_per_run integer,
  sites_per_run integer,
  enabled boolean,
  last_dispatched_at timestamptz
)
language sql
stable
security invoker
set search_path to 'seo', 'web', 'public', 'pg_temp'
as $$
  with candidate_sites as (
    select s.id, s.organization_id
      from web.site s
     where s.deleted_at is null
       and s.status = 'active'
       and (p_site_ids is null or s.id = any (p_site_ids))
  ),
  live as (
    select e.*
      from seo.engine_schedule e
     where e.engine_slug = p_engine_slug
       and e.deleted_at is null
  )
  select cs.id,
         cs.organization_id,
         w.id,
         w.scope_tier,
         w.cadence,
         w.run_at_utc,
         w.day_of_week,
         w.max_keywords_per_run,
         w.sites_per_run,
         w.enabled,
         w.last_dispatched_at
    from candidate_sites cs
    join lateral (
      select l.*
        from live l
       where (l.scope_tier = 'site' and l.site_id = cs.id)
          or (l.scope_tier = 'organization' and l.scope_organization_id = cs.organization_id)
          or (l.scope_tier = 'system')
       -- Nearest wins. The tie-break inside a tier is newest-then-id so the answer is
       -- deterministic even if a duplicate row is ever authored.
       order by case l.scope_tier
                  when 'site' then 0
                  when 'organization' then 1
                  else 2
                end,
                l.updated_at desc,
                l.id
       limit 1
    ) w on true;
$$;

comment on function seo.engine_schedule_resolve(text, uuid[]) is
  'THE cascade for seo.engine_schedule: site > organization > system, nearest wins, '
  'enabled state included rather than filtered (a brand row that is OFF still governs). '
  'The one implementation — the run console reads through it and so does the dispatcher.';

-- ─────────────────────────── 3. what is due now ───────────────────────────

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
  'ordered by greatest need and capped by the winning rows sites_per_run. Read-only — '
  'seo.engine_schedules_claim is what the dispatcher actually calls.';

-- ─────────────────────────── 4. the claim ───────────────────────────

create or replace function seo.engine_schedules_claim(p_now timestamptz default now())
returns table(
  engine_slug text,
  site_id uuid,
  organization_id uuid,
  max_keywords_per_run integer,
  schedule_id uuid,
  scope_tier text
)
language sql
volatile
security definer
set search_path to 'seo', 'web', 'public', 'pg_temp'
as $$
  with candidate as (
    select * from seo.engine_schedules_due(p_now)
  ),
  locked as (
    select e.id
      from seo.engine_schedule e
     where e.id in (select distinct c.schedule_id from candidate c)
       for update skip locked
  ),
  claimed as (
    update seo.engine_schedule e
       set last_dispatched_at = p_now,
           updated_at = now()
     where e.id in (select l.id from locked l)
    returning e.id
  )
  select c.engine_slug,
         c.site_id,
         c.organization_id,
         c.max_keywords_per_run,
         c.schedule_id,
         c.scope_tier
    from candidate c
    join claimed k on k.id = c.schedule_id;
$$;

comment on function seo.engine_schedules_claim(timestamptz) is
  'Claim-and-return: stamps last_dispatched_at on every due schedule row under FOR UPDATE '
  'SKIP LOCKED in the same statement that selects it, so two overlapping dispatcher ticks '
  'cannot double-spend. The second call inside a window returns nothing.';

-- ─────────────────────────── 5. who may call what ───────────────────────────

-- The cascade is invoker-rights and RLS-bounded: the console may read it.
grant execute on function seo.engine_schedule_resolve(text, uuid[]) to authenticated, service_role;

-- The dispatcher reads are definer-rights and see EVERY organization's sites. Nothing
-- signed in as a user may call them.
revoke all on function seo.engine_schedules_due(timestamptz) from public;
revoke all on function seo.engine_schedules_claim(timestamptz) from public;
grant execute on function seo.engine_schedules_due(timestamptz) to service_role, postgres;
grant execute on function seo.engine_schedules_claim(timestamptz) to service_role, postgres;

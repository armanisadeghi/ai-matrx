-- P5 Study Intelligence — the AI Study Planner persistence layer.
--
-- Three owner-scoped `education.` entities on the canonical platform pattern
-- (base columns + trigger trio + entity RLS via iam.apply_rls), mirroring the
-- existing study spine (study_goal/study_session). A plan is a LIVING document:
-- the planner agent (re)generates it from exam goals + item_mastery (FSRS) +
-- available time, and adaptive re-planning rewrites the day/block rows on new
-- performance data — so the child rows are cheap to regenerate, never precious.
--
--   study_plan       — one row per generated schedule (config snapshot + rationale)
--   study_plan_day   — one row per calendar day in the plan (rest-day + per-day rollup)
--   study_plan_block — one row per study task within a day (what to study, for how long, why)
--
-- All three are `entity` variant (owner = created_by), exactly like study_goal:
-- planner data is personal, not shared, so no composition/sharing wiring is
-- needed. Idempotent (IF NOT EXISTS / re-runnable apply_rls). Applied live to
-- txzxabzwovsujtloxrus via Supabase MCP.

-- ── TABLES ──────────────────────────────────────────────────────────────────────
create table if not exists education.study_plan (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  visibility platform.visibility not null default 'private',
  title text not null,
  status text not null default 'active' check (status in ('active','completed','archived','superseded')),
  start_date date not null,
  end_date date,
  -- Anti-burnout controls (README §6 / P5 mandate): available daily time, an
  -- optional gentle daily review cap, and rest days (ISO weekday 0=Sun..6=Sat)
  -- the planner keeps clear.
  daily_minutes integer not null default 30,
  daily_item_cap integer,
  rest_days smallint[] not null default '{}'::smallint[],
  -- Optional link to the exam goal this plan is built around.
  goal_id uuid references education.study_goal(id),
  -- Provenance: 'ai' once the planner agent authored it, 'heuristic' for the
  -- deterministic fallback. `generator_agent_id` pins the authoring agent.
  generated_by text not null default 'heuristic' check (generated_by in ('ai','heuristic')),
  generator_agent_id uuid,
  -- The AI's overall plan narrative ("why this shape"), shown at the top of the plan.
  rationale text,
  -- Snapshot of the inputs the plan was generated from (goals, mastery summary,
  -- availability) — lets re-planning diff against what changed.
  config jsonb not null default '{}'::jsonb,
  last_planned_at timestamptz
);
create index if not exists idx_study_plan_owner_status on education.study_plan(created_by, status);
create index if not exists idx_study_plan_goal on education.study_plan(goal_id);

create table if not exists education.study_plan_day (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  visibility platform.visibility not null default 'private',
  plan_id uuid not null references education.study_plan(id) on delete cascade,
  day_date date not null,
  target_minutes integer not null default 0,
  is_rest_day boolean not null default false,
  status text not null default 'pending' check (status in ('pending','partial','done','skipped','rest')),
  -- Why this day looks the way it does ("light day before the exam"; "recovery
  -- day — backlog triaged after your absence").
  rationale text,
  constraint study_plan_day_uniq unique (plan_id, day_date)
);
create index if not exists idx_study_plan_day_plan on education.study_plan_day(plan_id, day_date);

create table if not exists education.study_plan_block (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  visibility platform.visibility not null default 'private',
  plan_id uuid not null references education.study_plan(id) on delete cascade,
  day_id uuid references education.study_plan_day(id) on delete cascade,
  day_date date not null,
  -- What kind of study task this is. 'review' = FSRS-due queue; 'weak_area' =
  -- struggle-flagged drill; 'learn' = new material; 'quiz'/'practice_test' =
  -- assessment; 'rest' = a deliberate break block.
  target_kind text not null default 'review'
    check (target_kind in ('review','learn','weak_area','quiz','practice_test','rest','custom')),
  -- The item_type this block studies (e.g. 'fc_card'); null for a generic activity.
  item_type text,
  -- Where to send the learner: {setId?, topic?, goalId?, href?}. Polymorphic so
  -- the block never needs a per-mode column.
  target_ref jsonb not null default '{}'::jsonb,
  label text not null,
  estimated_minutes integer not null default 10,
  estimated_items integer,
  -- Suggested study mode (e.g. 'classic_review','fast_fire') for the deep link.
  method text,
  ordering integer not null default 0,
  status text not null default 'pending' check (status in ('pending','done','skipped')),
  rationale text
);
create index if not exists idx_study_plan_block_plan on education.study_plan_block(plan_id, day_date, ordering);
create index if not exists idx_study_plan_block_day on education.study_plan_block(day_id);

-- ── CANONICAL TRIGGER TRIO (+ org resolution) ──────────────────────────────────
-- Root entities: _stamp_actor, _touch_row, _stamp_org_default (creator personal-org
-- fallback), _version_capture('<token>'). Same trio as study_goal/study_session.
do $$
declare t record;
begin
  for t in select unnest(array['study_plan','study_plan_day','study_plan_block']) as tbl loop
    execute format('drop trigger if exists _stamp_actor on education.%I', t.tbl);
    execute format('create trigger _stamp_actor before insert or update on education.%I for each row execute function platform._stamp_actor()', t.tbl);
    execute format('drop trigger if exists _touch_row on education.%I', t.tbl);
    execute format('create trigger _touch_row before insert or update on education.%I for each row execute function platform._touch_row()', t.tbl);
    execute format('drop trigger if exists _stamp_org_default on education.%I', t.tbl);
    execute format('create trigger _stamp_org_default before insert on education.%I for each row execute function public._stamp_org_default()', t.tbl);
    execute format('drop trigger if exists _version_capture on education.%I', t.tbl);
    execute format('create trigger _version_capture after insert or update or delete on education.%I for each row execute function platform._version_capture(%L)', t.tbl, t.tbl);
  end loop;
end $$;

-- ── REGISTER + RLS ──────────────────────────────────────────────────────────────
insert into platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_versioned, is_active)
select v.token, 'education', v.tbl, v.label, 'private', false, true, true
from (values
  ('study_plan','study_plan','Study Plan'),
  ('study_plan_day','study_plan_day','Study Plan Day'),
  ('study_plan_block','study_plan_block','Study Plan Block')
) v(token,tbl,label)
where not exists (select 1 from platform.entity_types e where e.token = v.token);

select iam.apply_rls('education','study_plan','study_plan','entity');
select iam.apply_rls('education','study_plan_day','study_plan_day','entity');
select iam.apply_rls('education','study_plan_block','study_plan_block','entity');

-- ── GRANTS (RLS gates rows; without grants nothing reads — db-rules §6d) ────────
grant select, insert, update, delete on
  education.study_plan, education.study_plan_day, education.study_plan_block to authenticated;
grant all on
  education.study_plan, education.study_plan_day, education.study_plan_block to service_role;

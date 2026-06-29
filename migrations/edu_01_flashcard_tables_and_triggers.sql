-- Education module canonical tables (ground-up, db-rules.md compliant).
-- Content: fc_set, fc_card, fc_detail(component).  Shared study spine (polymorphic over
-- item_type/item_id): study_session, study_attempt(ledger), item_mastery, study_goal.
-- File-reference columns are plain uuid (logical file_id handles; physical location is
-- mutable per db-rules §1 — no cross-schema FK). Idempotent.
-- Applied live to txzxabzwovsujtloxrus via Supabase MCP.

-- ── CONTENT ────────────────────────────────────────────────────────────────────
create table if not exists education.fc_set (
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
  name text not null,
  description text,
  topic text,
  lesson text,
  difficulty text check (difficulty is null or difficulty in ('easy','medium','hard')),
  audio_overview_file_id uuid
);

create table if not exists education.fc_card (
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
  front text not null,
  back text not null,
  card_kind text not null default 'basic',
  difficulty text check (difficulty is null or difficulty in ('easy','medium','hard')),
  topic text,
  lesson text,
  personal_notes text,
  dynamic_content jsonb not null default '{}'::jsonb
);

create table if not exists education.fc_detail (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  card_id uuid not null references education.fc_card(id) on delete cascade,
  kind text not null,
  text text not null,
  audio_file_id uuid,
  generation_status text not null default 'pending' check (generation_status in ('pending','text_ready','audio_ready','failed')),
  generated_by text not null default 'agent' check (generated_by in ('agent','user')),
  position integer not null default 0
);
create index if not exists idx_fc_detail_card on education.fc_detail(card_id);

-- ── SHARED STUDY SPINE ──────────────────────────────────────────────────────────
create table if not exists education.study_session (
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
  mode text not null default 'flashcards',
  source_kind text check (source_kind is null or source_kind in ('set','dynamic_batch','adaptive')),
  source_set_id uuid references education.fc_set(id),
  source_query jsonb,
  settings jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active','completed','abandoned')),
  aggregate_score jsonb,
  session_audio_file_id uuid,
  session_transcript text,
  session_review jsonb
);
create index if not exists idx_study_session_source_set on education.study_session(source_set_id);

create table if not exists education.study_attempt (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  item_type text not null,
  item_id uuid not null,
  session_id uuid references education.study_session(id),
  method text not null default 'flashcards',
  result text check (result is null or result in ('correct','partial','incorrect')),
  score jsonb,
  score_value numeric,
  response_kind text check (response_kind is null or response_kind in ('spoken','written','typed','handwritten','selected')),
  response_audio_file_id uuid,
  response_image_file_id uuid,
  response_transcript text,
  latency_ms integer,
  graded_by text
);
create index if not exists idx_study_attempt_item on education.study_attempt(item_type, item_id, created_at);
create index if not exists idx_study_attempt_session on education.study_attempt(session_id);
create index if not exists idx_study_attempt_creator_item on education.study_attempt(created_by, item_type, item_id);

create table if not exists education.item_mastery (
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
  item_type text not null,
  item_id uuid not null,
  mastery_score numeric,
  box smallint,
  interval_days integer,
  ease numeric,
  difficulty numeric,
  stability numeric,
  retrievability numeric,
  last_review timestamptz,
  due_at timestamptz,
  last_result text,
  last_attempt_at timestamptz,
  attempt_count integer not null default 0,
  correct_count integer not null default 0,
  streak integer not null default 0,
  struggle_flag boolean not null default false,
  collapse_state text not null default 'auto' check (collapse_state in ('expanded','collapsed','auto')),
  constraint item_mastery_owner_item_uniq unique (created_by, item_type, item_id)
);
create index if not exists idx_item_mastery_due on education.item_mastery(created_by, due_at);

create table if not exists education.study_goal (
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
  target_date date,
  status text not null default 'active' check (status in ('active','paused','achieved','archived'))
);

-- ── CANONICAL TRIGGER TRIO (+ org resolution) ──────────────────────────────────
-- Root entities: _stamp_actor, _touch_row, _stamp_org_default (creator personal-org
-- fallback), _version_capture('<token>').
do $$
declare t record;
begin
  for t in select unnest(array['fc_set','fc_card','study_session','item_mastery','study_goal']) as tbl loop
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

-- Component fc_detail: inherit org from parent fc_card (via card_id).
drop trigger if exists _stamp_actor on education.fc_detail;
create trigger _stamp_actor before insert or update on education.fc_detail for each row execute function platform._stamp_actor();
drop trigger if exists _touch_row on education.fc_detail;
create trigger _touch_row before insert or update on education.fc_detail for each row execute function platform._touch_row();
drop trigger if exists _inherit_org on education.fc_detail;
create trigger _inherit_org before insert on education.fc_detail for each row execute function platform.inherit_org_from_parent('education','fc_card','card_id');
drop trigger if exists _version_capture on education.fc_detail;
create trigger _version_capture after insert or update or delete on education.fc_detail for each row execute function platform._version_capture('fc_detail');

-- Ledger study_attempt: org from creator (item is polymorphic); append-only via RLS.
drop trigger if exists _stamp_actor on education.study_attempt;
create trigger _stamp_actor before insert or update on education.study_attempt for each row execute function platform._stamp_actor();
drop trigger if exists _touch_row on education.study_attempt;
create trigger _touch_row before insert or update on education.study_attempt for each row execute function platform._touch_row();
drop trigger if exists _stamp_org_default on education.study_attempt;
create trigger _stamp_org_default before insert on education.study_attempt for each row execute function public._stamp_org_default();
drop trigger if exists _version_capture on education.study_attempt;
create trigger _version_capture after insert or update or delete on education.study_attempt for each row execute function platform._version_capture('study_attempt');

-- ── GRANTS (RLS gates rows; without grants nothing reads — db-rules §6d) ────────
grant select, insert, update, delete on education.fc_set, education.fc_card, education.fc_detail,
  education.study_session, education.item_mastery, education.study_goal to authenticated;
grant select, insert on education.study_attempt to authenticated;  -- append-only ledger
grant all on education.fc_set, education.fc_card, education.fc_detail, education.study_session,
  education.study_attempt, education.item_mastery, education.study_goal to service_role;

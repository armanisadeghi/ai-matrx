-- Flashcards Competitive Parity Push — Phase 3: weak-area drill + daily streak.
--
-- 1) `education.study_session.source_kind` CHECK widened to allow 'weak_area'
--    (the new cross-set drill surface, mirroring the existing 'adaptive' due
--    queue). Idempotent: drop-then-add the constraint by name.
-- 2) New `education.study_streak` — one row per user, atomically bumped by an
--    AFTER INSERT trigger on `study_session` (so ANY study mode — flashcards,
--    fast fire, future quiz modes — count toward the streak with no
--    per-surface client wiring). In-app only per the plan: no push/email.

alter table education.study_session
  drop constraint if exists study_session_source_kind_check;

alter table education.study_session
  add constraint study_session_source_kind_check
  check (source_kind is null or source_kind in ('set', 'dynamic_batch', 'adaptive', 'weak_area'));

create table if not exists education.study_streak (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references iam.organizations(id),
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_active_date date,
  updated_at timestamptz not null default now()
);

alter table education.study_streak enable row level security;

drop policy if exists study_streak_select_own on education.study_streak;
create policy study_streak_select_own on education.study_streak
  for select using (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy for authenticated users — the streak is
-- written ONLY by the SECURITY DEFINER trigger function below, never by the
-- client directly (mirrors item_mastery's "atomic writer" invariant).

create or replace function education.bump_study_streak()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_user uuid := new.created_by;
  v_today date := (now() at time zone 'utc')::date;
  v_row education.study_streak%rowtype;
begin
  if v_user is null then
    return new;
  end if;

  select * into v_row from education.study_streak where user_id = v_user for update;

  if v_row.user_id is null then
    insert into education.study_streak (user_id, organization_id, current_streak, longest_streak, last_active_date)
    values (v_user, new.organization_id, 1, 1, v_today);
  elsif v_row.last_active_date = v_today then
    -- Already counted today — no-op (a learner can open multiple sessions/day).
    null;
  elsif v_row.last_active_date = v_today - 1 then
    update education.study_streak
       set current_streak = v_row.current_streak + 1,
           longest_streak = greatest(v_row.longest_streak, v_row.current_streak + 1),
           last_active_date = v_today,
           updated_at = now()
     where user_id = v_user;
  else
    -- Gap of 2+ days (or first-ever gap after a null date) — streak resets.
    update education.study_streak
       set current_streak = 1,
           longest_streak = greatest(v_row.longest_streak, 1),
           last_active_date = v_today,
           updated_at = now()
     where user_id = v_user;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_bump_study_streak on education.study_session;
create trigger trg_bump_study_streak
  after insert on education.study_session
  for each row
  execute function education.bump_study_streak();

grant select on education.study_streak to authenticated;

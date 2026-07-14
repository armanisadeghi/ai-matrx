-- edu_guardian_link.sql
--
-- Parent / Guardian dashboard (VISION §14 + "Coming Soon: Parent and guardian
-- dashboard"). Model: a guardian is granted READ-ONLY access to a linked
-- student's study data. The relationship is a genuinely new entity with its own
-- identity + consent lifecycle (pending → active → revoked), so it gets its own
-- table rather than shoehorning "all of a user's study data" into the
-- resource-scoped `permissions` system (no physical resource row to point at).
--
-- PRIVACY IS THE POINT: a guardian can NEVER self-grant. Access is conferred
-- ONLY by a link the STUDENT created (`guardian_grant`) or approved
-- (`guardian_respond`). A guardian-initiated `guardian_request_student` sits
-- `status='pending'` and confers NOTHING until the student approves. Every
-- study-data read RPC re-checks the active link (defence in depth) — RLS on the
-- underlying spine tables (`created_by = auth.uid()`) never grants cross-user
-- reads, so these SECURITY DEFINER RPCs are the ONLY guardian read path.
--
-- Idempotent: CREATE ... IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS.

-- ─── Table ────────────────────────────────────────────────────────────────────
create table if not exists education.guardian_link (
  id                uuid primary key default gen_random_uuid(),
  guardian_user_id  uuid not null references auth.users(id) on delete cascade,
  student_user_id   uuid not null references auth.users(id) on delete cascade,
  status            text not null default 'active'
                      check (status in ('pending', 'active', 'revoked')),
  relationship      text,                              -- optional label: 'parent', 'guardian', …
  requested_by      text not null default 'student'
                      check (requested_by in ('student', 'guardian')),
  created_by        uuid not null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  reviewed_at       timestamptz,                       -- when the student approved / granted
  revoked_at        timestamptz,
  constraint guardian_link_not_self check (guardian_user_id <> student_user_id),
  constraint guardian_link_unique unique (guardian_user_id, student_user_id)
);

create index if not exists idx_guardian_link_guardian
  on education.guardian_link (guardian_user_id, status);
create index if not exists idx_guardian_link_student
  on education.guardian_link (student_user_id, status);

comment on table education.guardian_link is
  'Guardian↔student read-access grants for the parent/guardian dashboard. Only status=active confers read access; access is student-consented (see public.guardian_* RPCs).';

-- ─── RLS: each party sees only their own rows; ALL writes go through RPCs ─────
alter table education.guardian_link enable row level security;

drop policy if exists guardian_link_select on education.guardian_link;
create policy guardian_link_select on education.guardian_link
  for select using (
    guardian_user_id = auth.uid() or student_user_id = auth.uid()
  );
-- No INSERT/UPDATE/DELETE policies: the SECURITY DEFINER RPCs below are the only
-- write path, so consent rules can never be bypassed by a direct table write.

grant select on education.guardian_link to authenticated;

-- ─── Internal helpers (NOT granted to authenticated — called only from the
--     definer RPCs below, which run with owner rights) ──────────────────────
create or replace function public.guardian_find_user_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  select id from auth.users
  where lower(email) = lower(btrim(p_email))
  limit 1;
$$;
revoke all on function public.guardian_find_user_by_email(text) from public, authenticated, anon;

-- The single access predicate every guardian read re-checks.
create or replace function public.guardian_has_active_link(p_student_id uuid)
returns boolean
language sql
security definer
set search_path = education, public, pg_temp
as $$
  select exists (
    select 1 from education.guardian_link
    where guardian_user_id = auth.uid()
      and student_user_id = p_student_id
      and status = 'active'
  );
$$;

create or replace function public.guardian_assert_access(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = education, public, pg_temp
as $$
begin
  if not public.guardian_has_active_link(p_student_id) then
    raise exception 'not authorized to view this student''s study data'
      using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.guardian_assert_access(uuid) from public, authenticated, anon;

-- Public convenience + server-gate (used by the [studentId] route server component).
create or replace function public.guardian_can_view(p_student_id uuid)
returns boolean
language sql
security definer
set search_path = education, public, pg_temp
as $$
  select public.guardian_has_active_link(p_student_id);
$$;

-- ─── Consent lifecycle RPCs ──────────────────────────────────────────────────

-- STUDENT grants a guardian read access immediately (the student is the grantor).
create or replace function public.guardian_grant(
  p_guardian_email text,
  p_relationship   text default null
)
returns education.guardian_link
language plpgsql
security definer
set search_path = education, public, pg_temp
as $$
declare
  v_guardian uuid;
  v_row education.guardian_link;
begin
  v_guardian := public.guardian_find_user_by_email(p_guardian_email);
  if v_guardian is null then
    raise exception 'No account found for %', p_guardian_email using errcode = 'P0002';
  end if;
  if v_guardian = auth.uid() then
    raise exception 'You cannot add yourself as a guardian' using errcode = '22023';
  end if;

  insert into education.guardian_link
    (guardian_user_id, student_user_id, status, relationship, requested_by, created_by, reviewed_at)
  values
    (v_guardian, auth.uid(), 'active', p_relationship, 'student', auth.uid(), now())
  on conflict (guardian_user_id, student_user_id) do update
    set status       = 'active',
        relationship = coalesce(excluded.relationship, education.guardian_link.relationship),
        reviewed_at  = now(),
        revoked_at   = null,
        updated_at   = now()
  returning * into v_row;
  return v_row;
end;
$$;

-- GUARDIAN requests access to a student — inert (pending) until the student approves.
create or replace function public.guardian_request_student(
  p_student_email text,
  p_relationship  text default null
)
returns education.guardian_link
language plpgsql
security definer
set search_path = education, public, pg_temp
as $$
declare
  v_student uuid;
  v_row education.guardian_link;
begin
  v_student := public.guardian_find_user_by_email(p_student_email);
  if v_student is null then
    raise exception 'No account found for %', p_student_email using errcode = 'P0002';
  end if;
  if v_student = auth.uid() then
    raise exception 'You cannot request access to your own account' using errcode = '22023';
  end if;

  insert into education.guardian_link
    (guardian_user_id, student_user_id, status, relationship, requested_by, created_by)
  values
    (auth.uid(), v_student, 'pending', p_relationship, 'guardian', auth.uid())
  on conflict (guardian_user_id, student_user_id) do update
    -- Re-requesting after a revoke re-opens a pending request; an already-active
    -- link is left untouched.
    set status       = case when education.guardian_link.status = 'active' then 'active' else 'pending' end,
        relationship = coalesce(excluded.relationship, education.guardian_link.relationship),
        requested_by = 'guardian',
        revoked_at   = null,
        updated_at   = now()
  returning * into v_row;
  return v_row;
end;
$$;

-- STUDENT approves or declines a guardian's pending request.
create or replace function public.guardian_respond(
  p_guardian_user_id uuid,
  p_approve          boolean
)
returns education.guardian_link
language plpgsql
security definer
set search_path = education, public, pg_temp
as $$
declare
  v_row education.guardian_link;
begin
  update education.guardian_link
    set status      = case when p_approve then 'active' else 'revoked' end,
        reviewed_at = case when p_approve then now() else reviewed_at end,
        revoked_at  = case when p_approve then null else now() end,
        updated_at  = now()
  where student_user_id = auth.uid()
    and guardian_user_id = p_guardian_user_id
    and status = 'pending'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'No pending guardian request found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- Either party removes an active or pending link (auth.uid() must be a party to it).
create or replace function public.guardian_unlink(
  p_guardian_user_id uuid,
  p_student_user_id  uuid
)
returns void
language plpgsql
security definer
set search_path = education, public, pg_temp
as $$
begin
  update education.guardian_link
    set status     = 'revoked',
        revoked_at = now(),
        updated_at = now()
  where guardian_user_id = p_guardian_user_id
    and student_user_id  = p_student_user_id
    and (guardian_user_id = auth.uid() or student_user_id = auth.uid())
    and status <> 'revoked';
end;
$$;

-- Every link the caller participates in, with a computed role + counterpart
-- identity. The client buckets: role=guardian+active → my students;
-- role=guardian+pending → requests I sent; role=student+pending → my consent inbox.
create or replace function public.guardian_list_links()
returns table (
  id                   uuid,
  guardian_user_id     uuid,
  student_user_id      uuid,
  status               text,
  relationship         text,
  requested_by         text,
  created_at           timestamptz,
  reviewed_at          timestamptz,
  role                 text,
  counterpart_user_id  uuid,
  counterpart_email    text,
  counterpart_name     text
)
language sql
security definer
set search_path = education, public, pg_temp
as $$
  select
    l.id, l.guardian_user_id, l.student_user_id, l.status, l.relationship,
    l.requested_by, l.created_at, l.reviewed_at,
    case when l.guardian_user_id = auth.uid() then 'guardian' else 'student' end as role,
    case when l.guardian_user_id = auth.uid() then l.student_user_id else l.guardian_user_id end as counterpart_user_id,
    u.email::text as counterpart_email,
    coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') as counterpart_name
  from education.guardian_link l
  join auth.users u
    on u.id = case when l.guardian_user_id = auth.uid() then l.student_user_id else l.guardian_user_id end
  where (l.guardian_user_id = auth.uid() or l.student_user_id = auth.uid())
    and l.status <> 'revoked'
  order by l.status, l.created_at desc;
$$;

-- ─── Guardian → student study-spine reads (each re-checks the active link) ────
create or replace function public.guardian_student_mastery(p_student_id uuid)
returns setof education.item_mastery
language plpgsql
security definer
set search_path = education, public, pg_temp
as $$
begin
  perform public.guardian_assert_access(p_student_id);
  return query
    select * from education.item_mastery
    where created_by = p_student_id and deleted_at is null
    order by last_attempt_at desc nulls last
    limit 3000;
end;
$$;

create or replace function public.guardian_student_attempts(
  p_student_id uuid,
  p_since      timestamptz default null
)
returns setof education.study_attempt
language plpgsql
security definer
set search_path = education, public, pg_temp
as $$
begin
  perform public.guardian_assert_access(p_student_id);
  return query
    select * from education.study_attempt
    where created_by = p_student_id
      and deleted_at is null
      and (p_since is null or created_at >= p_since)
    order by created_at asc
    limit 8000;
end;
$$;

create or replace function public.guardian_student_sessions(p_student_id uuid)
returns setof education.study_session
language plpgsql
security definer
set search_path = education, public, pg_temp
as $$
begin
  perform public.guardian_assert_access(p_student_id);
  return query
    select * from education.study_session
    where created_by = p_student_id and deleted_at is null
    order by created_at desc
    limit 1000;
end;
$$;

create or replace function public.guardian_student_streak(p_student_id uuid)
returns setof education.study_streak
language plpgsql
security definer
set search_path = education, public, pg_temp
as $$
begin
  perform public.guardian_assert_access(p_student_id);
  return query
    select * from education.study_streak
    where user_id = p_student_id
    limit 1;
end;
$$;

create or replace function public.guardian_student_gain(p_student_id uuid)
returns setof education.assessment_result
language plpgsql
security definer
set search_path = education, public, pg_temp
as $$
begin
  perform public.guardian_assert_access(p_student_id);
  return query
    select * from education.assessment_result
    where created_by = p_student_id
      and deleted_at is null
      and phase in ('baseline', 'post')
    order by created_at desc
    limit 500;
end;
$$;

create or replace function public.guardian_student_card_topics(
  p_student_id uuid,
  p_card_ids   uuid[]
)
returns table (card_id uuid, topic text)
language plpgsql
security definer
set search_path = education, public, pg_temp
as $$
begin
  perform public.guardian_assert_access(p_student_id);
  return query
    select c.id, c.topic
    from education.fc_card c
    where c.created_by = p_student_id
      and c.id = any(p_card_ids);
end;
$$;

-- ─── Grants ───────────────────────────────────────────────────────────────────
grant execute on function public.guardian_can_view(uuid)                    to authenticated;
grant execute on function public.guardian_grant(text, text)                 to authenticated;
grant execute on function public.guardian_request_student(text, text)       to authenticated;
grant execute on function public.guardian_respond(uuid, boolean)            to authenticated;
grant execute on function public.guardian_unlink(uuid, uuid)                to authenticated;
grant execute on function public.guardian_list_links()                      to authenticated;
grant execute on function public.guardian_student_mastery(uuid)             to authenticated;
grant execute on function public.guardian_student_attempts(uuid, timestamptz) to authenticated;
grant execute on function public.guardian_student_sessions(uuid)            to authenticated;
grant execute on function public.guardian_student_streak(uuid)              to authenticated;
grant execute on function public.guardian_student_gain(uuid)                to authenticated;
grant execute on function public.guardian_student_card_topics(uuid, uuid[]) to authenticated;

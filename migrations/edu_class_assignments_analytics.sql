-- edu_class_assignments_analytics.sql
--
-- Convergence C — TEACHER TOOLS: class ASSIGNMENTS + CLASS ANALYTICS. Builds on
-- the live class membership/access model (edu_class_membership_access_model.sql).
-- Scopes-native + reuse-first: NO new table.
--
--   * An ASSIGNMENT is a platform.associations edge with role='assignment':
--       source = (resource token, resource id)   -- a deck (fc_set) or a quiz/
--                                                     practice-test (assessment)
--       target = ('scope', class scope id)
--       role   = 'assignment'
--       metadata = { due_date: 'YYYY-MM-DD'|null, assigned_at, assigned_by }
--     It reuses the ONE association system; role='assignment' distinguishes it
--     from a plain content-tag edge (role=null) so the class hub content read
--     (assoc_for_entity, role-blind) can exclude it client-side.
--
--   * Completion + scores are DERIVED from the shared STUDY SPINE
--     (education.study_session / study_attempt for decks; education.assessment_result
--     for assessments) — nothing new is stored. A member records completion the
--     normal way (studyService) and the teacher reads it back, SCOPED TO THE CLASS.
--
-- PRIVACY (the whole point — mirrors the guardian gated-read model):
--   A class OWNER may read a member's study data ONLY scoped to THIS class's
--   assignments, and ONLY for a user who is an ACTIVE member of the class.
--   Enrolling in a class = consenting to the teacher seeing your progress on that
--   class's assigned material — and nothing else (never the student's full spine,
--   never a non-member, never for a non-owner caller). Every read RPC re-checks
--   the caller's owner/member role server-side (RLS on the spine is
--   created_by=auth.uid(), so these SECURITY DEFINER RPCs are the ONLY cross-user
--   read path — exactly like guardian_*). Writes are RPC-only + owner-gated.
--
-- protected-resources doctrine: platform.associations has no client write grant;
-- assignment writes go ONLY through the owner-gated edu_class_assign/_unassign
-- RPCs below (never the generic assoc_add), so the owner check is the boundary.
--
-- Idempotent: CREATE OR REPLACE.

-- ─── 1. Guards reused from the membership model ──────────────────────────────
--   public._edu_class(uuid)            → resolves + validates a class scope (definer)
--   public._edu_is_owner(scopes)       → caller is creator OR org admin (definer)
--   public._edu_access_mode(scopes)    → open|closed|paid
-- (defined in edu_class_membership_access_model.sql)

-- Is p_user an ACTIVE member (or the owner) of the class scope? Definer — the
-- authenticated role has no base grant on iam.memberships.
create or replace function public._edu_is_active_member(p_scope uuid, p_user uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from iam.memberships m
    where m.container_type = 'scope'
      and m.container_id = p_scope
      and m.user_id = p_user
      and m.status = 'active'
      and m.deleted_at is null
  );
$$;
revoke all on function public._edu_is_active_member(uuid, uuid) from public, anon, authenticated;

-- The assignable tokens. A deck (fc_set) or a quiz / practice-test (assessment).
create or replace function public._edu_is_assignable_token(p_token text)
returns boolean
language sql immutable
as $$ select p_token in ('fc_set', 'assessment'); $$;

-- ─── 2. _edu_resource_progress — one student's completion of ONE resource ─────
-- Internal (NOT granted): callable only from the owner/self-gated read RPCs
-- below, which have already authorized the (caller, class, user) tuple. Derives
-- from the study spine; stores nothing. Returns:
--   { status: 'not_started'|'in_progress'|'completed',
--     score_pct: int|null, attempts: int, correct: int, last_activity: ts|null }
create or replace function public._edu_resource_progress(
  p_token text, p_resource uuid, p_user uuid
)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_status text := 'not_started';
  v_score int;
  v_attempts int := 0;
  v_correct int := 0;
  v_last timestamptz;
begin
  if p_token = 'fc_set' then
    -- Decks: sessions on this set + the attempt ledger under those sessions.
    declare
      v_completed_sessions int := 0;
      v_sessions int := 0;
    begin
      select count(*) filter (where s.status = 'completed'),
             count(*),
             max(coalesce(s.ended_at, s.updated_at, s.created_at))
        into v_completed_sessions, v_sessions, v_last
      from education.study_session s
      where s.source_set_id = p_resource
        and s.created_by = p_user
        and s.deleted_at is null;

      select count(*), count(*) filter (where a.result = 'correct')
        into v_attempts, v_correct
      from education.study_attempt a
      join education.study_session s on s.id = a.session_id
      where s.source_set_id = p_resource
        and a.created_by = p_user
        and a.deleted_at is null;

      if v_completed_sessions > 0 then
        v_status := 'completed';
      elsif v_sessions > 0 or v_attempts > 0 then
        v_status := 'in_progress';
      end if;
      if v_attempts > 0 then
        v_score := round((v_correct::numeric / v_attempts) * 100);
      end if;
    end;

  elsif p_token = 'assessment' then
    -- Quizzes / practice tests: the assessment_result row (prefer a completed
    -- one, then the most recent).
    declare
      v_row education.assessment_result;
    begin
      select * into v_row
      from education.assessment_result r
      where r.assessment_id = p_resource
        and r.created_by = p_user
        and r.deleted_at is null
      order by (r.status = 'completed' or r.completed_at is not null) desc,
               r.created_at desc
      limit 1;

      if v_row.id is not null then
        v_attempts := coalesce(v_row.total_count, 0);
        v_correct := coalesce(v_row.correct_count, 0);
        v_last := coalesce(v_row.completed_at, v_row.updated_at, v_row.created_at);
        if v_row.status = 'completed' or v_row.completed_at is not null then
          v_status := 'completed';
        else
          v_status := 'in_progress';
        end if;
        if v_row.score_value is not null then
          v_score := round(v_row.score_value * 100);
        elsif coalesce(v_row.total_count, 0) > 0 then
          v_score := round((v_row.correct_count::numeric / v_row.total_count) * 100);
        end if;
      end if;
    end;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'score_pct', v_score,
    'attempts', v_attempts,
    'correct', v_correct,
    'last_activity', v_last
  );
end;
$$;
revoke all on function public._edu_resource_progress(text, uuid, uuid) from public, anon, authenticated;

-- ─── 3. edu_class_assign — owner assigns a resource (optional due date) ───────
create or replace function public.edu_class_assign(
  p_class uuid, p_token text, p_resource uuid, p_due date default null
)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_scope context.scopes;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can assign content' using errcode = '42501';
  end if;
  if not public._edu_is_assignable_token(p_token) then
    raise exception 'token % is not assignable (expected fc_set or assessment)', p_token using errcode = '22023';
  end if;

  insert into platform.associations
    (source_type, source_id, target_type, target_id, role, organization_id, created_by, metadata)
  values
    (p_token, p_resource, 'scope', v_scope.id, 'assignment', v_scope.organization_id, v_uid,
     jsonb_build_object('due_date', to_char(p_due, 'YYYY-MM-DD'), 'assigned_at', now(), 'assigned_by', v_uid))
  on conflict (source_type, source_id, target_type, target_id, role) do update
    set metadata = jsonb_build_object(
          'due_date', to_char(p_due, 'YYYY-MM-DD'),
          'assigned_at', coalesce(platform.associations.metadata->>'assigned_at', now()::text),
          'assigned_by', coalesce(platform.associations.metadata->>'assigned_by', v_uid::text)
        );

  return jsonb_build_object(
    'status', 'assigned', 'token', p_token, 'resource_id', p_resource,
    'due_date', to_char(p_due, 'YYYY-MM-DD')
  );
end;
$$;

-- ─── 4. edu_class_unassign — owner removes an assignment ──────────────────────
create or replace function public.edu_class_unassign(
  p_class uuid, p_token text, p_resource uuid
)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_scope context.scopes;
begin
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can remove assignments' using errcode = '42501';
  end if;
  delete from platform.associations
  where source_type = p_token and source_id = p_resource
    and target_type = 'scope' and target_id = v_scope.id
    and role = 'assignment';
  return jsonb_build_object('status', 'unassigned', 'token', p_token, 'resource_id', p_resource);
end;
$$;

-- ─── 5. edu_class_assignments — owner OR active member reads the assignment list ─
create or replace function public.edu_class_assignments(p_class uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_scope context.scopes;
  v_uid uuid := (select auth.uid());
  v_rows jsonb;
begin
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) and not public._edu_is_active_member(v_scope.id, v_uid) then
    raise exception 'not authorized to view this class''s assignments' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'token', a.source_type,
           'resource_id', a.source_id,
           'due_date', a.metadata->>'due_date',
           'assigned_at', a.metadata->>'assigned_at',
           'assigned_by', a.metadata->>'assigned_by'
         ) order by (a.metadata->>'due_date') nulls last, a.created_at), '[]'::jsonb)
    into v_rows
  from platform.associations a
  where a.target_type = 'scope' and a.target_id = v_scope.id and a.role = 'assignment';

  return v_rows;
end;
$$;

-- ─── 6. edu_class_student_progress — one member's completion of THIS class's
--        assignments. Owner (any member) OR self. Class-scoped consent boundary. ─
create or replace function public.edu_class_student_progress(p_class uuid, p_user uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_scope context.scopes;
  v_uid uuid := (select auth.uid());
  v_is_owner boolean;
  v_rows jsonb;
begin
  v_scope := public._edu_class(p_class);
  v_is_owner := public._edu_is_owner(v_scope);

  -- Caller must be the class owner OR the subject themselves.
  if not v_is_owner and v_uid <> p_user then
    raise exception 'not authorized to view this student''s class progress' using errcode = '42501';
  end if;
  -- The subject must be an ACTIVE member of THIS class (enrolment = the consent).
  if not public._edu_is_active_member(v_scope.id, p_user) then
    raise exception 'user is not an active member of this class' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'token', a.source_type,
             'resource_id', a.source_id,
             'due_date', a.metadata->>'due_date'
           ) || public._edu_resource_progress(a.source_type, a.source_id, p_user)
           order by (a.metadata->>'due_date') nulls last, a.created_at
         ), '[]'::jsonb)
    into v_rows
  from platform.associations a
  where a.target_type = 'scope' and a.target_id = v_scope.id and a.role = 'assignment';

  return v_rows;
end;
$$;

-- ─── 7. edu_class_progress_overview — the owner's roster × assignment grid ─────
create or replace function public.edu_class_progress_overview(p_class uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_scope context.scopes;
  v_uid uuid := (select auth.uid());
  v_assignments jsonb;
  v_students jsonb;
begin
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can view class progress' using errcode = '42501';
  end if;

  -- The class's assignments (columns of the grid).
  select coalesce(jsonb_agg(jsonb_build_object(
           'token', a.source_type,
           'resource_id', a.source_id,
           'due_date', a.metadata->>'due_date',
           'assigned_at', a.metadata->>'assigned_at'
         ) order by (a.metadata->>'due_date') nulls last, a.created_at), '[]'::jsonb)
    into v_assignments
  from platform.associations a
  where a.target_type = 'scope' and a.target_id = v_scope.id and a.role = 'assignment';

  -- Active students (rows) × each assignment (cells). Excludes the owner.
  select coalesce(jsonb_agg(student order by student->>'email'), '[]'::jsonb)
    into v_students
  from (
    select jsonb_build_object(
             'user_id', m.user_id,
             'email', u.email,
             'name', coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
             'cells', (
               select coalesce(jsonb_agg(
                 jsonb_build_object(
                   'token', a.source_type,
                   'resource_id', a.source_id,
                   'due_date', a.metadata->>'due_date'
                 ) || public._edu_resource_progress(a.source_type, a.source_id, m.user_id)
                 order by (a.metadata->>'due_date') nulls last, a.created_at
               ), '[]'::jsonb)
               from platform.associations a
               where a.target_type = 'scope' and a.target_id = v_scope.id and a.role = 'assignment'
             )
           ) as student
    from iam.memberships m
    join auth.users u on u.id = m.user_id
    where m.container_type = 'scope' and m.container_id = v_scope.id
      and m.status = 'active' and m.role = 'member' and m.deleted_at is null
  ) t;

  return jsonb_build_object('assignments', v_assignments, 'students', v_students);
end;
$$;

-- ─── Grants ───────────────────────────────────────────────────────────────────
grant execute on function public.edu_class_assign(uuid, text, uuid, date) to authenticated;
grant execute on function public.edu_class_unassign(uuid, text, uuid) to authenticated;
grant execute on function public.edu_class_assignments(uuid) to authenticated;
grant execute on function public.edu_class_student_progress(uuid, uuid) to authenticated;
grant execute on function public.edu_class_progress_overview(uuid) to authenticated;

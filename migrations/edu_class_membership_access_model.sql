-- edu_class_membership_access_model.sql
--
-- Convergence C — the CLASS MEMBERSHIP + ACCESS MODEL. The foundation of the
-- creator/teacher system. Scopes-native + reuse-first: a class is ALREADY a
-- scope (context.scopes under the per-user "Class" scope type). This migration
-- EXTENDS that model — it invents NO roster table.
--
--   * access_mode  = 'open' | 'closed' | 'paid'  (stored in scope.settings)
--       open   — publicly listed + anyone can join immediately.
--       closed — invite/request → owner-approve; not publicly listed.
--       paid   — join gated by a class_access grant a purchase confers.
--   * roster       = iam.memberships on the class scope (container_type='scope').
--       role   = 'owner' (teacher/creator) | 'member' (student).
--       status = 'active'   — on the roster (or the owner).
--                'pending'  — requested a closed class, awaiting approval.
--                'entitled' — holds the paid class_access grant (purchased /
--                             owner-comped) but has not enrolled yet. edu_class_join
--                             flips entitled → active. This IS the class_access grant
--                             (per-class, per-user) — modeled on the roster table, NOT
--                             billing.capability (which is GLOBAL-per-user and cannot
--                             express a per-class purchase). Real money movement
--                             (Stripe Connect payouts) is PENDING (Arman); the purchase
--                             here is a STUB that grants the entitled row directly.
--   * edu_class_* RPC family = the PUBLISHED CONTRACT the creator landing page +
--     class hub consume. SECURITY DEFINER, gated on the caller's membership role.
--
-- RLS doctrine (protected-resources): writes via RPC only; context.scopes SELECT
-- extended additively so members/open-class viewers can read the class scope, but
-- non-members STILL cannot read a closed/paid class.
--
-- Idempotent: CREATE OR REPLACE / IF NOT EXISTS / DROP POLICY IF EXISTS.

-- ─── 1. Extend context.scopes SELECT RLS (additive — never removes a branch) ──
-- A class scope becomes readable to: (existing) org members; PLUS an 'open' class
-- to anyone (public listing + landing pages, incl. anon); PLUS any user with an
-- ACTIVE membership on that scope (a joined student in the teacher's org). Closed
-- and paid classes stay invisible to non-members.
--
-- The membership probe is a SECURITY DEFINER helper (same pattern as
-- iam.has_org_access) — the authenticated role has NO base GRANT on
-- iam.memberships (it is RPC-only), so a direct EXISTS subquery in the policy
-- would raise 42501 for every scope read.
create or replace function public._edu_is_scope_member(p_scope uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from iam.memberships m
    where m.container_type = 'scope'
      and m.container_id = p_scope
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.deleted_at is null
  );
$$;
grant execute on function public._edu_is_scope_member(uuid) to anon, authenticated;

drop policy if exists scopes_select on context.scopes;
create policy scopes_select on context.scopes for select
using (
  iam.has_org_access(organization_id)
  or (settings->>'access_mode' = 'open')
  or public._edu_is_scope_member(context.scopes.id)
);

-- Fast lookup of a user's class memberships + a class's roster.
create index if not exists idx_memberships_scope_container
  on iam.memberships (container_id, user_id)
  where container_type = 'scope';

-- ─── 2. Internal helper: resolve + validate a class scope (bypasses RLS) ──────
create or replace function public._edu_class(p_class uuid)
returns context.scopes
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_scope context.scopes;
begin
  select s.* into v_scope
  from context.scopes s
  join context.scope_types st on st.id = s.scope_type_id
  where s.id = p_class and st.slug = 'class';
  if v_scope.id is null then
    raise exception 'class % not found', p_class using errcode = 'NO_DATA_FOUND';
  end if;
  return v_scope;
end;
$$;

-- access_mode of a class, defaulting missing → 'closed' (existing personal
-- study classes are private, never publicly exposed).
create or replace function public._edu_access_mode(p_scope context.scopes)
returns text
language sql
immutable
as $$
  select coalesce(nullif(p_scope.settings->>'access_mode', ''), 'closed');
$$;

-- Is the caller the class owner (creator OR org admin of the class's org)?
create or replace function public._edu_is_owner(p_scope context.scopes)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select p_scope.created_by = (select auth.uid())
      or iam.has_org_admin(p_scope.organization_id);
$$;

-- Ensure the class creator has an authoritative owner membership row (self-heal).
create or replace function public._edu_ensure_owner_membership(p_scope context.scopes)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if p_scope.created_by is null then return; end if;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  select p_scope.organization_id, 'scope', p_scope.id, p_scope.created_by, 'owner', 'active', p_scope.created_by
  where not exists (
    select 1 from iam.memberships m
    where m.container_type = 'scope' and m.container_id = p_scope.id
      and m.user_id = p_scope.created_by and m.deleted_at is null
  );
end;
$$;

-- ─── 3. edu_class_state — the read contract (drives the Join/Enroll button) ───
-- Callable by anon for OPEN classes (landing pages). A non-owner/non-member
-- viewing a non-open class gets a not-found error (no leak of closed/paid metadata).
create or replace function public.edu_class_state(p_class uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_scope context.scopes;
  v_mode text;
  v_uid uuid := (select auth.uid());
  v_is_owner boolean;
  v_my_role text;
  v_my_status text;
  v_member_count int;
  v_pending_count int;
begin
  v_scope := public._edu_class(p_class);
  v_mode := public._edu_access_mode(v_scope);
  v_is_owner := public._edu_is_owner(v_scope);

  select role, status into v_my_role, v_my_status
  from iam.memberships
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = v_uid and deleted_at is null
  order by (status = 'active') desc limit 1;

  -- Access guard: only owner / any-state member / open-class viewers may read.
  if not v_is_owner and v_my_role is null and v_mode <> 'open' then
    raise exception 'class % not found', p_class using errcode = 'NO_DATA_FOUND';
  end if;

  select count(*) filter (where status = 'active' and role = 'member'),
         count(*) filter (where status = 'pending')
    into v_member_count, v_pending_count
  from iam.memberships
  where container_type = 'scope' and container_id = v_scope.id and deleted_at is null;

  return jsonb_build_object(
    'class_id', v_scope.id,
    'name', v_scope.name,
    'description', v_scope.description,
    'slug', v_scope.slug,
    'organization_id', v_scope.organization_id,
    'access_mode', v_mode,
    'settings', v_scope.settings,
    'is_owner', v_is_owner,
    'my_role', case when v_is_owner then 'owner' else v_my_role end,
    'my_status', case when v_is_owner then 'active' else v_my_status end,
    'member_count', coalesce(v_member_count, 0),
    'pending_count', case when v_is_owner then coalesce(v_pending_count, 0) else null end
  );
end;
$$;

-- ─── 4. edu_class_join — open→immediate; closed→needs_request; paid→gated ─────
create or replace function public.edu_class_join(p_class uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_scope context.scopes;
  v_mode text;
  v_uid uuid := (select auth.uid());
  v_row iam.memberships;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  v_scope := public._edu_class(p_class);
  v_mode := public._edu_access_mode(v_scope);

  if public._edu_is_owner(v_scope) then
    perform public._edu_ensure_owner_membership(v_scope);
    return jsonb_build_object('status', 'already_member', 'role', 'owner', 'access_mode', v_mode);
  end if;

  select * into v_row from iam.memberships
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = v_uid and deleted_at is null
  order by (status = 'active') desc limit 1;

  if v_row.id is not null and v_row.status = 'active' then
    return jsonb_build_object('status', 'already_member', 'role', v_row.role, 'access_mode', v_mode);
  end if;

  if v_mode = 'open' then
    if v_row.id is not null then
      update iam.memberships set status = 'active', role = 'member', updated_at = now(), updated_by = v_uid
      where id = v_row.id;
    else
      insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
      values (v_scope.organization_id, 'scope', v_scope.id, v_uid, 'member', 'active', v_uid);
    end if;
    return jsonb_build_object('status', 'joined', 'role', 'member', 'access_mode', v_mode);
  end if;

  if v_mode = 'closed' then
    if v_row.id is not null and v_row.status = 'pending' then
      return jsonb_build_object('status', 'pending', 'access_mode', v_mode);
    end if;
    return jsonb_build_object('status', 'needs_request', 'access_mode', v_mode);
  end if;

  -- paid: enroll only if the caller holds the class_access grant (entitled row).
  if v_mode = 'paid' then
    if v_row.id is not null and v_row.status = 'entitled' then
      update iam.memberships set status = 'active', role = 'member', updated_at = now(), updated_by = v_uid
      where id = v_row.id;
      return jsonb_build_object('status', 'joined', 'role', 'member', 'access_mode', v_mode);
    end if;
    return jsonb_build_object('status', 'needs_purchase', 'access_mode', v_mode);
  end if;

  raise exception 'unknown access_mode %', v_mode;
end;
$$;

-- ─── 5. edu_class_request — request to join a closed class ────────────────────
create or replace function public.edu_class_request(p_class uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_scope context.scopes;
  v_mode text;
  v_uid uuid := (select auth.uid());
  v_row iam.memberships;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  v_scope := public._edu_class(p_class);
  v_mode := public._edu_access_mode(v_scope);

  if public._edu_is_owner(v_scope) then
    return jsonb_build_object('status', 'already_member', 'role', 'owner', 'access_mode', v_mode);
  end if;

  -- open → just join; paid without grant → needs_purchase (delegate to join).
  if v_mode = 'open' or v_mode = 'paid' then
    return public.edu_class_join(p_class);
  end if;

  select * into v_row from iam.memberships
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = v_uid and deleted_at is null limit 1;

  if v_row.id is not null and v_row.status = 'active' then
    return jsonb_build_object('status', 'already_member', 'role', v_row.role, 'access_mode', v_mode);
  end if;
  if v_row.id is not null and v_row.status = 'pending' then
    return jsonb_build_object('status', 'pending', 'access_mode', v_mode);
  end if;

  if v_row.id is not null then
    update iam.memberships set status = 'pending', role = 'member', updated_at = now(), updated_by = v_uid
    where id = v_row.id;
  else
    insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
    values (v_scope.organization_id, 'scope', v_scope.id, v_uid, 'member', 'pending', v_uid);
  end if;
  return jsonb_build_object('status', 'pending', 'access_mode', v_mode);
end;
$$;

-- ─── 6. edu_class_approve — owner approves a pending request ──────────────────
create or replace function public.edu_class_approve(p_class uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_scope context.scopes; v_id uuid;
begin
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can approve members' using errcode = '42501';
  end if;
  update iam.memberships
    set status = 'active', role = 'member', updated_at = now(), updated_by = (select auth.uid())
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = p_user and status = 'pending' and deleted_at is null
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('status', 'not_pending');
  end if;
  return jsonb_build_object('status', 'approved', 'user_id', p_user);
end;
$$;

-- ─── 7. edu_class_leave — a member removes themselves ─────────────────────────
create or replace function public.edu_class_leave(p_class uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_scope context.scopes; v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  v_scope := public._edu_class(p_class);
  if public._edu_is_owner(v_scope) then
    raise exception 'the class owner cannot leave their own class' using errcode = '42501';
  end if;
  update iam.memberships set deleted_at = now(), updated_at = now(), updated_by = v_uid
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = v_uid and deleted_at is null;
  return jsonb_build_object('status', 'left');
end;
$$;

-- ─── 8. edu_class_remove — owner removes a member / declines a request ────────
create or replace function public.edu_class_remove(p_class uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_scope context.scopes;
begin
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can remove members' using errcode = '42501';
  end if;
  if p_user = v_scope.created_by then
    raise exception 'cannot remove the class owner' using errcode = '42501';
  end if;
  update iam.memberships set deleted_at = now(), updated_at = now(), updated_by = (select auth.uid())
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = p_user and deleted_at is null;
  return jsonb_build_object('status', 'removed', 'user_id', p_user);
end;
$$;

-- ─── 9. edu_class_roster — owner sees all (incl pending/entitled); member sees active ──
-- VOLATILE (not STABLE): it self-heals the owner membership (a write), and a
-- STABLE function is pinned to the statement-start snapshot — its own inserted
-- owner row would be invisible to its SELECT.
create or replace function public.edu_class_roster(p_class uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_scope context.scopes;
  v_uid uuid := (select auth.uid());
  v_is_owner boolean;
  v_is_member boolean;
  v_rows jsonb;
begin
  v_scope := public._edu_class(p_class);
  perform public._edu_ensure_owner_membership(v_scope);
  v_is_owner := public._edu_is_owner(v_scope);
  v_is_member := exists (
    select 1 from iam.memberships m
    where m.container_type = 'scope' and m.container_id = v_scope.id
      and m.user_id = v_uid and m.status = 'active' and m.deleted_at is null
  );
  if not v_is_owner and not v_is_member then
    raise exception 'not authorized to view this roster' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row order by rank, created_at), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
             'user_id', m.user_id,
             'email', u.email,
             'role', m.role,
             'status', m.status,
             'created_at', m.created_at
           ) as row,
           case m.status when 'active' then 0 when 'pending' then 1 else 2 end as rank,
           m.created_at
    from iam.memberships m
    join auth.users u on u.id = m.user_id
    where m.container_type = 'scope' and m.container_id = v_scope.id and m.deleted_at is null
      and (v_is_owner or m.status = 'active')
  ) t;
  return v_rows;
end;
$$;

-- ─── 10. edu_class_grant — owner comps a user with the paid class_access grant ─
create or replace function public.edu_class_grant(p_class uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_scope context.scopes; v_row iam.memberships;
begin
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can grant access' using errcode = '42501';
  end if;
  select * into v_row from iam.memberships
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = p_user and deleted_at is null limit 1;
  if v_row.id is not null then
    if v_row.status = 'active' then
      return jsonb_build_object('status', 'already_member');
    end if;
    update iam.memberships set status = 'entitled', role = 'member', updated_at = now(), updated_by = (select auth.uid())
    where id = v_row.id;
  else
    insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
    values (v_scope.organization_id, 'scope', v_scope.id, p_user, 'member', 'entitled', (select auth.uid()));
  end if;
  return jsonb_build_object('status', 'entitled', 'user_id', p_user);
end;
$$;

-- ─── 11. edu_class_purchase — STUB. Grants the caller the class_access grant ───
-- Real money movement (Stripe Connect payouts + revenue share) is PENDING (Arman).
-- This stub confers the entitled grant directly so the paid GATE + enroll flow is
-- fully exercisable end-to-end today. When Connect lands, the checkout webhook
-- replaces this direct grant with a payment-verified one.
create or replace function public.edu_class_purchase(p_class uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_scope context.scopes; v_mode text; v_uid uuid := (select auth.uid()); v_row iam.memberships;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  v_scope := public._edu_class(p_class);
  v_mode := public._edu_access_mode(v_scope);
  if v_mode <> 'paid' then
    raise exception 'class % is not a paid class', p_class using errcode = '22023';
  end if;
  select * into v_row from iam.memberships
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = v_uid and deleted_at is null limit 1;
  if v_row.id is not null and v_row.status = 'active' then
    return jsonb_build_object('status', 'already_member');
  end if;
  if v_row.id is not null then
    update iam.memberships set status = 'entitled', role = 'member', updated_at = now(), updated_by = v_uid
    where id = v_row.id;
  else
    insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by, metadata)
    values (v_scope.organization_id, 'scope', v_scope.id, v_uid, 'member', 'entitled', v_uid, jsonb_build_object('grant_source', 'purchase_stub'));
  end if;
  return jsonb_build_object('status', 'entitled', 'stub', true, 'access_mode', v_mode);
end;
$$;

-- ─── 12. edu_class_set_access — owner sets access_mode + ensures owner row ─────
create or replace function public.edu_class_set_access(p_class uuid, p_access_mode text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_scope context.scopes; v_settings jsonb;
begin
  if p_access_mode not in ('open', 'closed', 'paid') then
    raise exception 'invalid access_mode %', p_access_mode using errcode = '22023';
  end if;
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can change access mode' using errcode = '42501';
  end if;
  v_settings := coalesce(v_scope.settings, '{}'::jsonb) || jsonb_build_object('access_mode', p_access_mode);
  update context.scopes set settings = v_settings, updated_at = now() where id = v_scope.id;
  perform public._edu_ensure_owner_membership(v_scope);
  return jsonb_build_object('status', 'ok', 'access_mode', p_access_mode);
end;
$$;

-- ─── 13. edu_my_classes — classes the caller owns / joined / requested ────────
-- SECURITY DEFINER so a joined/pending student sees classes across orgs (their
-- own org RLS scope read never surfaces a class in the teacher's org).
create or replace function public.edu_my_classes()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_uid uuid := (select auth.uid()); v_rows jsonb;
begin
  if v_uid is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'class_id', s.id,
           'name', s.name,
           'description', s.description,
           'slug', s.slug,
           'organization_id', s.organization_id,
           'access_mode', public._edu_access_mode(s),
           'settings', s.settings,
           'my_role', m.role,
           'my_status', m.status,
           'owner_id', s.created_by
         ) order by s.name), '[]'::jsonb) into v_rows
  from iam.memberships m
  join context.scope_types st on st.slug = 'class'
  join context.scopes s on s.id = m.container_id and s.scope_type_id = st.id
  where m.container_type = 'scope' and m.user_id = v_uid and m.deleted_at is null;
  return v_rows;
end;
$$;

-- ─── Grants ───────────────────────────────────────────────────────────────────
grant execute on function public.edu_class_state(uuid) to anon, authenticated;
grant execute on function public.edu_class_join(uuid) to authenticated;
grant execute on function public.edu_class_request(uuid) to authenticated;
grant execute on function public.edu_class_approve(uuid, uuid) to authenticated;
grant execute on function public.edu_class_leave(uuid) to authenticated;
grant execute on function public.edu_class_remove(uuid, uuid) to authenticated;
grant execute on function public.edu_class_roster(uuid) to authenticated;
grant execute on function public.edu_class_grant(uuid, uuid) to authenticated;
grant execute on function public.edu_class_purchase(uuid) to authenticated;
grant execute on function public.edu_class_set_access(uuid, text) to authenticated;
grant execute on function public.edu_my_classes() to authenticated;

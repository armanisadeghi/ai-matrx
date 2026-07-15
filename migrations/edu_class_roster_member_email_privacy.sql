-- edu_class_roster_member_email_privacy.sql
--
-- D56 (Convergence-C, MEDIUM privacy): edu_class_roster leaked every active
-- member's EMAIL to all co-members. In a school-safe / under-13 context, a
-- student's email address must not be exposed to peers.
--
-- Fix: the OWNER/teacher still sees every member's email (needed to manage the
-- roster); a non-owner MEMBER gets a non-PII `display_name` (from
-- users.profiles) but the `email` field is NULL for every peer. Every caller
-- gets `display_name` so the members-only view shows names, never raw UUIDs.
-- The anon/NULL-owner bypass fix (edu_class_anon_null_bypass_fix.sql) and the
-- 42501 auth gate are preserved verbatim; only the row projection changed.
--
-- Idempotent (CREATE OR REPLACE). Apply via Supabase MCP + ledger.

CREATE OR REPLACE FUNCTION public.edu_class_roster(p_class uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope context.scopes; v_uid uuid := (select auth.uid());
  v_is_owner boolean; v_is_member boolean; v_rows jsonb;
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
             -- D56: owner sees emails (roster management); peers do NOT.
             'email', case when v_is_owner then u.email else null end,
             -- Non-PII display identity shown to everyone (so members see names).
             'display_name', p.display_name,
             'role', m.role,
             'status', m.status, 'created_at', m.created_at) as row,
           case m.status when 'active' then 0 when 'pending' then 1 else 2 end as rank,
           m.created_at
    from iam.memberships m
    join auth.users u on u.id = m.user_id
    left join users.profiles p on p.id = m.user_id
    where m.container_type = 'scope' and m.container_id = v_scope.id and m.deleted_at is null
      and (v_is_owner or m.status = 'active')
  ) t;
  return v_rows;
end;
$function$;

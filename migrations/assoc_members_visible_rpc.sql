-- assoc_members_visible — visibility-aware batch read for the unified
-- association edge (INCOMING edges for a set of targets).
--
-- WHY: public.assoc_for_targets org-gates every edge by
-- iam.has_org_access(a.organization_id). That is correct for org-scoped tagging
-- (scope tags on notes/tasks), but it means the ONLY way to read a container's
-- member edges is to share org access with it. A guest from a *different*
-- personal account cannot read the member edges of a `visibility='public'`
-- flashcard deck, so a cross-account multiplayer game loads an EMPTY deck even
-- though fc_set/fc_card RLS (via iam.has_access → reachability → public parent)
-- already lets that guest read the set and its cards (KNOWN_DEFECTS D37).
--
-- WHAT: same output as assoc_for_targets, but an edge is returned when the caller
-- EITHER shares org access to it (unchanged behavior) OR can VIEW its target via
-- the canonical row-level authorization truth iam.has_access(target, 'viewer') —
-- which honors visibility='public'/'link', share grants (has_permission),
-- container memberships, and reachability. iam.has_access is evaluated ONCE per
-- distinct target (not per edge) to keep it cheap on hot deck loads.
--
-- This is a STRICT SUPERSET of assoc_for_targets access: it never removes an
-- edge an org member could already see; it only adds edges whose target the
-- caller is genuinely authorized to view. A stranger with no grant on a PRIVATE
-- deck still gets 0 rows (iam.has_access returns false → no org branch either).
-- iam.has_access returns false when auth.uid() IS NULL, so anon gains nothing
-- here (anon public reads use the get_public_flashcard_set lane); granted to
-- authenticated only.
--
-- Idempotent (CREATE OR REPLACE). Additive — touches no existing function.

create or replace function public.assoc_members_visible(
  p_target_type text,
  p_target_ids  uuid[]
)
returns table(
  id              uuid,
  target_id       uuid,
  source_type     text,
  source_id       uuid,
  role            text,
  label           text,
  "position"      integer,
  metadata        jsonb,
  organization_id uuid,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with viewable as (
    -- Evaluate the (heavier) row-level authorization ONCE per distinct target.
    select tid
      from unnest(coalesce(p_target_ids, '{}'::uuid[])) as tid
     where iam.has_access(p_target_type, tid, 'viewer'::permission_level)
  )
  select a.id, a.target_id, a.source_type, a.source_id, a.role, a.label,
         a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations a
   where a.target_type = p_target_type
     and a.target_id = any(coalesce(p_target_ids, '{}'::uuid[]))
     and (
       iam.has_org_access(a.organization_id)
       or a.target_id in (select tid from viewable)
     )
  order by 7 nulls last, 10;
$function$;

revoke all on function public.assoc_members_visible(text, uuid[]) from public, anon;
grant execute on function public.assoc_members_visible(text, uuid[]) to authenticated, service_role;

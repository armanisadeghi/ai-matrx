-- edu_assignment_confers_read.sql
--
-- Convergence C — ASSIGNMENT CONFERS READ VISIBILITY. Closes the teacher-tools
-- usability gap: when a teacher ASSIGNS a resource (deck/quiz) to a class, an
-- ACTIVE member of that class could see the assignment (edu_class_assignments RPC)
-- but could NOT READ the underlying private resource — so the "Study" link + title
-- resolution failed ("Untitled …") and /education/flashcards/[id]/study loaded an
-- empty deck. This makes an assignment CONFER viewer access to the resource, for
-- exactly as long as BOTH the assignment edge exists AND the caller is an ACTIVE
-- member of the class it targets.
--
-- MECHANISM (reuse-first, least-privilege — Option B, single choke point):
--   Every read path for these resources funnels through iam.has_access —
--   the base-table RLS (fc_set / fc_card / fc_detail / assessment / assessment_item),
--   the card-membership loader (assoc_members_visible), and the entity-title
--   resolver. So instead of OR-ing a predicate into each of ~6 policies (and STILL
--   missing assoc_members_visible, which gates on has_access, not the table RLS),
--   we add ONE additive, VIEWER-ONLY branch to iam.has_access. Every consumer then
--   resolves the assignment grant uniformly, with zero per-table edits.
--
--   This is NOT a widening of the sharing model: iam.permissions grants target a
--   user or an org (there is no "grant to a scope"), and scope membership only
--   confers resource access through the role-BLIND conveyance/reachability core —
--   which would over-convey EVERY scope-tagged item (role=null tags too), not just
--   assignments, and requires touching the shared conveyance machinery. This branch
--   is precisely scoped: role='assignment' edges only, ACTIVE members only, viewer
--   only. It mirrors the exact pattern already used for context.scopes SELECT RLS
--   (public._edu_is_scope_member).
--
-- LEAST-PRIVILEGE + LOUD/SAFE:
--   * viewer only — never editor/admin (the branch is gated on p_required='viewer').
--   * ACTIVE membership only (status='active', not deleted) — a pending/entitled/left
--     member gets nothing.
--   * role='assignment' edges only — a plain content-tag edge (role=null) confers
--     nothing.
--   * LIVE-evaluated — no materialized per-member grants to maintain. Access is
--     revoked the instant the assignment edge is deleted (edu_class_unassign) OR the
--     membership stops being active (edu_class_leave / edu_class_remove). Nothing to
--     clean up, nothing to leak.
--   * anon-safe — auth.uid() IS NULL → the membership join yields nothing → false.
--
-- Idempotent: CREATE OR REPLACE.

-- ─── 1. The assignment-visibility predicate ─────────────────────────────────────
-- Is (p_type, p_id) assigned (role='assignment') to a class scope the caller is an
-- ACTIVE member of? SECURITY DEFINER: the authenticated role has no base grant on
-- iam.memberships (RPC-only) and platform.associations SELECT is org-gated — a
-- direct subquery in a policy / has_access would 42501 for a cross-org student.
-- Same definer-probe pattern as public._edu_is_scope_member.
create or replace function public._edu_can_read_via_assignment(p_type text, p_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  -- Direct: the resource itself is assigned to a class the caller actively belongs to.
  -- Covers fc_set (deck) + assessment (quiz/test). assessment_item is a composition
  -- component, so has_access resolves it to its parent 'assessment' before this runs.
  select exists (
    select 1
    from platform.associations a
    join iam.memberships m
      on m.container_type = 'scope'
     and m.container_id   = a.target_id
     and m.user_id        = (select auth.uid())
     and m.status         = 'active'
     and m.deleted_at is null
    where a.source_type = p_type
      and a.source_id   = p_id
      and a.target_type = 'scope'
      and a.role        = 'assignment'
  )
  -- Cards inherit from their parent deck: an fc_card is readable when the fc_set it
  -- belongs to (fc_card --member--> fc_set edge) is assigned to a class the caller
  -- actively belongs to. fc_card has no set_id column — the deck membership is itself
  -- an association edge — so this is the card's only assignment path.
  or (
    p_type = 'fc_card' and exists (
      select 1
      from platform.associations link
      join platform.associations a
        on a.source_type = 'fc_set'
       and a.source_id   = link.target_id
       and a.target_type = 'scope'
       and a.role        = 'assignment'
      join iam.memberships m
        on m.container_type = 'scope'
       and m.container_id   = a.target_id
       and m.user_id        = (select auth.uid())
       and m.status         = 'active'
       and m.deleted_at is null
      where link.source_type = 'fc_card'
        and link.source_id   = p_id
        and link.target_type = 'fc_set'
        and link.role        = 'member'
    )
  );
$$;
-- Called from iam.has_access (SECURITY DEFINER, runs as owner) AND — belt & braces —
-- directly grantable to the querying roles, mirroring _edu_is_scope_member.
grant execute on function public._edu_can_read_via_assignment(text, uuid) to anon, authenticated;

-- ─── 2. Additive viewer-only branch in iam.has_access ───────────────────────────
-- Full-body CREATE OR REPLACE (captured from the live definition) with ONE branch
-- inserted after the direct-membership check and before the reachability walk. The
-- branch only ever RETURNS TRUE earlier than before — it is monotonic (never denies
-- an access that resolved before) and viewer-only.
create or replace function iam.has_access(p_type text, p_id uuid, p_required permission_level default 'viewer'::permission_level)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public', 'platform', 'iam', 'rag'
as $function$
DECLARE
  v_schema text; v_table text; v_is_component boolean;
  v_uid uuid := (SELECT auth.uid());
  v_vis platform.visibility; v_owner uuid; v_org uuid; v_found boolean;
  v_parent_type text; v_parent_col text; v_parent_id uuid;
  v_c_schema text; v_c_table text; v_c_owner uuid;
  v_c_vis platform.visibility; v_c_org uuid; v_c_found boolean;
  rec record;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  SELECT schema_name, table_name, COALESCE(is_component,false)
    INTO v_schema, v_table, v_is_component
  FROM platform.entity_types WHERE token = p_type;
  IF v_schema IS NULL THEN RETURN false; END IF;

  IF v_is_component THEN
    SELECT parent_type, fk_column INTO v_parent_type, v_parent_col
    FROM platform.entity_relationships WHERE child_type = p_type AND kind='composition' LIMIT 1;
    IF v_parent_type IS NULL THEN RETURN false; END IF;
    EXECUTE format('SELECT %I FROM %I.%I WHERE id=$1', v_parent_col, v_schema, v_table)
      INTO v_parent_id USING p_id;
    IF v_parent_id IS NULL THEN RETURN false; END IF;
    RETURN iam.has_access(v_parent_type, v_parent_id, p_required);
  END IF;

  IF p_type = 'data_store' AND p_required = 'viewer'
       AND public.user_can_read_data_store_via_grant(v_uid, p_id) THEN
    RETURN true;
  END IF;

  SELECT * INTO v_vis, v_owner, v_org, v_found
  FROM platform.entity_row_access_attrs(v_schema, v_table, p_id);
  IF NOT COALESCE(v_found, false) THEN RETURN false; END IF;

  IF v_owner = v_uid THEN RETURN true; END IF;
  IF p_required = 'viewer' AND v_org IS NOT NULL AND public.is_org_admin(v_org) THEN RETURN true; END IF;
  IF v_vis = 'public' AND p_required = 'viewer' THEN RETURN true; END IF;

  IF p_required = 'viewer'
       AND v_vis >= 'internal'::platform.visibility
       AND v_org IS NOT NULL
       AND v_org IN (SELECT organization_id FROM iam.system_orgs WHERE global_readable)
  THEN RETURN true; END IF;

  IF v_org IS NOT NULL
       AND v_org IN (SELECT organization_id FROM iam.system_orgs WHERE global_readable)
       AND public.is_super_admin()
  THEN RETURN true; END IF;

  IF public.has_permission(p_type, p_id, p_required) THEN RETURN true; END IF;

  IF EXISTS (
    SELECT 1 FROM iam.memberships m
    JOIN iam.membership_grant g ON g.member_role = m.role AND g.container_type IN (p_type, '*')
    WHERE m.container_type = p_type AND m.container_id = p_id AND m.user_id = v_uid
      AND m.deleted_at IS NULL AND g.confers >= p_required
  ) THEN RETURN true; END IF;

  -- Education: a resource ASSIGNED to a class the caller is an ACTIVE member of
  -- confers VIEWER access, for as long as the assignment edge + active membership
  -- both exist. Additive + viewer-only + monotonic. See _edu_can_read_via_assignment.
  IF p_required = 'viewer' AND public._edu_can_read_via_assignment(p_type, p_id) THEN
    RETURN true;
  END IF;

  FOR rec IN
    SELECT r.container_type, r.container_id
    FROM platform.reachability r
    WHERE r.item_type = p_type AND r.item_id = p_id
      AND r.max_level >= p_required
  LOOP
    IF public.has_permission(rec.container_type, rec.container_id, p_required) THEN
      RETURN true;
    END IF;
    IF rec.container_type = 'data_store' AND p_required = 'viewer'
         AND public.user_can_read_data_store_via_grant(v_uid, rec.container_id) THEN
      RETURN true;
    END IF;
    IF EXISTS (
      SELECT 1 FROM iam.memberships m
      JOIN iam.membership_grant g ON g.member_role = m.role
        AND g.container_type IN (rec.container_type, '*')
      WHERE m.container_type = rec.container_type AND m.container_id = rec.container_id
        AND m.user_id = v_uid AND m.deleted_at IS NULL AND g.confers >= p_required
    ) THEN
      RETURN true;
    END IF;
    SELECT et.schema_name, et.table_name INTO v_c_schema, v_c_table
    FROM platform.entity_types et WHERE et.token = rec.container_type;
    IF v_c_schema IS NOT NULL THEN
      SELECT * INTO v_c_vis, v_c_owner, v_c_org, v_c_found
      FROM platform.entity_row_access_attrs(v_c_schema, v_c_table, rec.container_id);
      IF v_c_owner = v_uid THEN RETURN true; END IF;
      IF p_required = 'viewer' AND v_c_vis IS NOT NULL THEN
        IF v_c_vis = 'public' THEN RETURN true; END IF;
        IF v_c_vis >= 'internal'::platform.visibility
             AND v_c_org IS NOT NULL AND iam.has_org_access(v_c_org) THEN RETURN true; END IF;
      END IF;
    END IF;
  END LOOP;

  IF v_vis >= 'internal'::platform.visibility AND v_org IS NOT NULL
       AND iam.has_org_access(v_org) THEN RETURN true; END IF;
  IF v_vis >= 'internal'::platform.visibility THEN
    FOR rec IN SELECT parent_type, fk_column FROM platform.entity_relationships
               WHERE child_type = p_type AND kind='containment' LOOP
      EXECUTE format('SELECT %I FROM %I.%I WHERE id=$1', rec.fk_column, v_schema, v_table)
        INTO v_parent_id USING p_id;
      IF v_parent_id IS NOT NULL AND iam.has_access(rec.parent_type, v_parent_id, p_required) THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;
  RETURN false;
END
$function$;

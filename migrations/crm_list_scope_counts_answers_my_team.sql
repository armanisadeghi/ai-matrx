-- crm_list_scope_counts_answers_my_team — the CRM contacts list's tab counts include "My team" (access-ladder T-29).
--
-- The contacts list offers Mine + My Orgs, so it shows the platform's "My team" tab; its client
-- query answers 'team' through lib/list-scope/teamReach.ts, and these counts now return a 'team'
-- total plus a narrow row per organization where the caller shares a team with someone, from the
-- same iam.my_team_reach. Both overloads, live bodies read 2026-09-28, only the team arms added.
set local lock_timeout = '2s';
-- based-on: public.crm_list_scope_counts(text, text, text) e2b4a25339fda30ac9b822ccf7065c78ac4db527a48f8e700975c0fc94250706
-- based-on: public.crm_list_scope_counts(text, text, text, text) 3d150ee230a7507474f9778124413fd4f5c39ffac7bd65b9aabda11888a6e126
SELECT set_config('app.actor_tier', 'code', true);
SELECT set_config('app.actor_system', 'migration:crm_list_scope_counts_answers_my_team', true);

CREATE OR REPLACE FUNCTION public.crm_list_scope_counts(p_view text DEFAULT 'active'::text, p_kind text DEFAULT NULL::text, p_search text DEFAULT NULL::text)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_trash  boolean := (p_view = 'trash');
  v_term   text := nullif(btrim(coalesce(p_search, '')), '');
  v_like   text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_like := '%' || v_term || '%';

  RETURN QUERY
  WITH reach AS (
    -- MY TEAM (T-29): (organization, person) pairs sharing a live team with the caller.
    SELECT r.organization_id AS org_id, r.user_id FROM iam.my_team_reach(NULL) r
  ),
  my_orgs AS (
    SELECT DISTINCT m.container_id AS org_id
    FROM iam.memberships m
    WHERE m.user_id = v_uid
      AND m.container_type = 'organization'
      AND m.deleted_at IS NULL AND m.status = 'active'
  ),
  base AS (
    SELECT p.created_by, p.organization_id, p.visibility
    FROM crm.party p
    WHERE
      (p.created_by = v_uid
       OR iam.has_access('party'::text, p.id, 'viewer'::permission_level))
      AND p.canonical_id IS NULL
      AND (CASE WHEN v_trash THEN p.deleted_at IS NOT NULL
                ELSE p.deleted_at IS NULL END)
      AND (p_kind IS NULL OR p_kind = 'all' OR p.party_kind = p_kind)
      AND (v_term IS NULL
           OR p.display_name    ILIKE v_like
           OR p.legal_name      ILIKE v_like
           OR p.primary_domain  ILIKE v_like
           OR p.job_title       ILIKE v_like)
  )
  SELECT t.scope, t.narrow_id, t.label, t.total FROM (
    SELECT 'mine'::text AS scope, NULL::uuid AS narrow_id, NULL::text AS label,
           count(*) FILTER (WHERE b.created_by = v_uid) AS total, 0 AS ord
    FROM base b
    UNION ALL
    SELECT 'orgs', NULL::uuid, NULL::text,
           count(*) FILTER (WHERE b.organization_id IN (SELECT org_id FROM my_orgs)), 1
    FROM base b
    UNION ALL
    SELECT 'team', NULL::uuid, NULL::text,
           count(*) FILTER (WHERE (b.organization_id, b.created_by) IN (SELECT org_id, user_id FROM reach)), 1
    FROM base b
    UNION ALL
    SELECT 'team', o.org_id, coalesce(g.name, 'Unnamed org'),
           (SELECT count(*) FROM base b WHERE (b.organization_id, b.created_by) IN (SELECT org_id, user_id FROM reach WHERE reach.org_id = o.org_id)), 4
    FROM (SELECT DISTINCT org_id FROM reach WHERE user_id <> v_uid) o
    LEFT JOIN iam.organizations g ON g.id = o.org_id
    UNION ALL
    SELECT 'public', NULL::uuid, NULL::text,
           count(*) FILTER (WHERE b.visibility = 'public'), 2
    FROM base b
    UNION ALL
    SELECT 'orgs', o.org_id, coalesce(g.name, 'Unnamed org'),
           (SELECT count(*) FROM base b WHERE b.organization_id = o.org_id), 3
    FROM my_orgs o
    LEFT JOIN iam.organizations g ON g.id = o.org_id
  ) t
  ORDER BY t.ord, lower(coalesce(t.label, '')), t.narrow_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_list_scope_counts(p_view text DEFAULT 'active'::text, p_kind text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_record_class text DEFAULT 'contact'::text)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_trash  boolean := (p_view = 'trash');
  v_term   text := nullif(btrim(coalesce(p_search, '')), '');
  v_class  text := nullif(btrim(coalesce(p_record_class, 'contact')), '');
  v_like   text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_like := '%' || v_term || '%';

  RETURN QUERY
  WITH reach AS (
    -- MY TEAM (T-29): (organization, person) pairs sharing a live team with the caller.
    SELECT r.organization_id AS org_id, r.user_id FROM iam.my_team_reach(NULL) r
  ),
  my_orgs AS (
    SELECT DISTINCT m.container_id AS org_id
    FROM iam.memberships m
    WHERE m.user_id = v_uid
      AND m.container_type = 'organization'
      AND m.deleted_at IS NULL AND m.status = 'active'
  ),
  base AS (
    SELECT p.created_by, p.organization_id, p.visibility
    FROM crm.party p
    WHERE
      (p.created_by = v_uid
       OR iam.has_access('party'::text, p.id, 'viewer'::permission_level))
      AND p.canonical_id IS NULL
      AND (CASE WHEN v_trash THEN p.deleted_at IS NOT NULL
                ELSE p.deleted_at IS NULL END)
      AND (v_class IS NULL OR v_class = 'all' OR p.record_class = v_class)
      AND (p_kind IS NULL OR p_kind = 'all' OR p.party_kind = p_kind)
      AND (v_term IS NULL
           OR p.display_name    ILIKE v_like
           OR p.legal_name      ILIKE v_like
           OR p.primary_domain  ILIKE v_like
           OR p.job_title       ILIKE v_like)
  )
  SELECT t.scope, t.narrow_id, t.label, t.total FROM (
    SELECT 'mine'::text AS scope, NULL::uuid AS narrow_id, NULL::text AS label,
           count(*) FILTER (WHERE b.created_by = v_uid) AS total, 0 AS ord
    FROM base b
    UNION ALL
    SELECT 'orgs', NULL::uuid, NULL::text,
           count(*) FILTER (WHERE b.organization_id IN (SELECT org_id FROM my_orgs)), 1
    FROM base b
    UNION ALL
    SELECT 'team', NULL::uuid, NULL::text,
           count(*) FILTER (WHERE (b.organization_id, b.created_by) IN (SELECT org_id, user_id FROM reach)), 1
    FROM base b
    UNION ALL
    SELECT 'team', o.org_id, coalesce(g.name, 'Unnamed org'),
           (SELECT count(*) FROM base b WHERE (b.organization_id, b.created_by) IN (SELECT org_id, user_id FROM reach WHERE reach.org_id = o.org_id)), 4
    FROM (SELECT DISTINCT org_id FROM reach WHERE user_id <> v_uid) o
    LEFT JOIN iam.organizations g ON g.id = o.org_id
    UNION ALL
    SELECT 'public', NULL::uuid, NULL::text,
           count(*) FILTER (WHERE b.visibility = 'public'), 2
    FROM base b
    UNION ALL
    SELECT 'orgs', o.org_id, coalesce(g.name, 'Unnamed org'),
           (SELECT count(*) FROM base b WHERE b.organization_id = o.org_id), 3
    FROM my_orgs o
    LEFT JOIN iam.organizations g ON g.id = o.org_id
  ) t
  ORDER BY t.ord, lower(coalesce(t.label, '')), t.narrow_id;
END;
$function$;

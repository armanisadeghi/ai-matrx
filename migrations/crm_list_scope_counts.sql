-- crm_list_scope_counts — ONE round trip for every CRM party scope tab count.
--
-- D139: features/crm/service.ts#fetchPartyScopeCounts fired `3 + N_orgs`
-- head-count queries (one per scope tab PLUS one per organization), re-run on
-- every 200ms search keystroke. A user in 8 orgs typing one character fired 11
-- requests. Same shape and conventions as the exemplars this repo already ships:
-- public.agx_list_scope_counts (agents) and public.trx_list_scope_counts
-- (transcripts) — SECURITY DEFINER, auth.uid()-gated, returning
-- (scope, narrow_id, label, total) so the scope tabs AND the My Orgs narrowing
-- dropdown come from the same query (lib/list-scope/FEATURE.md).
--
-- PREDICATE PARITY (counts must not move): this mirrors the OLD count path
-- exactly — canonical rows only, view (active|trash) over deleted_at, the kind
-- facet, and the search across the four human identity columns. The list
-- page's column filters were NOT applied to the counts before and are not
-- applied here; changing that is a product decision, not a perf fix.
--
-- ORG SET: every organization membership the caller has (iam.memberships,
-- container_type 'organization') — the same set features/organizations/service.ts
-- #getUserOrganizations hands the client today, personal orgs included. The
-- agents/transcripts twins exclude personal orgs; CRM never did, and the point
-- of this migration is that the numbers do not change.
--
-- crm.party has NO archive flag — active|trash over deleted_at is the whole
-- lifecycle axis, hence p_view rather than the agx p_archived convention.

CREATE OR REPLACE FUNCTION public.crm_list_scope_counts(
  p_view   text DEFAULT 'active',
  p_kind   text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_trash  boolean := (p_view = 'trash');
  v_term   text := nullif(btrim(coalesce(p_search, '')), '');
  v_like   text;
BEGIN
  -- Anonymous callers get nothing. SECURITY DEFINER bypasses RLS, so identity
  -- is the gate (same posture as agx_/trx_list_scope_counts).
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_like := '%' || v_term || '%';

  RETURN QUERY
  WITH my_orgs AS (
    SELECT DISTINCT m.container_id AS org_id
    FROM iam.memberships m
    WHERE m.user_id = v_uid
      AND m.container_type = 'organization'
  ),
  base AS (
    SELECT p.created_by, p.organization_id, p.visibility
    FROM crm.party p
    WHERE
      -- THE RLS CEILING, RESTATED. SECURITY DEFINER bypasses RLS, so the
      -- crm.party std_select policy is reproduced verbatim here — without it
      -- the tabs would report rows the user cannot open (the old client path
      -- was RLS-filtered, and these numbers must not move).
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
  -- One pass over `base` per scope, plus the per-org breakdown for the My Orgs
  -- narrowing dropdown. The label ships with the count so the client never
  -- needs a second name lookup. Ordered so the narrowing options arrive in a
  -- stable, alphabetical order rather than whatever the planner produced.
  SELECT t.scope, t.narrow_id, t.label, t.total FROM (
    SELECT 'mine'::text AS scope, NULL::uuid AS narrow_id, NULL::text AS label,
           count(*) FILTER (WHERE b.created_by = v_uid) AS total, 0 AS ord
    FROM base b
    UNION ALL
    SELECT 'orgs', NULL::uuid, NULL::text,
           count(*) FILTER (WHERE b.organization_id IN (SELECT org_id FROM my_orgs)), 1
    FROM base b
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

REVOKE ALL ON FUNCTION public.crm_list_scope_counts(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.crm_list_scope_counts(text, text, text) TO authenticated;

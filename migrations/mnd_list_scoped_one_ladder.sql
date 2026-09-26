-- mnd_list_scoped — REWIRED for the one-resolution campaign.
-- Supersedes migrations/mnd_list_scoped.sql, which stays on disk as the record
-- of the previous body (and therefore as the rollback).
--
-- Campaign: common-docs/projects/workflow-mandate-program/DESIGN-one-resolution.md
-- v2 (D-R1/D-R2/D-R3) + REVIEW-one-resolution.md findings 7, 8, 8b.
--
-- FOUR THINGS CHANGE, and nothing else:
--
-- 1 · OWNERSHIP, on the definition scan itself (`p_home`). The old body's only
--     predicate on mandate.definition was `deleted_at IS NULL` plus a
--     placeholder filter, and the function is SECURITY DEFINER — so RLS never
--     applied and EVERY signed-in user was shown all 682 definitions,
--     including 273 personal mandates belonging to other people (review §8).
--       'system'     rows homed in the system org. A NON-ADMIN IS REFUSED WITH
--                    THE REASON — never the silent empty list agx_list_scoped
--                    returns, which is "empty for one reason and empty for a
--                    completely different reason with the same appearance".
--       'org:<uuid>' rows homed in that organization; membership is proved.
--       'all'        (default) rows homed in the system org OR in any
--                    organization the caller belongs to. A personal workspace
--                    is just an organization — deliberately UNLIKE
--                    agx_list_scoped, which excludes personal orgs
--                    (`o.is_personal IS NOT TRUE`) and would return zero rows
--                    for 273 of the 274 non-system mandates.
--
-- 2 · RESOLUTION comes from THE ONE LADDER — `mandate._rungs`, the same body
--     `mandate.resolve` / `mandate.resolve_for` are built on. There is no
--     second copy of the ladder in this function any more; the old `user_b` /
--     `org_b` / `settings_b` CTEs are gone.
--
-- 3 · THE ORG RUNG IS THE ORG YOU PASS (D-R1). The old `mine` scope took the
--     newest org binding across ANY organization the caller belonged to. It no
--     longer does: 'mine' resolves on `p_org_id`, proved, and with no
--     `p_org_id` there is NO org rung at all. That is the fail-closed
--     direction and it is visible: a caller that has not yet been taught to
--     send its active organization sees the system/global/user answer, never
--     another organization's.
--
-- 4 · `holder_live` / `version_live` ride out on every row, so a broken
--     override is SHOWN as broken instead of being quietly displayed as the
--     winner (review §4). `home_organization_id` rides out so the caller can
--     draw the per-organization tabs without a second query.
--
-- 🚨 AMENDMENTS TO THE FROZEN SPEC — say them loudly:
--   (a) DROP the old eight-argument signature, then CREATE OR REPLACE the new
--       ten-argument signature inside ONE transaction. Postgres cannot change
--       a function's RETURNS TABLE or add parameters with CREATE OR REPLACE;
--       adding defaulted parameters as a NEW overload would make every existing
--       8-argument call ambiguous (42725). CREATE OR REPLACE is deliberately
--       used for the new signature because hosted reconciliation may already
--       have installed it before this checkout's ledger catches up. The design
--       REQUIRES both changes (new holder_live/version_live columns, new
--       p_home/p_resolution_for parameters), so dropping only the superseded
--       signature is the design's own consequence, not a lane's shortcut. It
--       is contained: the previous body is preserved verbatim in
--       migrations/mnd_list_scoped.sql, the replacement is in the same
--       transaction (no window for a caller to see nothing),
--       and the campaign's actual no-DROP constraint — the live shortcut
--       serving path `agx_get_user_shortcuts_m` /
--       `agx_list_non_global_shortcuts_for_admin_m` — is untouched.
--   (b) The loud refusal is extended from `p_home='system'` to EVERY
--       organization the caller names and does not belong to (`p_home='org:…'`
--       and a `p_org_id` used for resolution). The design specified the
--       refusal only for the system home; the old body answered a non-member
--       with a silent empty list. Same law, same class: a screen is absent or
--       honest, never dead.
--
-- ARGUMENT COMPATIBILITY: the eight existing parameters keep their names,
-- types, order and defaults, so `mnd_list_scope_counts` / `mnd_list_facets`
-- (positional, 8 args) and both frontend callers (named args) keep working
-- untouched. `p_scope` remains the legacy carrier of the resolution scope and
-- `p_resolution_for` falls back to it.
--
-- Rows changed by this migration: NONE (DDL + one registry row).

BEGIN;

-- The platform ddl_guard revokes client EXECUTE from any SECURITY DEFINER
-- function that is not a declared door, and it screams while doing it
-- (hr_l3_108/hr_l3_110). Declare BEFORE the grant, per the guard's own remedy.
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, reason)
VALUES
  ('public', 'mnd_list_scoped',
   'p_scope text, p_org_id uuid, p_search text, p_sort text, p_dir text, p_filters jsonb, p_limit integer, p_offset integer, p_home text, p_resolution_for text',
   'READ. The ONE mandate list door. SECURITY DEFINER because the per-caller columns (resolved rung, drift, health) need the caller''s bindings; it takes no user id — the subject is auth.uid(), every organization named is proved against iam.organization_member, and the system home is admin-gated in the body with a loud refusal.')
ON CONFLICT DO NOTHING;

DROP FUNCTION IF EXISTS public.mnd_list_scoped(text, uuid, text, text, text, jsonb, integer, integer);

CREATE OR REPLACE FUNCTION public.mnd_list_scoped(
  p_scope           text    DEFAULT 'mine',
  p_org_id          uuid    DEFAULT NULL,
  p_search          text    DEFAULT NULL,
  p_sort            text    DEFAULT 'label',
  p_dir             text    DEFAULT 'asc',
  p_filters         jsonb   DEFAULT '{}'::jsonb,
  p_limit           integer DEFAULT 25,
  p_offset          integer DEFAULT 0,
  p_home            text    DEFAULT 'all',
  p_resolution_for  text    DEFAULT NULL
)
RETURNS TABLE(
  id uuid, mandate_key text, label text, description text, feature text,
  provision_key text, offered_count integer, input_kind text, output_kind text,
  is_enabled boolean, resolved_layer text, resolved_agent_id uuid,
  resolved_agent_name text, resolved_agent_type text, resolved_use_latest boolean,
  pinned_version_number integer, latest_version integer, drift text, health text,
  has_settings_override boolean, updated_at timestamp with time zone,
  total_count bigint,
  holder_live boolean, version_live boolean, home_organization_id uuid
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := (SELECT auth.uid());
  v_q      text := NULLIF(btrim(coalesce(p_search, '')), '');
  v_f      jsonb := coalesce(p_filters, '{}'::jsonb);
  v_sort   text := coalesce(p_sort, 'label');
  v_dir    text := CASE WHEN lower(coalesce(p_dir,'asc')) = 'desc' THEN 'desc' ELSE 'asc' END;
  v_sys    uuid;
  -- OWNERSHIP — whose mandates are in the corpus at all.
  v_home     text := lower(btrim(coalesce(p_home, 'all')));
  v_home_org uuid;
  -- RESOLUTION — whose ladder is shown for each of them. 'mine' answers "who
  -- fulfils this job FOR ME, in the organization I am working in"; 'org'
  -- answers "who fulfils it for EVERY MEMBER of this organization" — the only
  -- honest answer on an org-settings page, where the admin's own personal
  -- override is irrelevant and used to win anyway.
  v_res      text := lower(coalesce(NULLIF(btrim(coalesce(p_resolution_for,'')),''), p_scope, 'mine'));
  v_res_org  uuid;
  v_res_user uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT so.organization_id INTO v_sys FROM iam.system_orgs so WHERE so.key = 'system';

  -- ---- ownership -----------------------------------------------------------
  IF v_home = 'system' THEN
    IF NOT public.is_platform_admin() THEN
      RAISE EXCEPTION USING
        errcode = '42501',
        message = 'Only a platform administrator can list the system organization''s mandates.',
        detail  = 'System mandates decide for every user on the platform, so their list is admin-only.',
        hint    = 'Ask for your own organizations instead: p_home => ''all'', or p_home => ''org:<organization id>''.';
    END IF;
  ELSIF v_home LIKE 'org:%' THEN
    BEGIN
      v_home_org := substring(v_home from 5)::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION USING
        errcode = '22P02',
        message = format('p_home %L is not a valid organization selector.', p_home),
        hint    = 'Use ''all'', ''system'', or ''org:<organization uuid>''.';
    END;
    IF NOT EXISTS (SELECT 1 FROM iam.organization_member om
                    WHERE om.user_id = v_uid AND om.organization_id = v_home_org) THEN
      RAISE EXCEPTION USING
        errcode = '42501',
        message = 'You are not a member of that organization, so its mandates are not yours to list.',
        detail  = format('Organization %L has no membership row for you.', v_home_org),
        hint    = 'Switch to an organization you belong to, or ask an administrator there to add you.';
    END IF;
  ELSIF v_home <> 'all' THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = format('p_home %L is not a home selector.', p_home),
      hint    = 'Use ''all'' (the system organization plus every organization you belong to), ''system'', or ''org:<organization uuid>''.';
  END IF;

  -- ---- resolution ----------------------------------------------------------
  IF v_res NOT IN ('mine', 'org') THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = format('p_resolution_for %L is not a resolution scope.', v_res),
      hint    = 'Use ''mine'' (who fulfils this for me, in the organization I pass) or ''org'' (who fulfils it for every member of the organization I pass).';
  END IF;

  IF v_res = 'org' THEN
    IF p_org_id IS NULL THEN
      RAISE EXCEPTION USING
        errcode = '22023',
        message = 'Resolving for an organization needs to know which one.',
        hint    = 'Pass p_org_id, or ask for p_resolution_for => ''mine''.';
    END IF;
    v_res_user := NULL;   -- personal overrides are excluded, deliberately
  ELSE
    v_res_user := v_uid;
  END IF;

  -- Every organization the caller NAMES is proved. A stale organization after
  -- an org switch is told so; it never silently resolves as somebody else's.
  IF p_org_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM iam.organization_member om
                    WHERE om.user_id = v_uid AND om.organization_id = p_org_id) THEN
      RAISE EXCEPTION USING
        errcode = '42501',
        message = 'You are not a member of that organization, so its resolution is not yours to see.',
        detail  = format('Organization %L has no membership row for you.', p_org_id),
        hint    = 'Switch to an organization you belong to before asking what it runs.';
    END IF;
    v_res_org := p_org_id;
  END IF;

  RETURN QUERY
  WITH my_orgs AS (
    SELECT om.organization_id AS org_id
    FROM iam.organization_member om
    WHERE om.user_id = v_uid
  ),
  owned AS (
    SELECT m.*
    FROM mandate.definition m
    WHERE m.deleted_at IS NULL
      AND coalesce(m.metadata->>'migration_status','') <> 'placeholder'
      AND (
        CASE
          WHEN v_home = 'system'     THEN m.organization_id = v_sys
          WHEN v_home LIKE 'org:%'   THEN m.organization_id = v_home_org
          ELSE m.organization_id = v_sys
               OR m.organization_id IN (SELECT mo.org_id FROM my_orgs mo)
        END
      )
  ),
  -- THE ONE LADDER. Not a copy of it.
  rungs AS (
    SELECT r.*
    FROM mandate._rungs(ARRAY(SELECT o.id FROM owned o), v_res_user, v_res_org) r
  ),
  -- The DISPLAY projection: this list is Agent-shaped, so the row it shows is
  -- the highest rung that chose an AGENT holder and is enabled. Settings-only
  -- rungs never move the layer; they raise has_settings_override.
  winner AS (
    SELECT DISTINCT ON (r.mandate_id)
           r.mandate_id AS w_id, r.rung AS w_rung, r.holder_id AS w_agent_id,
           r.holder_version_id AS w_version_id, r.holder_live AS w_holder_live,
           r.version_live AS w_version_live
    FROM rungs r
    WHERE r.chose_holder AND r.is_enabled AND r.holder_type = 'agent'
    ORDER BY r.mandate_id, r.rung_order DESC
  ),
  settings AS (
    SELECT DISTINCT r.mandate_id AS s_id
    FROM rungs r
    WHERE r.is_enabled AND r.config_overrides IS NOT NULL AND r.binding_id IS NOT NULL
  ),
  resolved AS (
    SELECT
      m.id            AS r_id,
      m.mandate_key   AS r_key,
      m.label         AS r_label,
      m.description   AS r_description,
      split_part(m.mandate_key, '.', 1) AS r_feature,
      m.provision_key AS r_provision_key,
      NULL::text      AS r_input_kind,
      m.output_kind   AS r_output_kind,
      m.is_enabled    AS r_enabled,
      m.updated_at    AS r_updated_at,
      m.organization_id AS r_home_org,
      coalesce(w.w_rung, 'system')      AS r_layer,
      w.w_agent_id                      AS r_agent_id_raw,
      w.w_version_id                    AS r_version_id,
      (w.w_version_id IS NULL)          AS r_use_latest,
      w.w_holder_live                   AS r_holder_live,
      w.w_version_live                  AS r_version_live,
      (sb.s_id IS NOT NULL)             AS r_has_settings,
      coalesce(jsonb_array_length(pr.offered_values), 0) AS r_offered_count
    FROM owned m
    LEFT JOIN winner w   ON w.w_id = m.id
    LEFT JOIN settings sb ON sb.s_id = m.id
    LEFT JOIN mandate.provision pr
           ON pr.provision_key = m.provision_key AND pr.deleted_at IS NULL
  ),
  enriched AS (
    SELECT
      r.*,
      coalesce(dv.agent_id, r.r_agent_id_raw) AS r_agent_id,
      dv.version_number AS r_pinned_version,
      d.name        AS r_agent_name,
      d.agent_type  AS r_agent_type,
      d.version     AS r_latest_version,
      d.is_archived AS r_agent_archived,
      (d.id IS NULL) AS r_agent_missing
    FROM resolved r
    LEFT JOIN agent.definition_version dv ON dv.id = r.r_version_id
    LEFT JOIN agent.definition d
           ON d.id = coalesce(dv.agent_id, r.r_agent_id_raw)
          AND d.deleted_at IS NULL
  ),
  shaped AS (
    SELECT
      e.*,
      CASE WHEN e.r_pinned_version IS NOT NULL AND e.r_latest_version IS NOT NULL
                AND e.r_latest_version > e.r_pinned_version
           THEN 'v' || e.r_pinned_version || ' → v' || e.r_latest_version
           ELSE NULL END AS r_drift,
      CASE WHEN NOT e.r_enabled THEN 'disabled'
           WHEN e.r_agent_missing THEN 'holder missing'
           WHEN coalesce(e.r_agent_archived, false) THEN 'holder archived'
           WHEN e.r_holder_live IS FALSE THEN 'holder unreachable'
           WHEN e.r_version_live IS FALSE THEN 'version unreachable'
           WHEN e.r_pinned_version IS NOT NULL AND e.r_latest_version IS NOT NULL
                AND e.r_latest_version > e.r_pinned_version THEN 'drift'
           ELSE 'ok' END AS r_health
    FROM enriched e
  ),
  filtered AS (
    SELECT s.* FROM shaped s
    WHERE
      (NOT v_f ? 'label'
        OR s.r_label ILIKE '%' || (v_f->'label'->>'value') || '%'
        OR s.r_key   ILIKE '%' || (v_f->'label'->>'value') || '%')
      AND (NOT v_f ? 'feature'
        OR s.r_feature IN (SELECT jsonb_array_elements_text(v_f->'feature'->'values')))
      AND (NOT v_f ? 'layer'
        OR s.r_layer IN (SELECT jsonb_array_elements_text(v_f->'layer'->'values')))
      AND (NOT v_f ? 'output_kind'
        OR coalesce(NULLIF(s.r_output_kind,''),'__none__')
           IN (SELECT jsonb_array_elements_text(v_f->'output_kind'->'values')))
      AND (NOT v_f ? 'health'
        OR s.r_health IN (SELECT jsonb_array_elements_text(v_f->'health'->'values')))
      AND (NOT v_f ? 'fulfilled_by'
        OR s.r_agent_name ILIKE '%' || (v_f->'fulfilled_by'->>'value') || '%')
      AND (NOT v_f ? 'inputs'
        OR ((v_f->'inputs'->>'value')::boolean = (s.r_provision_key IS NOT NULL)))
      -- COVERAGE BADGE narrowing. The three-state classification lives in ONE
      -- place — aidream services/mandates/coverage.py, read over
      -- GET /mandates/coverage/states — and what arrives here is only the KEY
      -- LIST that server already classified.
      AND (NOT v_f ? 'coverage_keys'
        OR s.r_key IN (SELECT jsonb_array_elements_text(v_f->'coverage_keys'->'values')))
      AND (NOT v_f ? 'updated'
        OR (v_f->'updated'->'values'->>0) IS NULL
        OR s.r_updated_at >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
  ),
  scored AS (
    SELECT f.*,
      CASE WHEN v_q IS NULL THEN 0
        ELSE public.mtx_search_score(
          v_q, f.r_id, f.r_label, coalesce(f.r_description,''),
          ARRAY[]::text[], NULL,
          ARRAY[f.r_key, coalesce(f.r_provision_key,'')],
          ARRAY[f.r_feature, coalesce(f.r_agent_name,'')],
          false)
      END AS s_score
    FROM filtered f
  ),
  counted AS (
    SELECT sc.*, count(*) OVER () AS s_total
    FROM scored sc
    WHERE v_q IS NULL OR sc.s_score > 0
  )
  SELECT
    c.r_id, c.r_key, c.r_label, c.r_description, c.r_feature,
    c.r_provision_key, c.r_offered_count, c.r_input_kind, c.r_output_kind,
    c.r_enabled, c.r_layer, c.r_agent_id, c.r_agent_name,
    c.r_agent_type::text, c.r_use_latest, c.r_pinned_version,
    c.r_latest_version, c.r_drift, c.r_health, c.r_has_settings,
    c.r_updated_at, c.s_total,
    c.r_holder_live, c.r_version_live, c.r_home_org
  FROM counted c
  ORDER BY
    CASE WHEN v_q IS NOT NULL THEN c.s_score END DESC,
    CASE WHEN v_sort = 'label'   AND v_dir = 'asc'  THEN c.r_label END ASC,
    CASE WHEN v_sort = 'label'   AND v_dir = 'desc' THEN c.r_label END DESC,
    CASE WHEN v_sort = 'feature' AND v_dir = 'asc'  THEN c.r_feature END ASC,
    CASE WHEN v_sort = 'feature' AND v_dir = 'desc' THEN c.r_feature END DESC,
    CASE WHEN v_sort = 'fulfilled_by' AND v_dir = 'asc'  THEN c.r_agent_name END ASC,
    CASE WHEN v_sort = 'fulfilled_by' AND v_dir = 'desc' THEN c.r_agent_name END DESC,
    CASE WHEN v_sort = 'layer'   AND v_dir = 'asc'  THEN c.r_layer END ASC,
    CASE WHEN v_sort = 'layer'   AND v_dir = 'desc' THEN c.r_layer END DESC,
    CASE WHEN v_sort = 'inputs'  AND v_dir = 'asc'  THEN c.r_offered_count END ASC,
    CASE WHEN v_sort = 'inputs'  AND v_dir = 'desc' THEN c.r_offered_count END DESC,
    CASE WHEN v_sort = 'output_kind' AND v_dir = 'asc'  THEN c.r_output_kind END ASC NULLS LAST,
    CASE WHEN v_sort = 'output_kind' AND v_dir = 'desc' THEN c.r_output_kind END DESC NULLS LAST,
    CASE WHEN v_sort = 'health'  AND v_dir = 'asc'  THEN c.r_health END ASC,
    CASE WHEN v_sort = 'health'  AND v_dir = 'desc' THEN c.r_health END DESC,
    CASE WHEN v_sort = 'updated' AND v_dir = 'asc'  THEN c.r_updated_at END ASC,
    CASE WHEN v_sort = 'updated' AND v_dir = 'desc' THEN c.r_updated_at END DESC,
    c.r_label ASC,
    c.r_id ASC
  LIMIT greatest(coalesce(p_limit, 25), 1)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$function$;

-- Grants. The `anon` grant of the previous body is NOT reissued: the function
-- returns early on a null auth.uid(), so anon got nothing anyway, and an
-- unnecessary grant on a SECURITY DEFINER door is a standing invitation.
-- `anon` is revoked EXPLICITLY: Supabase's ALTER DEFAULT PRIVILEGES grants
-- EXECUTE to anon/authenticated/service_role on every function postgres
-- creates, so `REVOKE … FROM PUBLIC` alone leaves the anon grant standing.
REVOKE ALL ON FUNCTION public.mnd_list_scoped(text,uuid,text,text,text,jsonb,integer,integer,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mnd_list_scoped(text,uuid,text,text,text,jsonb,integer,integer,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mnd_list_scoped(text,uuid,text,text,text,jsonb,integer,integer,text,text) TO authenticated;

DO $$
DECLARE v_acl text; v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'mnd_list_scoped';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'mnd_list_scoped_one_ladder: % overloads of mnd_list_scoped exist — every 8-argument call would be ambiguous', v_n;
  END IF;

  SELECT p.proacl::text INTO v_acl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'mnd_list_scoped';
  IF v_acl IS NULL OR v_acl NOT LIKE '%authenticated=X%' THEN
    RAISE EXCEPTION 'mnd_list_scoped_one_ladder: authenticated EXECUTE did not stick (acl=%)', v_acl;
  END IF;
  IF v_acl LIKE '%anon=X%' THEN
    RAISE EXCEPTION 'mnd_list_scoped_one_ladder: the anon grant is back (acl=%)', v_acl;
  END IF;
  RAISE NOTICE 'mnd_list_scoped_one_ladder: acl = %', v_acl;
END $$;

COMMIT;

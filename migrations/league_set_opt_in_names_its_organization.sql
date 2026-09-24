-- chair-step: replaces one signed-in RPC with an org-taking signature; the DROP removes
-- only the superseded overload (the same name is re-created below with a trailing
-- DEFAULT argument), and its client_callable_door row is MOVED onto the new signature
-- (a door follows its function) so its signed-in grant survives the guard.
-- Joining the weekly study league names its organization.
--
-- DEFECT (census of live 23502s, 2026-09-23): public.league_set_opt_in inserted
-- education.league_membership with organization_id = iam.personal_org_id(auth.uid()).
-- That is the database choosing a tenant — the exact thing aidream 0929 (2026-09-19)
-- forbade — and for a caller with no personal organization it returned NULL and the
-- insert died with `23502 null value in column "organization_id"`, a message nobody
-- could act on (six such failures in the last 24h).
--
-- FIX: the function takes p_organization_id (DEFAULT NULL so the refusal is a sentence
-- rather than PostgREST's "function not found"), refuses a missing one with 22023, and
-- refuses an organization the caller does not belong to with 42501. The UPDATE of this
-- week's existing membership is unchanged (the row already carries its organization).
-- The client (features/education/engage/data/gameService.ts) names it via ensureOrgId.

DROP FUNCTION IF EXISTS public.league_set_opt_in(boolean, text);
CREATE OR REPLACE FUNCTION public.league_set_opt_in(
  p_opted_in boolean,
  p_display_name text DEFAULT NULL::text,
  p_organization_id uuid DEFAULT NULL::uuid
)
 RETURNS education.league_membership
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'education', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_week date := date_trunc('week', now() AT TIME ZONE 'utc')::date;
  v_activity integer;
  v_band text;
  v_cohort text;
  v_row education.league_membership;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'league_set_opt_in requires authentication' USING ERRCODE = '42501';
  END IF;

  -- 🚨 THE CALLER NAMES THE ORGANIZATION (aidream 0929, 2026-09-19: the database never
  -- chooses a tenant). This used to be iam.personal_org_id(v_user), which is NULL for a
  -- caller with no personal organization and a silent guess for everyone else.
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Choose which organization your league membership belongs to (p_organization_id is required).'
      USING ERRCODE = '22023';
  END IF;
  IF NOT iam.has_org_access_for(v_user, p_organization_id) THEN
    RAISE EXCEPTION 'You are not a member of the organization you asked to join the league in.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('education-league-' || v_week::text, 0));

  SELECT count(*)::integer
    INTO v_activity
    FROM education.study_attempt a
   WHERE a.created_by = v_user
     AND a.deleted_at IS NULL
     AND a.is_manually_edited = false
     AND a.result IN ('incorrect', 'partial', 'correct')
     AND coalesce(a.reviewed_at, a.created_at) >= now() - interval '28 days';

  v_band := CASE
    WHEN v_activity < 20 THEN 'starter'
    WHEN v_activity < 100 THEN 'steady'
    ELSE 'active'
  END;

  IF p_opted_in THEN
    SELECT lm.cohort_key
      INTO v_cohort
      FROM education.league_membership lm
     WHERE lm.week_start = v_week
       AND lm.opted_in = true
       AND lm.deleted_at IS NULL
       AND lm.cohort_key LIKE v_band || '-%'
     GROUP BY lm.cohort_key
    HAVING count(*) < 30
     ORDER BY count(*) DESC, lm.cohort_key
     LIMIT 1;

    v_cohort := coalesce(
      v_cohort,
      v_band || '-' || substr(md5(v_user::text || clock_timestamp()::text), 1, 8)
    );
  END IF;

  SELECT *
    INTO v_row
    FROM education.league_membership lm
   WHERE lm.created_by = v_user
     AND lm.week_start = v_week
     AND lm.deleted_at IS NULL
   FOR UPDATE;

  IF FOUND THEN
    UPDATE education.league_membership
       SET opted_in = p_opted_in,
           display_name = left(nullif(btrim(p_display_name), ''), 80),
           cohort_key = CASE WHEN p_opted_in THEN coalesce(v_row.cohort_key, v_cohort) ELSE v_row.cohort_key END,
           updated_at = now()
     WHERE id = v_row.id
     RETURNING * INTO v_row;
  ELSE
    INSERT INTO education.league_membership (
      organization_id, created_by, week_start, display_name, opted_in, cohort_key
    ) VALUES (
      p_organization_id, v_user, v_week,
      left(nullif(btrim(p_display_name), ''), 80), p_opted_in,
      CASE WHEN p_opted_in THEN v_cohort ELSE NULL END
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$function$;

UPDATE platform.client_callable_door
   SET identity_args = 'p_opted_in boolean, p_display_name text, p_organization_id uuid',
       identity_argtypes = '{16,25,2950}'::oid[],
       declared_by = 'league_set_opt_in_names_its_organization',
       reason = reason || ' 2026-09-23: gained p_organization_id — required (NULL is refused in a sentence); an organization the caller does not belong to is refused 42501. It no longer reads iam.personal_org_id.'
 WHERE schema_name = 'public' AND function_name = 'league_set_opt_in' AND identity_args = 'p_opted_in boolean, p_display_name text';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM platform.client_callable_door WHERE schema_name = 'public' AND function_name = 'league_set_opt_in' AND identity_args = 'p_opted_in boolean, p_display_name text, p_organization_id uuid') THEN RAISE EXCEPTION 'door for league_set_opt_in was not moved'; END IF; END $$;
GRANT EXECUTE ON FUNCTION public.league_set_opt_in(boolean, text, uuid) TO authenticated, service_role;

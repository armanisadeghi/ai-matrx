-- edu_library_notes_education_only — THE EDUCATION LIBRARY LISTS ONLY NOTES MARKED FOR EDUCATION.
--
-- Regression (Arman, 2026-09-25): "all notes automatically show up [in education] instead of
-- respecting a tag". The note arm of this function unioned EVERY live workbench.notes row
-- (since education_library_scoped_list.sql, 2026-08-21), so a person's drafts, chat saves and quick
-- notes filled the Education Library. The Notes app owns every note; Education owns the notes
-- marked for it — the Study Notes folder, which both writers stamp (the frontend converter's
-- notesGenerator and aidream graph_actions/education/persist.py) and which a person sets from the
-- Notes app with "Move to Folder".
--
-- ONE CHANGE: the note arm gains `AND n.folder_name = 'Study Notes'`. The constant is the frontend's
-- EDUCATION_NOTES_FOLDER (features/education/notes/education-notes.ts), the one Education-note
-- selector; its guard (features/education/notes/__tests__/education-notes.test.ts) reads this file
-- and fails if the note arm loses the predicate. Signature, return shape, scopes and every other
-- arm are byte-identical to the live body this replaces. edu_library_list_scoped,
-- edu_library_scope_counts and edu_library_facets all read through this function, so the list,
-- the tab counts and the facets agree.
--
-- based-on: public.edu_library_scope_rows(text) fd3fe1cae89c0153adc6420d93e1f92d0a99e8ac0bbf274762ac055fb9c515f5

CREATE OR REPLACE FUNCTION public.edu_library_scope_rows(p_scope text DEFAULT 'mine'::text)
 RETURNS TABLE(id uuid, kind text, subtype text, title text, description text, status text, visibility text, created_by uuid, organization_id uuid, organization_name text, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  -- THE NARROWEST OF THE FOUR TOKENS THIS LIST UNIONS. `min` over ('mine','orgs') is 'mine', which
  -- is the rule spelled as arithmetic: one token that opens on itself keeps the whole library on
  -- itself. `platform.entity_default_list_scope` is the one mapper from the registry word
  -- `organization` to this vocabulary's `orgs` (§3.3 item 4 — we do not rename a live parameter
  -- vocabulary to make a new column prettier).
  v_default text := (
    SELECT min(platform.entity_default_list_scope(t))
      FROM unnest(ARRAY['fc_set','assessment','study_media','note']) AS t);
  v_scope text := lower(coalesce(p_scope, v_default));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'edu_library_scope_rows: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_scope NOT IN ('mine', 'orgs', 'shared', 'public') THEN
    RAISE EXCEPTION 'edu_library_scope_rows: unknown scope %', v_scope USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH unified AS (
    SELECT
      s.id AS u_id,
      'fc_set'::text AS u_kind,
      'flashcards'::text AS u_subtype,
      coalesce(nullif(s.name, ''), 'Untitled flashcard deck') AS u_title,
      coalesce(s.description, '') AS u_description,
      'ready'::text AS u_status,
      s.visibility::text AS u_visibility,
      s.created_by AS u_created_by,
      s.organization_id AS u_organization_id,
      s.created_at AS u_created_at,
      s.updated_at AS u_updated_at
    FROM education.fc_set s
    WHERE s.deleted_at IS NULL

    UNION ALL

    SELECT
      a.id,
      'assessment'::text,
      a.assessment_kind,
      coalesce(nullif(a.title, ''), 'Untitled assessment'),
      coalesce(a.description, ''),
      coalesce(nullif(a.status, ''), 'draft'),
      a.visibility::text,
      a.created_by,
      a.organization_id,
      a.created_at,
      a.updated_at
    FROM education.assessment a
    WHERE a.deleted_at IS NULL

    UNION ALL

    SELECT
      m.id,
      'study_media'::text,
      m.media_kind,
      coalesce(nullif(m.title, ''), 'Untitled study media'),
      coalesce(m.description, ''),
      coalesce(nullif(m.status, ''), 'draft'),
      m.visibility::text,
      m.created_by,
      m.organization_id,
      m.created_at,
      m.updated_at
    FROM education.study_media m
    WHERE m.deleted_at IS NULL

    UNION ALL

    SELECT
      n.id,
      'note'::text,
      'notes'::text,
      coalesce(nullif(n.label, ''), 'Untitled note'),
      coalesce(nullif(n.folder_name, ''), 'Study note'),
      'ready'::text,
      n.visibility::text,
      n.created_by,
      n.organization_id,
      n.created_at,
      n.updated_at
    FROM workbench.notes n
    WHERE n.deleted_at IS NULL
      -- ONLY notes marked for Education (the Study Notes folder). A plain note is the Notes app's.
      AND n.folder_name = 'Study Notes'
  ),
  scoped AS (
    SELECT
      u.*,
      true AS s_is_owner,
      'owner'::text AS s_access_level
    FROM unified u
    WHERE v_scope = 'mine'
      AND u.u_created_by = v_uid

    UNION ALL

    -- ORGS — NO PREDICATE. This arm is the whole point of DD-137c: the organization's library is
    -- whatever RLS already lets this person read, the viewer's own rows included. It carries no
    -- membership test (RLS decides membership), no visibility test (RLS decides visibility), and no
    -- `created_by IS DISTINCT FROM` (excluding your own work from "everyone's" is the bug).
    SELECT
      u.*,
      (u.u_created_by = v_uid),
      CASE WHEN u.u_created_by = v_uid THEN 'owner' ELSE 'org' END::text
    FROM unified u
    WHERE v_scope = 'orgs'
      -- DD-137c7: the organization tab shows the organizations this person belongs to,
      -- personal included. No visibility test, no owner test — RLS decided both already.
      AND u.u_organization_id IN (SELECT iam.my_orgs())

    UNION ALL

    SELECT
      u.*,
      false,
      'shared'::text
    FROM unified u
    WHERE v_scope = 'shared'
      AND u.u_created_by IS DISTINCT FROM v_uid
      AND EXISTS (
        SELECT 1
        FROM iam.permissions p
        WHERE p.resource_type = u.u_kind
          AND p.resource_id = u.u_id
          AND p.status = 'active'
          AND (p.expires_at IS NULL OR p.expires_at > now())
          AND (
            p.granted_to_user_id = v_uid
            OR p.granted_to_organization_id IN (
              SELECT om.organization_id
              FROM iam.organization_member om
              WHERE om.user_id = v_uid
            )
          )
      )

    UNION ALL

    SELECT
      u.*,
      false,
      'public'::text
    FROM unified u
    WHERE v_scope = 'public'
      AND u.u_created_by IS DISTINCT FROM v_uid
      AND u.u_visibility = 'public'
  )
  SELECT
    s.u_id,
    s.u_kind,
    s.u_subtype,
    s.u_title,
    s.u_description,
    s.u_status,
    s.u_visibility,
    s.u_created_by,
    s.u_organization_id,
    o.name,
    s.u_created_at,
    s.u_updated_at,
    s.s_is_owner,
    s.s_access_level,
    au.email::text
  FROM scoped s
  LEFT JOIN iam.organizations o ON o.id = s.u_organization_id
  LEFT JOIN platform.visible_user_identity au ON au.id = s.u_created_by;
END;
$function$;

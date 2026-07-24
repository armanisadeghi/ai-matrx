-- Shared Knowledge issuance/read gates: super-admin -> ANY admin (2026-07-23, Arman directive)
--
-- Arman: "system admins and super admins are no different for this ... agents keep making
-- everything super admin gated, which is a problem because then we have to make random admins
-- into super admins." So every Matrx-internal shared-knowledge issuance + admin-read gate now
-- accepts ANY admin (any row in admin.admins), not only level='super_admin'.
--
-- Scope of this change:
--   1. Rename the choke-point helper _library_assert_super_admin -> _library_assert_admin
--      (body now any-admin) and repoint its 5 callers. The old name is dropped (no lying shim).
--   2. Lower the 3 admin-read gates (grant list, members-rich, the access-explorer oracle guard)
--      from is_super_admin() to is_admin(). Service-role bypass + owner/grant branches preserved.
--
-- Unchanged: the actor-resolution safety shape (COALESCE(auth.uid(), p_actor) so session identity
-- wins; anon EXECUTE stays revoked — D-I). is_admin()/is_super_admin() both key on the SESSION
-- user (auth.uid()), never a caller-supplied uuid.
--
-- NOTE (write-escalation, called out deliberately): industry_curator_grant writes
-- iam.industry_curators, which can_curate_library_document reads as WRITE access on library docs.
-- Lowering it to any-admin means any admin tier (incl. 'developer') can grant library curation.
-- This is per Arman's "admins == super-admins for this" directive; the audit log records the actor.

-- ---------------------------------------------------------------------------
-- 1. Any-admin choke point
-- ---------------------------------------------------------------------------
create or replace function public._library_assert_admin(p_actor uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM admin.admins a WHERE a.user_id = p_actor
    ) THEN
        RAISE EXCEPTION 'not authorized: admin required';
    END IF;
END; $function$;

-- Repoint the 5 issuance callers (bodies verbatim except the assert call) --------------------

CREATE OR REPLACE FUNCTION public.industry_upsert(p_slug text, p_name text, p_facet text DEFAULT 'domain'::text, p_parent_id uuid DEFAULT NULL::uuid, p_default_template_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_sort_order integer DEFAULT 0, p_actor uuid DEFAULT NULL::uuid)
 RETURNS iam.industries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid; v_row iam.industries;
BEGIN
    v_actor := COALESCE(auth.uid(), p_actor);
    PERFORM public._library_assert_admin(v_actor);
    INSERT INTO iam.industries(slug, name, facet, parent_id, default_template_id, description, sort_order)
    VALUES (p_slug, p_name, p_facet, p_parent_id, p_default_template_id, p_description, p_sort_order)
    ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name, facet = EXCLUDED.facet, parent_id = EXCLUDED.parent_id,
        default_template_id = EXCLUDED.default_template_id, description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order
    RETURNING * INTO v_row;
    INSERT INTO public.library_audit_log(actor_user_id, action, industry_id, detail)
    VALUES (v_actor, 'industry_upsert', v_row.id, jsonb_build_object('slug', p_slug, 'facet', p_facet));
    RETURN v_row;
END; $function$;

CREATE OR REPLACE FUNCTION public.industry_curator_grant(p_user uuid, p_industry uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS iam.industry_curators
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid; v_row iam.industry_curators;
BEGIN
    v_actor := COALESCE(auth.uid(), p_actor);
    PERFORM public._library_assert_admin(v_actor);
    INSERT INTO iam.industry_curators(user_id, industry_id, granted_by)
    VALUES (p_user, p_industry, v_actor)
    ON CONFLICT (user_id, industry_id) DO UPDATE SET granted_by = EXCLUDED.granted_by
    RETURNING * INTO v_row;
    INSERT INTO public.library_audit_log(actor_user_id, action, industry_id, detail)
    VALUES (v_actor, 'industry_curator_grant', p_industry, jsonb_build_object('user', p_user));
    RETURN v_row;
END; $function$;

CREATE OR REPLACE FUNCTION public.industry_curator_revoke(p_user uuid, p_industry uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid;
BEGIN
    v_actor := COALESCE(auth.uid(), p_actor);
    PERFORM public._library_assert_admin(v_actor);
    DELETE FROM iam.industry_curators WHERE user_id = p_user AND industry_id = p_industry;
    INSERT INTO public.library_audit_log(actor_user_id, action, industry_id, detail)
    VALUES (v_actor, 'industry_curator_revoke', p_industry, jsonb_build_object('user', p_user));
END; $function$;

CREATE OR REPLACE FUNCTION rag.library_grant_publish(p_store_id uuid, p_audience text, p_industry_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS rag.data_store_grants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'rag'
AS $function$
DECLARE v_actor uuid; v_lib uuid; v_row rag.data_store_grants;
BEGIN
    v_actor := COALESCE(auth.uid(), p_actor);
    PERFORM public._library_assert_admin(v_actor);
    v_lib := public.system_org_id('library');
    IF v_lib IS NULL THEN
        RAISE EXCEPTION 'Matrx Library org not configured (system_orgs.key=''library'')';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM rag.data_stores s WHERE s.id = p_store_id AND s.organization_id = v_lib) THEN
        RAISE EXCEPTION 'store % is not a Matrx Library store', p_store_id;
    END IF;
    INSERT INTO rag.data_store_grants(data_store_id, audience, industry_id, organization_id, granted_by)
    VALUES (p_store_id, p_audience, p_industry_id, p_organization_id, v_actor)
    ON CONFLICT DO NOTHING;
    SELECT * INTO v_row FROM rag.data_store_grants
     WHERE data_store_id = p_store_id AND audience = p_audience
       AND industry_id     IS NOT DISTINCT FROM p_industry_id
       AND organization_id IS NOT DISTINCT FROM p_organization_id
     LIMIT 1;
    INSERT INTO public.library_audit_log(actor_user_id, action, data_store_id, industry_id, organization_id, detail)
    VALUES (v_actor, 'grant_publish', p_store_id, p_industry_id, p_organization_id, jsonb_build_object('audience', p_audience));
    RETURN v_row;
END; $function$;

CREATE OR REPLACE FUNCTION rag.library_grant_revoke(p_grant_id uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'rag'
AS $function$
DECLARE v_actor uuid; v_row rag.data_store_grants;
BEGIN
    v_actor := COALESCE(auth.uid(), p_actor);
    PERFORM public._library_assert_admin(v_actor);
    SELECT * INTO v_row FROM rag.data_store_grants WHERE id = p_grant_id;
    IF v_row.id IS NULL THEN RETURN; END IF;
    DELETE FROM rag.data_store_grants WHERE id = p_grant_id;
    INSERT INTO public.library_audit_log(actor_user_id, action, data_store_id, industry_id, organization_id, detail)
    VALUES (v_actor, 'grant_revoke', v_row.data_store_id, v_row.industry_id, v_row.organization_id, jsonb_build_object('audience', v_row.audience));
END; $function$;

-- Now safe to drop the old super-admin-only helper (no remaining callers)
drop function if exists public._library_assert_super_admin(uuid);

-- ---------------------------------------------------------------------------
-- 2. Admin-read gates: is_super_admin() -> is_admin()
-- ---------------------------------------------------------------------------
create or replace function rag.fn_list_data_store_grants(p_store_id uuid)
returns table(id uuid, audience text, industry_id uuid, industry_name text, industry_slug text, organization_id uuid, organization_name text)
language plpgsql stable security definer
set search_path to 'public', 'rag', 'iam'
as $function$
declare v_user uuid := auth.uid();
begin
  if not (
    auth.role() = 'service_role'
    or public.is_admin()
    or exists (select 1 from rag.data_stores s where s.id = p_store_id and s.created_by = v_user)
  ) then
    raise exception 'insufficient permission on data_store';
  end if;
  return query
  select g.id, g.audience, g.industry_id, i.name, i.slug, g.organization_id, o.name
  from rag.data_store_grants g
  left join iam.industries i on i.id = g.industry_id
  left join iam.organizations o on o.id = g.organization_id
  where g.data_store_id = p_store_id
  order by g.audience, g.created_at;
end;
$function$;

-- members-rich: swap only the admin branch; body otherwise identical to the grant-reader version
create or replace function rag.fn_data_store_members_rich(p_store_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'rag', 'iam', 'docproc', 'files'
as $function$
DECLARE
  v_user uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM rag.data_stores s
       WHERE s.id = p_store_id
         AND (s.created_by = v_user
           OR (s.organization_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM iam.organization_member om
                            WHERE om.organization_id = s.organization_id AND om.user_id = v_user)))
    )
    OR public.user_can_read_data_store_via_grant(v_user, p_store_id)
  ) THEN
    RAISE EXCEPTION 'data store not found';
  END IF;

  WITH members AS (
    SELECT source_kind, source_id, added_at, notes
    FROM rag.data_store_members
    WHERE data_store_id = p_store_id AND deleted_at IS NULL
  ),
  latest_pd AS (
    SELECT DISTINCT ON (pd.source_id) pd.source_id, pd.id AS pd_id
    FROM docproc.processed_documents pd
    WHERE pd.source_kind = 'cld_file'
      AND pd.source_id IN (SELECT source_id FROM members WHERE source_kind = 'cld_file')
    ORDER BY pd.source_id, pd.created_at DESC
  ),
  pd_counts AS (
    SELECT pd_id, pages, chunks, embeddings_oai FROM (
      SELECT DISTINCT pd_id FROM (
        SELECT pd_id FROM latest_pd
        UNION
        SELECT source_id::uuid FROM members WHERE source_kind = 'processed_document'
      ) x
    ) ids
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS pages FROM docproc.processed_document_pages pp WHERE pp.processed_document_id = ids.pd_id
    ) p ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS chunks FROM rag.kg_chunks kc WHERE kc.processed_document_id = ids.pd_id
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS embeddings_oai FROM rag.kg_chunks kc
        JOIN rag.embeddings_voyage_4_large_1024 e ON e.chunk_id = kc.id
       WHERE kc.processed_document_id = ids.pd_id
    ) e ON true
  ),
  cld_out AS (
    SELECT
      m.source_kind, m.source_id, m.added_at, m.notes,
      f.file_name AS name, f.mime_type, f.size_bytes,
      lp.pd_id AS processed_document_id,
      COALESCE(pc.pages, 0) AS pages,
      COALESCE(pc.chunks, 0) AS chunks,
      COALESCE(pc.embeddings_oai, 0) AS embeddings_oai
    FROM members m
    LEFT JOIN files.files f ON f.id::text = m.source_id
    LEFT JOIN latest_pd lp ON lp.source_id = m.source_id
    LEFT JOIN pd_counts pc ON pc.pd_id = lp.pd_id
    WHERE m.source_kind = 'cld_file'
  ),
  pd_out AS (
    SELECT
      m.source_kind, m.source_id, m.added_at, m.notes,
      d.name, d.mime_type, NULL::bigint AS size_bytes,
      d.id AS processed_document_id,
      COALESCE(pc.pages, 0) AS pages,
      COALESCE(pc.chunks, 0) AS chunks,
      COALESCE(pc.embeddings_oai, 0) AS embeddings_oai
    FROM members m
    JOIN docproc.processed_documents d ON d.id::text = m.source_id
    LEFT JOIN pd_counts pc ON pc.pd_id = d.id
    WHERE m.source_kind = 'processed_document'
  ),
  other_out AS (
    SELECT
      m.source_kind, m.source_id, m.added_at, m.notes,
      m.source_id AS name, NULL::text AS mime_type, NULL::bigint AS size_bytes,
      NULL::uuid AS processed_document_id, 0 AS pages, 0 AS chunks, 0 AS embeddings_oai
    FROM members m
    WHERE m.source_kind NOT IN ('cld_file', 'processed_document')
  ),
  everything AS (
    SELECT * FROM cld_out UNION ALL SELECT * FROM pd_out UNION ALL SELECT * FROM other_out
  )
  SELECT jsonb_build_object(
    'data_store_id', p_store_id,
    'members', COALESCE(jsonb_agg(jsonb_build_object(
      'source_kind', e.source_kind,
      'source_id', e.source_id,
      'added_at', e.added_at,
      'notes', e.notes,
      'name', COALESCE(e.name, e.source_id),
      'mime_type', e.mime_type,
      'size_bytes', e.size_bytes,
      'processed_document_id', e.processed_document_id,
      'pages', e.pages,
      'chunks', e.chunks,
      'embeddings_oai', e.embeddings_oai,
      'status', CASE
        WHEN e.source_kind = 'cld_file' AND e.processed_document_id IS NULL THEN 'no_processing'
        WHEN e.source_kind NOT IN ('cld_file', 'processed_document') THEN 'unknown'
        WHEN e.pages = 0 THEN 'pending'
        WHEN e.chunks = 0 THEN 'extracted'
        WHEN e.embeddings_oai < e.chunks THEN 'embedding'
        ELSE 'ready'
      END
    )), '[]'::jsonb)
  ) INTO v_result
  FROM everything e;

  RETURN v_result;
END;
$function$;

-- access-explorer oracle guard: any admin may ask about other users (self/service already allowed)
create or replace function public.user_can_read_data_store_via_grant(p_user uuid, p_store uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'rag', 'iam'
as $function$
  select p_user is not null
     and p_store is not null
     and (
       auth.uid() is null
       or auth.uid() = p_user
       or public.is_admin()
     )
     and exists (
       select 1
       from rag.data_store_grants g
       where g.data_store_id = p_store
         and (
           g.audience = 'global'
           or (g.audience = 'organization'
               and g.organization_id in (
                 select om.organization_id from iam.organization_member om where om.user_id = p_user))
           or (g.audience = 'industry'
               and exists (
                 select 1 from iam.org_industries oi
                 join iam.organization_member om on om.organization_id = oi.organization_id
                 where om.user_id = p_user and oi.industry_id = g.industry_id))
         )
     );
$function$;

notify pgrst, 'reload schema';

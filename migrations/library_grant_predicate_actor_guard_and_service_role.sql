-- Adversarial-review fixes (2026-07-23, Refuter A findings on the shared-knowledge pass)
--
-- 1. CROSS-USER ORACLE (pre-existing, D88 class): public.user_can_read_data_store_via_grant
--    is SECURITY DEFINER, EXECUTE-granted to authenticated, and took an arbitrary p_user —
--    any authenticated caller could probe whether ANY other user (by uuid) reaches ANY store.
--    Fix: internal actor guard. Allowed callers of an arbitrary p_user: service contexts
--    (auth.uid() is null) and super-admins. Everyone else gets a truthful answer only about
--    THEMSELVES; asking about someone else returns false (fail closed — must not RAISE,
--    because this predicate runs inside RLS policies and SECURITY DEFINER wrappers).
--    Every legitimate caller today passes auth.uid() (RLS policies, provenance RPCs, catalog),
--    so behavior is unchanged for them — verified post-apply.
--
-- 2. SERVICE-ROLE REGRESSION (introduced today): rag.fn_list_data_store_grants and
--    rag.fn_data_store_members_rich lacked the auth.role()='service_role' bypass their sibling
--    fn_list_library_catalog has, so a bare service-key backend call hard-failed.
--    Fix: explicit service-role bypass in both gates (service role bypasses RLS everywhere;
--    this is consistency, not new exposure).

-- ---------------------------------------------------------------------------
-- 1. Actor guard on the frozen grant predicate (signature unchanged)
-- ---------------------------------------------------------------------------
create or replace function public.user_can_read_data_store_via_grant(p_user uuid, p_store uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'rag', 'iam'
as $function$
  select p_user is not null
     and p_store is not null
     -- actor guard: only service contexts and super-admins may ask about OTHER users
     and (
       auth.uid() is null            -- service_role / internal execution
       or auth.uid() = p_user        -- asking about yourself
       or public.is_super_admin()    -- admin tooling (access explorer)
     )
     and exists (
       select 1
       from rag.data_store_grants g
       where g.data_store_id = p_store
         and (
           g.audience = 'global'
           or (g.audience = 'organization'
               and g.organization_id in (
                 select om.organization_id
                 from iam.organization_member om
                 where om.user_id = p_user
               ))
           or (g.audience = 'industry'
               and exists (
                 select 1
                 from iam.org_industries oi
                 join iam.organization_member om
                   on om.organization_id = oi.organization_id
                 where om.user_id = p_user
                   and oi.industry_id = g.industry_id
               ))
         )
     );
$function$;

-- ---------------------------------------------------------------------------
-- 2a. Service-role bypass on the grant-list gate (Decision-2 rule otherwise unchanged)
-- ---------------------------------------------------------------------------
create or replace function rag.fn_list_data_store_grants(p_store_id uuid)
returns table(
  id uuid,
  audience text,
  industry_id uuid,
  industry_name text,
  industry_slug text,
  organization_id uuid,
  organization_name text
)
language plpgsql
stable
security definer
set search_path to 'public', 'rag', 'iam'
as $function$
declare
  v_user uuid := auth.uid();
begin
  -- Decision 2 (settled 2026-07-23): super-admin OR store owner. Service role = trusted infra.
  if not (
    auth.role() = 'service_role'
    or public.is_super_admin()
    or exists (
      select 1 from rag.data_stores s
       where s.id = p_store_id
         and s.created_by = v_user
    )
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

-- ---------------------------------------------------------------------------
-- 2b. Service-role bypass on the members-rich gate (grant-reader rule otherwise unchanged)
-- ---------------------------------------------------------------------------
-- Only the gate block changes; body identical to data_store_members_rich_grant_reader.sql.
do $$
declare
  v_def text;
begin
  -- guard: function must exist (it was created earlier today)
  perform 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'rag' and p.proname = 'fn_data_store_members_rich';
  if not found then
    raise exception 'fn_data_store_members_rich missing — apply data_store_members_rich_grant_reader.sql first';
  end if;
end $$;

create or replace function rag.fn_data_store_members_rich(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'rag', 'iam', 'docproc', 'files'
as $function$
DECLARE
  v_user uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_super_admin()
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

notify pgrst, 'reload schema';

-- library_archived_read_curate_symmetry.sql  (P4 / D-D)
--
-- Asymmetry: can_read_processed_document required `archived_at IS NULL` for
-- EVERYONE (owner and curators included), while can_curate_library_document
-- ignored archived entirely. Result: an archived doc reported
-- can_curate = true / can_read = false for the very people who must open it
-- to unarchive it — and vanished even for its own owner.
--
-- THE CONSISTENT RULE (chosen, justified):
--   * Grant readers and org members LOSE read on an archived doc — archiving
--     is exactly the curator act of pulling a doc from its audience.
--   * The OWNER and CURATORS KEEP read on an archived doc — they are the ones
--     who archive/unarchive, and a doc you can curate but cannot see is a
--     contradiction. can_curate_library_document stays archived-blind.
--
-- Verified against live data before applying: 2 of 157 live processed
-- documents are archived today; the only behavior change is owner/curator
-- regaining read on those 2 (grant readers/org members stay denied on them,
-- and nothing changes for the 155 non-archived docs).
--
-- Idempotent (CREATE OR REPLACE, signature unchanged).

CREATE OR REPLACE FUNCTION public.can_read_processed_document(p_doc uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from docproc.processed_documents d
    where d.id = p_doc
      and d.deleted_at is null
      and (
        -- Owner and curators keep read on archived docs (they unarchive them).
        d.owner_id = p_user
        or public.can_curate_library_document(d.id, p_user)
        -- Everyone else (org members, grant audiences, kernel viewers) loses
        -- read the moment a doc is archived — symmetric with curate (D-D).
        or (d.archived_at is null and (
          (d.organization_id is not null and exists (
                select 1 from iam.organization_member om
                where om.organization_id = d.organization_id and om.user_id = p_user))
          or exists (
                select 1 from rag.data_store_members dm
                join rag.data_store_grants g on g.data_store_id = dm.data_store_id
                where dm.source_kind = d.source_kind and dm.source_id = d.source_id
                  and dm.deleted_at is null
                  and (g.audience = 'global'
                    or (g.audience = 'organization' and g.organization_id in (
                          select om.organization_id from iam.organization_member om
                          where om.user_id = p_user))
                    or (g.audience = 'industry' and exists (
                          select 1 from iam.org_industries oi
                          join iam.organization_member om
                            on om.organization_id = oi.organization_id
                          where om.user_id = p_user and oi.industry_id = g.industry_id))))
          or iam.has_access_for(p_user, 'processed_document', p_doc, 'viewer')
        ))
      )
  );
$function$;

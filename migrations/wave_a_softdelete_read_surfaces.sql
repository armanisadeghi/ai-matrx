-- Wave A soft-delete — Phase 2: close the DB read surfaces.
-- Spec: docs/handoffs/wave-a-softdelete-spec.md (Phase 2.2 / 2.3, per V2).
--
-- 1. Every rag.kg_chunks SELECT policy additionally requires deleted_at IS NULL
--    (deleted_at = trash marker; valid_to = bitemporal supersession — both gate).
-- 2. docproc.processed_documents non-owner SELECT paths hide trashed docs.
--    processed_documents_owner_all is DELIBERATELY untouched (V2): gating the
--    cmd=ALL policy would 42501 the soft-delete UPDATE itself, block restore
--    and purge, and kill the owner Trash view. Owner-sees-own-trash IS the
--    include_deleted path (Decision 5).
-- 3. public.can_read_processed_document gains d.deleted_at/d.archived_at checks
--    (single choke point: closes curator_select + library_grant_select RLS,
--    context_sources hop-1, resolver describe/materialize, grant read paths).
--    can_curate_library_document gains pd.deleted_at only — archived docs stay
--    curatable (replace/repair flows operate on archived rows).
-- 4. can_read_processed_document_any = the ungated variant, reserved for the
--    trash/restore surface only.
-- Idempotent: ALTER POLICY sets absolute quals; functions CREATE OR REPLACE.

alter policy kg_chunks_owner_select on rag.kg_chunks
  using ((owner_id = auth.uid()) and valid_to is null and deleted_at is null);

alter policy kg_chunks_org_member_select on rag.kg_chunks
  using ((organization_id is not null)
         and is_member_of_organization(organization_id)
         and valid_to is null and deleted_at is null);

alter policy kg_chunks_cld_share_select on rag.kg_chunks
  using (valid_to is null and deleted_at is null
         and source_kind = 'cld_file'
         and iam.has_access('file', (source_id)::uuid, 'viewer'::permission_level));

alter policy kg_chunks_note_share_select on rag.kg_chunks
  using (valid_to is null and deleted_at is null
         and source_kind = 'note'
         and rag_user_can_see_note((source_id)::uuid));

alter policy kg_chunks_global_library_select on rag.kg_chunks
  using (valid_to is null and deleted_at is null
         and source_kind = 'library_doc'
         and organization_id is null
         and auth.role() = 'authenticated');

alter policy kg_chunks_library_grant_select on rag.kg_chunks
  using (valid_to is null and deleted_at is null
         and auth.role() = 'authenticated'
         and rag_source_has_library_grant(source_kind, source_id, null::uuid));

alter policy processed_documents_org_member_select on docproc.processed_documents
  using (organization_id is not null
         and is_member_of_organization(organization_id)
         and deleted_at is null);

create or replace function public.can_curate_library_document(p_doc uuid, p_user uuid)
returns boolean
language sql
stable security definer
set search_path to 'public', 'rag'
as $function$
  select public.is_super_admin_user(p_user)
      or exists (
          select 1
          from docproc.processed_documents pd
          join rag.data_store_members dm
            on dm.deleted_at is null
           and ( (dm.source_kind = pd.source_kind and dm.source_id = pd.source_id::text)
              or (dm.source_kind = 'processed_document' and dm.source_id = pd.id::text) )
          join rag.data_store_grants g
            on g.data_store_id = dm.data_store_id and g.audience = 'industry'
          join iam.industry_curators ic
            on ic.industry_id = g.industry_id and ic.user_id = p_user
          where pd.id = p_doc
            and pd.deleted_at is null
      );
$function$;

create or replace function public.can_read_processed_document(p_doc uuid, p_user uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from docproc.processed_documents d
    where d.id = p_doc
      and d.deleted_at is null
      and d.archived_at is null
      and (
        d.owner_id = p_user
        or (d.organization_id is not null and exists (
              select 1 from iam.organization_member om
              where om.organization_id = d.organization_id and om.user_id = p_user))
        or public.can_curate_library_document(d.id, p_user)
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
      )
  );
$function$;

-- Ungated variant for the trash/restore surface ONLY — identical access rules,
-- no lifecycle filter. Never use this on a normal read path.
create or replace function public.can_read_processed_document_any(p_doc uuid, p_user uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from docproc.processed_documents d
    where d.id = p_doc
      and (
        d.owner_id = p_user
        or (d.organization_id is not null and exists (
              select 1 from iam.organization_member om
              where om.organization_id = d.organization_id and om.user_id = p_user))
        or public.can_curate_library_document(d.id, p_user)
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
      )
  );
$function$;

grant execute on function public.can_read_processed_document_any(uuid, uuid) to authenticated, service_role;

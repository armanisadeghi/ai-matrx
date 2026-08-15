-- Make the canonical share-link organization edge real, then repair historic
-- guest-transfer rows that predate that constraint.
--
-- guest_oauth_personal_org_merge.sql discovers organization-scoped data from
-- physical FKs. platform.share_links.organization_id was the one affected
-- organization column without one, so two links retained the restored guest
-- workspace id even after their creator moved to the permanent user.

with guest_personal_org_mappings as (
  select distinct
    audit.anon_user_id,
    audit.new_user_id,
    source_org.id as source_org_id,
    target_org.id as target_org_id
  from public.guest_conversion_audit audit
  join iam.organizations source_org
    on source_org.created_by = audit.anon_user_id
   and source_org.is_personal is true
  join iam.organizations target_org
    on target_org.created_by = audit.new_user_id
   and target_org.is_personal is true
)
update platform.share_links link
set organization_id = mapping.target_org_id
from guest_personal_org_mappings mapping
where link.organization_id = mapping.source_org_id
  and link.created_by = mapping.new_user_id;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'platform.share_links'::regclass
      and conname = 'share_links_organization_id_fkey'
  ) then
    alter table platform.share_links
      add constraint share_links_organization_id_fkey
      foreign key (organization_id)
      references iam.organizations(id);
  end if;
end;
$$;

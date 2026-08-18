-- Applied live as workbench_snapshot_permission_tokens on 2026-08-18.
-- Snapshot access follows the canonical parent entity token. Physical table
-- names are not permission identities and raise P0001 inside RLS predicates.

drop policy if exists udt_document_snapshots_select
  on workbench.udt_document_snapshots;

create policy udt_document_snapshots_select
  on workbench.udt_document_snapshots
  for select
  using (
    exists (
      select 1
      from workbench.udt_documents d
      where d.id = udt_document_snapshots.document_id
        and (
          d.created_by = (select auth.uid())
          or d.visibility = 'public'::platform.visibility
          or iam.has_access('udt_document', d.id, 'viewer'::permission_level)
        )
    )
  );

drop policy if exists udt_document_snapshots_insert
  on workbench.udt_document_snapshots;

create policy udt_document_snapshots_insert
  on workbench.udt_document_snapshots
  for insert
  with check (
    exists (
      select 1
      from workbench.udt_documents d
      where d.id = udt_document_snapshots.document_id
        and (
          d.created_by = (select auth.uid())
          or iam.has_access('udt_document', d.id, 'editor'::permission_level)
        )
    )
  );

drop policy if exists udt_workbook_snapshots_select
  on workbench.udt_workbook_snapshots;

create policy udt_workbook_snapshots_select
  on workbench.udt_workbook_snapshots
  for select
  using (
    exists (
      select 1
      from workbench.udt_workbooks w
      where w.id = udt_workbook_snapshots.workbook_id
        and (
          w.created_by = (select auth.uid())
          or w.visibility = 'public'::platform.visibility
          or iam.has_access('workbook', w.id, 'viewer'::permission_level)
        )
    )
  );

drop policy if exists udt_workbook_snapshots_insert
  on workbench.udt_workbook_snapshots;

create policy udt_workbook_snapshots_insert
  on workbench.udt_workbook_snapshots
  for insert
  with check (
    exists (
      select 1
      from workbench.udt_workbooks w
      where w.id = udt_workbook_snapshots.workbook_id
        and (
          w.created_by = (select auth.uid())
          or iam.has_access('workbook', w.id, 'editor'::permission_level)
        )
    )
  );

do $guard$
begin
  if exists (
    select 1
    from pg_policies
    where coalesce(qual, '') ~ $$has_permission\('udt_$$
       or coalesce(with_check, '') ~ $$has_permission\('udt_$$
  ) then
    raise exception 'RLS policy still uses a physical udt_* table name as a permission key';
  end if;
end
$guard$;

-- Component policies that mention the parent's created_by. apply_rls keeps policies it did not author, so they are superseded first. rag.data_store_members has no id column, so it cannot be regenerated and gets a parent-editor policy instead.
set local lock_timeout = '120s';

-- Component policies on these four tables still decide access by the parent's
-- created_by. A component inherits its parent's access through iam.apply_rls;
-- a created_by clause re-opens the parent-editor stamp (db-rules §6d-1).
-- The composition edge is what apply_rls reads. It is the parent the live
-- policy already joined, not a new relationship.

insert into platform.entity_relationships (child_type, parent_type, fk_column, kind, note)
select v.child_type, v.parent_type, v.fk_column, v.kind, v.note
  from (values
    ('analysis_result', 'file', 'file_id', 'composition',
     'An analysis result inherits the access of its file. created_by on the file is provenance, never a second owner of the result.'),
    ('data_store_members', 'data_store', 'data_store_id', 'composition',
     'A data-store membership row inherits the access of its data store.'),
    ('trigger_event', 'workflow_trigger', 'trigger_id', 'composition',
     'A trigger event inherits the access of its workflow trigger.'),
    ('workflow_work_item', 'workflow_run', 'run_id', 'composition',
     'A workflow work item inherits the access of its workflow run.')
  ) as v(child_type, parent_type, fk_column, kind, note)
 where not exists (
   select 1 from platform.entity_relationships e
    where e.child_type = v.child_type
      and e.parent_type = v.parent_type
      and e.fk_column = v.fk_column
 );

-- apply_rls never drops a policy it did not author, so the created_by policies
-- survive a regeneration and the check stays red. Supersede them first; the
-- generator's own std_* policies are the parent's access without created_by.
select iam.supersede_bespoke_policies(
  'files', 'analysis_result',
  array['file_analysis_result_insert', 'file_analysis_result_select'],
  'THE COMPONENT OWNERSHIP LAW (db-rules 6d-1): these policies admitted the parent file''s created_by. The generated component policies admit the parent''s editor instead. 2026-09-21.'
);
select iam.supersede_bespoke_policies(
  'workflow', 'trigger_event',
  array['wf_trigger_event_parent_select'],
  'THE COMPONENT OWNERSHIP LAW (db-rules 6d-1): this policy admitted the parent trigger''s created_by. The generated component policies admit the parent''s editor instead. 2026-09-21.'
);
select iam.supersede_bespoke_policies(
  'workflow', 'work_item',
  array['wf_work_item_parent_select'],
  'THE COMPONENT OWNERSHIP LAW (db-rules 6d-1): this policy admitted the parent run''s created_by. The generated component policies admit the parent''s editor instead. 2026-09-21.'
);
select iam.supersede_bespoke_policies(
  'rag', 'data_store_members',
  array['data_store_members_via_store_all'],
  'THE COMPONENT OWNERSHIP LAW (db-rules 6d-1): this policy admitted the parent data store''s created_by. The replacement admits the parent''s editor. 2026-09-21.'
);

select iam.apply_rls('files', 'analysis_result', 'analysis_result', 'component');
select iam.apply_rls('workflow', 'trigger_event', 'trigger_event', 'component');
select iam.apply_rls('workflow', 'work_item', 'workflow_work_item', 'component');

-- rag.data_store_members has no id column (primary key is data_store_id,
-- source_kind, source_id). iam.apply_rls('component') emits a self-grant arm
-- that names id, so regeneration cannot run on this table. The write door is
-- the parent store's editor, which is what the created_by arm was reaching
-- for, plus the organization-membership arm the live policy already had.
create policy data_store_members_parent_all
  on rag.data_store_members
  for all
  to authenticated
  using (
    (select public.is_platform_admin())
    or iam.has_access('data_store', data_store_id, 'editor'::public.permission_level)
    or exists (
      select 1 from rag.data_stores s
       where s.id = data_store_members.data_store_id
         and s.organization_id is not null
         and public.is_member_of_organization(s.organization_id)
    )
  )
  with check (
    (select public.is_platform_admin())
    or iam.has_access('data_store', data_store_id, 'editor'::public.permission_level)
    or exists (
      select 1 from rag.data_stores s
       where s.id = data_store_members.data_store_id
         and s.organization_id is not null
         and public.is_member_of_organization(s.organization_id)
    )
  );

-- The privileged half. The event-trigger wrapper only collects the schemas
-- pg_event_trigger_dropped_objects() can see; this function, running as its
-- owner, records the debt. A SECURITY DEFINER event trigger does not fire on

do $proof$
declare
  v_bad text;
begin
  select string_agg(format('%s.%s:%s', schemaname, tablename, policyname), ', ')
    into v_bad
    from pg_policies
   where (schemaname, tablename) in (
     ('files', 'analysis_result'),
     ('rag', 'data_store_members'),
     ('workflow', 'trigger_event'),
     ('workflow', 'work_item')
   )
     and (coalesce(qual, '') ilike '%created_by%' or coalesce(with_check, '') ilike '%created_by%');
  if v_bad is not null then
    raise exception 'component policies still reference created_by: %', v_bad;
  end if;
end
$proof$;

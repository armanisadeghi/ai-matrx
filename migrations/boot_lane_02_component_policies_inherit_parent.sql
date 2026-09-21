-- Boot release repair, part 2 of 2.
--
-- The component policies on these four tables already inherit the parent and no
-- longer treat created_by as ownership, so there is nothing left for iam.apply_rls
-- to change. Calling it anyway takes ACCESS EXCLUSIVE, and that lock also needs
-- auth.users because of the created_by foreign key. auth.users is never free, and
-- waiting for it queues every sign-in. This file only reads, and it refuses to
-- ledger if the parent arm is missing or created_by has come back.

do $proof$
declare
  v_bad text;
  v_edges int;
begin
  select count(*) into v_edges
    from platform.entity_relationships
   where (child_type, parent_type, fk_column, kind) in (
     ('analysis_result', 'file', 'file_id', 'composition'),
     ('data_store_members', 'data_store', 'data_store_id', 'composition'),
     ('trigger_event', 'workflow_trigger', 'trigger_id', 'composition'),
     ('workflow_work_item', 'workflow_run', 'run_id', 'composition')
   );
  if v_edges <> 4 then
    raise exception 'composition edges missing: found % of 4', v_edges;
  end if;

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

  select string_agg(t.rel, ', ')
    into v_bad
    from (
      values
        ('files.analysis_result', 'file'),
        ('rag.data_store_members', 'data_store'),
        ('workflow.trigger_event', 'workflow_trigger'),
        ('workflow.work_item', 'workflow_run')
    ) as t(rel, parent)
   where not exists (
     select 1
       from pg_policies p
      where (p.schemaname || '.' || p.tablename) = t.rel
        and (
          coalesce(p.qual, '') || coalesce(p.with_check, '')
        ) ~ ('(accessible_entity_ids|has_access)\(''' || t.parent || '''')
   );
  if v_bad is not null then
    raise exception 'component policies do not inherit their parent: %', v_bad;
  end if;
end
$proof$;

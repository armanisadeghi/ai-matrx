-- files_my_rag_jobs_asks_per_row.sql  (tutor send timeout, 2026-09-29)
--
-- WHY. Every tutor Send (and the exam content pipeline) reads the caller's COMPLETED Knowledge
-- jobs from files.file_rag_jobs to build the grounding inventory. The table's std_select policy
-- answers its file lane with `file_id IN (iam.unnest_uuids(iam.accessible_entity_ids('file',
-- 'viewer', 0, true)))` — a hashed subplan that materialises EVERY file the caller can see before
-- the first row is judged. Measured on the clone (2026-09-29) as admin@admin.com: 56,968 file ids,
-- 814k buffer hits, 10.9 s for a read that returns 129 rows — past the 8 s statement timeout, so the
-- send failed.
--
-- WHAT. One read door that asks the SAME policy question ROW BY ROW over only the caller's own
-- jobs: the file lane becomes iam.has_access('file', file_id, 'viewer') (the per-row kernel the
-- set form mirrors); every other arm — the org_open_gate restrictive gate, the platform-admin
-- lanes, the file_rag_job grant/membership/reachability/assignment/library lane — is copied
-- verbatim from the live policies. Nothing about who can see which row changes: proved on the
-- clone over 25 users (the 8 job owners, test@test.com and 16 random others) x all 381 rows,
-- 0 rows only the policy returned and 0 rows only this predicate returned.
--
-- The caller is auth.uid(); there is no user argument, so the door can never be pointed at
-- another person's jobs. A signed-out caller gets nothing (user_id = NULL matches no row).

create or replace function files.my_rag_jobs(p_status text default null)
returns setof files.file_rag_jobs
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select j.*
    from files.file_rag_jobs j
   where j.user_id = (select auth.uid())
     and (p_status is null or j.status = p_status)
     -- org_open_gate (restrictive), verbatim
     and ((select public.is_platform_admin())
          or j.organization_id is null
          or j.organization_id not in (select iam.archived_org_ids()))
     -- platform_admin_read / platform_admin_all / std_select (permissive), file lane asked per row
     and ((select public.is_platform_admin())
          or (j.file_id is not null
              and iam.has_access('file'::text, j.file_id, 'viewer'::public.permission_level))
          or (j.id in (select p.resource_id
                         from iam.permissions p
                        where p.resource_type = 'file_rag_job'::text
                          and (p.granted_to_user_id = (select auth.uid())
                               or p.granted_to_organization_id in (select iam.my_orgs()))
                          and p.status <> 'rejected'::text
                          and (p.expires_at is null or p.expires_at > now())
                       union
                       select m.container_id
                         from iam.memberships m
                        where m.container_type = 'file_rag_job'::text
                          and m.user_id = (select auth.uid())
                          and m.deleted_at is null
                       union
                       select r.item_id
                         from platform.reachability r
                        where r.item_type = 'file_rag_job'::text
                          and r.max_level >= 'viewer'::public.permission_level
                          and iam.has_access(r.container_type, r.container_id, 'viewer'::public.permission_level)
                       union
                       select a.source_id
                         from platform.associations_live a
                        where a.source_type = 'file_rag_job'::text
                          and a.target_type = 'scope'::text
                          and a.role = 'assignment'::text
                       union
                       select g.entity_id
                         from platform.entity_grants g
                        where g.entity_type = 'file_rag_job'::text)
              and iam.has_access('file_rag_job'::text, j.id, 'viewer'::public.permission_level)))
   order by j.updated_at desc
$function$;

comment on function files.my_rag_jobs(text) is
  'The signed-in caller''s own Knowledge jobs (optionally one status), filtered by exactly the files.file_rag_jobs read policies but with the file lane asked per row (iam.has_access) instead of materialising every visible file. Proved identical to the policy on the clone, 2026-09-29.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, gate_predicate, signed_in_callers, anonymous_callers)
values ('files', 'my_rag_jobs', 'p_status text', array['text'::regtype]::oid[],
  'SIGNED-IN read door: the caller''s own files.file_rag_jobs rows. The caller is resolved inside the body by auth.uid() (no user argument); every row is filtered by the table''s own read policies copied verbatim, with the file lane asked per row through iam.has_access. p_status only narrows the caller''s own rows. Proved row-for-row identical to the policies on the clone (25 users x 381 rows, 0 mismatches).',
  'files_my_rag_jobs_asks_per_row.sql', 'auth.uid()', true, false)
on conflict do nothing;

grant execute on function files.my_rag_jobs(text) to authenticated;

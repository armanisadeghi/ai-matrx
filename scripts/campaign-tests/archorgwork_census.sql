-- LANE ARCHIVED-ORG-WORK — THE CENSUS. Read-only. RED while any work in an ARCHIVED organization is
-- still waiting on somebody: a pending approval, an open assignment (a live record whose Assignee is
-- a person record, not in a finished state), or a signature request still waiting on its signer.
--
-- RUN IT: psql "<dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/archorgwork_census.sql
-- Measured on production 2026-09-25 before the repair: RED — 131 approvals in 29 organizations,
-- 5 assignments in 2, 1 signature request in 1.

\set ON_ERROR_STOP on
begin read only;

select k as waiting_in_archived_organizations, count(*) as items, count(distinct organization_id) as organizations
  from (
    select 'approval' k, r.organization_id
      from custom.record r join iam.organizations g on g.id = r.organization_id and g.archived_at is not null
     where r.data_class = 'work_approval' and r.deleted_at is null and coalesce(r.data ->> 'state', 'pending') = 'pending'
    union all
    select 'assignment', r.organization_id
      from custom.record r join iam.organizations g on g.id = r.organization_id and g.archived_at is not null
      join custom.record pr on pr.organization_id = r.organization_id and pr.id::text = r.data ->> 'assignee'
                           and pr.table_id = custom.person_kernel_id()
      left join custom.record s on s.organization_id = r.organization_id
                               and s.id = custom.work_state_id(r.organization_id, r.table_id, r.data ->> 'status')
                               and s.deleted_at is null
     where r.data_class = 'record' and r.deleted_at is null
       and not coalesce((s.data ->> 'terminal')::boolean, false)
    union all
    select 'sign_request', r.organization_id
      from custom.record r join iam.organizations g on g.id = r.organization_id and g.archived_at is not null
     where r.data_class = 'sign_request' and r.deleted_at is null and custom.sign_request_state(r.data) in ('sent', 'viewed')
  ) w
 group by k order by k;

do $c$
declare v_n integer;
begin
  select count(*) into v_n
    from custom.record r join iam.organizations g on g.id = r.organization_id and g.archived_at is not null
   where r.deleted_at is null
     and ((r.data_class = 'work_approval' and coalesce(r.data ->> 'state', 'pending') = 'pending')
          or (r.data_class = 'sign_request' and custom.sign_request_state(r.data) in ('sent', 'viewed'))
          or (r.data_class = 'record' and exists (
                select 1 from custom.record pr
                 where pr.organization_id = r.organization_id and pr.id::text = r.data ->> 'assignee'
                   and pr.table_id = custom.person_kernel_id())
              and not coalesce((select (s.data ->> 'terminal')::boolean from custom.record s
                                 where s.organization_id = r.organization_id
                                   and s.id = custom.work_state_id(r.organization_id, r.table_id, r.data ->> 'status')
                                   and s.deleted_at is null), false)));
  if v_n > 0 then
    raise exception 'archorgwork census RED: % item(s) in archived organizations are still waiting on somebody', v_n;
  end if;
  raise notice 'archorgwork census GREEN: nothing in an archived organization is waiting on anybody.';
end
$c$;
rollback;

-- LANE SCOPES-READS-ACCESS — MEASUREMENT (not a gate): does the record store's own ladder open, edit and
-- list a scope for exactly the people context.scopes' row security does today?
--
-- WHY. The class doors keep their own rules (memberships, creator, organization admin) and read only the
-- class's facts from the store, so they change nobody's access (scopesaccess_shadow_compare.sql proves
-- it). The web and the server readers (lanes L9 / L10) move instead to the store's DOORS, which decide
-- with the store's ladder: custom.read_record = the organization wall (iam.has_org_access / a portal)
-- then custom.has_visibility(person, 'record', id, 'viewer'); an edit asks 'editor'; a list is
-- custom.visible_record_ids(table, 'viewer'). The old screens decide with context.scopes' policies
-- (std_select / std_update as the person). This file measures, for every member of every organization
-- that has scopes, every member of every class, each scope's creator, one unrelated person per
-- organization and the anonymous seat, where the two disagree. Read-only; rolled back.

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesaccess_store_ladder_gap_measure.sql'
\set expect 'clone'
\set requires 'function:custom.has_visibility|function:custom.visible_record_ids'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin isolation level repeatable read;
set local statement_timeout = 0;
\if :{?world_until}
\else
\echo 'pass -v world_until=<the clone promotion time from common-docs/operations/clone/CLONE-REF>'
\quit
\endif

create temp table g_pair on commit drop as
  select s.id as scope_id, s.organization_id as org, s.scope_type_id as table_id, s.created_by, a.seat, a.why
    from context.scopes s
    join context.scope_types st0 on st0.id = s.scope_type_id and st0.created_at <= :'world_until'::timestamptz
    cross join lateral (
      select s.created_by as seat, 'creator'::text as why where s.created_by is not null
      union select m.user_id, 'org ' || m.role from iam.memberships m
       where m.container_type = 'organization' and m.container_id = s.organization_id and m.deleted_at is null and m.status = 'active'
      union select m.user_id, 'class ' || m.role || '/' || m.status from iam.memberships m
       where m.container_type = 'scope' and m.container_id = s.id and m.deleted_at is null
      union (select u.id, 'unrelated' from auth.users u
              where not exists (select 1 from iam.memberships m where m.user_id = u.id and m.container_id in (s.id, s.organization_id))
              order by u.id limit 1)) a
   where s.created_at <= :'world_until'::timestamptz;

create temp table g_ans (scope_id uuid, seat uuid, why text, old_open boolean, old_edit boolean, new_open boolean, new_edit boolean, member boolean) on commit drop;

do $m$
declare p record; v_oo boolean; v_oe boolean; v_no boolean; v_ne boolean;
begin
  for p in select * from g_pair loop
    perform set_config('request.jwt.claims', json_build_object('sub', p.seat, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    -- OLD: the scope's own row security, as the person
    select exists (select 1 from context.scopes s where s.id = p.scope_id) into v_oo;
    perform set_config('role', 'none', true);
    select coalesce(p.created_by = p.seat, false) or coalesce(iam.has_access_for(p.seat, 'scope', p.scope_id, 'editor'), false) into v_oe;
    -- NEW: the store's doors — the organization wall, then the one ladder
    -- (the wall is asked as the owner with the person's claims: custom.portal_admits is not a client door)
    select (iam.has_org_access(p.org) or custom.portal_admits(p.org)) into v_no;
    v_ne := v_no and coalesce(custom.has_visibility(p.seat, 'record', p.scope_id, 'editor'), false);
    v_no := v_no and coalesce(custom.has_visibility(p.seat, 'record', p.scope_id, 'viewer'), false);
    insert into g_ans values (p.scope_id, p.seat, p.why, v_oo, v_oe, v_no, v_ne,
      exists (select 1 from iam.memberships m where m.container_type = 'organization' and m.container_id = p.org
               and m.user_id = p.seat and m.status = 'active' and m.deleted_at is null));
  end loop;
end $m$;

\echo '── open / edit: old row security vs the store ladder, by who the person is to the scope'
select why,
       count(*) as pairs,
       count(*) filter (where old_open and not new_open) as loses_open,
       count(*) filter (where new_open and not old_open) as gains_open,
       count(*) filter (where old_edit and not new_edit) as loses_edit,
       count(*) filter (where new_edit and not old_edit) as gains_edit
  from g_ans group by why order by why;
\echo '── the same, class scopes only'
select why, count(*) as pairs,
       count(*) filter (where old_open and not new_open) as loses_open,
       count(*) filter (where new_open and not old_open) as gains_open,
       count(*) filter (where old_edit and not new_edit) as loses_edit,
       count(*) filter (where new_edit and not old_edit) as gains_edit
  from g_ans a join context.scopes s on s.id = a.scope_id
 where s.scope_type_id in (select id from context.scope_types where slug = 'class')
 group by why order by why;
\echo '── every difference, by its cause (chair ruling 2026-09-29: causes 1 and 2 are accepted; any other cause is not)'
with d as (
  select a.*, s.organization_id as org,
         (s.organization_id in (select iam.archived_org_ids())) as org_archived,
         (not iam.member_lane_open(s.organization_id)) as shared_only,
         (s.organization_id in (select so.organization_id from iam.system_orgs so where so.global_readable)) as global_readable
    from g_ans a join context.scopes s on s.id = a.scope_id
   where a.old_open <> a.new_open or a.old_edit <> a.new_edit)
select case
         when org_archived then '1 accepted: the organization is archived (the platform''s archive wall)'
         when shared_only and member then '2 accepted: the organization shows members only what is shared with them'
         when not member and global_readable then '3 NOT covered: a global-readable system organization, read by a non-member'
         when not member and why = 'creator' then '4 NOT covered: the scope''s creator is no longer a member (the organization wall)'
         when not member then '5 NOT covered: a non-member (the organization wall)'
         when old_open = new_open and old_edit and not new_edit then '6 NOT covered: a member may edit it today; the store''s member level is viewer'
         else '7 NOT covered: other'
       end as cause,
       count(*) as pairs,
       count(*) filter (where old_open and not new_open) as loses_open,
       count(*) filter (where old_edit and not new_edit) as loses_edit,
       count(*) filter (where new_open and not old_open) + count(*) filter (where new_edit and not old_edit) as gains,
       count(distinct org) as organizations
  from d group by 1 order by 1;
\echo '── by organization (where anything differs)'
select o.name, platform.knob_resolve('custom', 'member_default_visibility', o.id) #>> '{}' as member_default_visibility,
       iam.member_default_level(o.id, null)::text as member_default_level, count(*) as pairs,
       count(*) filter (where old_open <> new_open) as open_differs,
       count(*) filter (where old_edit <> new_edit) as edit_differs
  from g_ans a join context.scopes s on s.id = a.scope_id join iam.organizations o on o.id = s.organization_id
 group by o.id, o.name having count(*) filter (where old_open <> new_open or old_edit <> new_edit) > 0 order by 3 desc, 4 desc;

rollback;

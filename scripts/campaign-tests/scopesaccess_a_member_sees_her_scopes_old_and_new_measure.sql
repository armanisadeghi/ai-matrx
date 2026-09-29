-- LANE SCOPES-READS-ACCESS — WHY AN ORGANIZATION MEMBER DOES NOT REACH A COPIED SCOPE TYPE IN THE STORE, measured from
-- the member's seat (test@test.com) on the dev clone, rolled back.
--
-- For every organization she belongs to: the scope types and scopes she can open today (context.* row security, as
-- her) against what the store's doors let her open (the organization wall, then custom.has_visibility), and then the
-- same with ONE thing changed inside the transaction — her organization's own `custom/member_default_visibility`
-- set back to the platform default `all_records`. If the second count equals the old one, that setting is the whole
-- cause.

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesaccess_a_member_sees_her_scopes_old_and_new_measure.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '600s';

create temp table m_seat on commit drop as select id from auth.users where email = 'test@test.com';
create temp table m_count (org uuid, phase text, types_old int, types_new int, scopes_old int, scopes_new int) on commit drop;

create function pg_temp.m_measure(p_phase text) returns void language plpgsql as $f$
declare o record; v_me uuid := (select id from m_seat); v_to int; v_so int; v_tn int; v_sn int;
begin
  for o in select m.container_id as org from iam.memberships m
            where m.container_type = 'organization' and m.user_id = v_me and m.deleted_at is null and m.status = 'active'
              and exists (select 1 from context.scope_types st where st.organization_id = m.container_id and st.deleted_at is null) loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_me, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select count(*) into v_to from context.scope_types st where st.organization_id = o.org and st.deleted_at is null;
    select count(*) into v_so from context.scopes s where s.organization_id = o.org and s.deleted_at is null;
    perform set_config('role', 'none', true);
    select count(*) filter (where custom.has_visibility(v_me, 'record', st.id, 'viewer')) into v_tn
      from context.scope_types st where st.organization_id = o.org and st.deleted_at is null;
    select count(*) filter (where custom.has_visibility(v_me, 'record', s.id, 'viewer')) into v_sn
      from context.scopes s where s.organization_id = o.org and s.deleted_at is null;
    if not (iam.has_org_access_for(v_me, o.org)) then v_tn := 0; v_sn := 0; end if;
    insert into m_count values (o.org, p_phase, v_to, v_tn, v_so, v_sn);
  end loop;
end $f$;

select pg_temp.m_measure('as it is');
-- the one change: the organization's own member-visibility setting back to the platform default
update platform.knob_override set value = '"all_records"'::jsonb
 where feature = 'custom' and key = 'member_default_visibility' and scope_kind = 'organization'
   and scope_id in (select org from m_count) and value = '"shared_only"'::jsonb;
select pg_temp.m_measure('its members-see-shared-only setting off');

select o.name, platform.knob_resolve('custom', 'member_default_visibility', c.org) #>> '{}' as setting_now, c.phase,
       c.types_old, c.types_new, c.scopes_old, c.scopes_new
  from m_count c join iam.organizations o on o.id = c.org order by o.name, c.phase;
select phase, sum(types_old) types_old, sum(types_new) types_new, sum(scopes_old) scopes_old, sum(scopes_new) scopes_new
  from m_count group by phase order by phase;
rollback;

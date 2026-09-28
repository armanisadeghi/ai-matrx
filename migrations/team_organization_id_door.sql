-- team_organization_id_door.sql
--
-- A team (`iam.team`) is managed on its ORGANIZATION's settings page
-- (Manage > Teams), never on a page of its own — so opening a team from a
-- list that only carries the team's id needs a team -> organization
-- resolver. `iam.team` grants SELECT to nobody but `postgres`/`service_role`
-- (verified live), so the client cannot read it directly; this is the one
-- door, following the exact shape of `public.team_members` (same file,
-- 1345_team_grouping_primitive.sql): resolve the org, refuse with a plain
-- sentence when the caller cannot see it, never leak whether the id exists
-- to someone outside that organization.
--
-- Registered in the no-dead-ends census (features/scopes/registry/listed-entity-doors.ts,
-- DOORLESS_REASONS.LIVES_UNDER_ITS_ORGANIZATION) as the door `team` was owed.

create or replace function public.team_organization_id(p_team_id uuid)
returns uuid
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_org uuid;
begin
  select t.organization_id into v_org from iam.team t where t.id = p_team_id and t.deleted_at is null;
  if v_org is null or not iam.has_org_access(v_org) then
    raise exception 'That team is not one you can see: it does not exist, or it belongs to an organization you are not in.'
      using errcode = '42501';
  end if;
  return v_org;
end
$function$;

insert into platform.client_callable_door (schema_name, function_name, identity_args, reason)
values (
  'public',
  'team_organization_id',
  'p_team_id uuid',
  'A team opens on its organization''s settings page (Manage > Teams); the client resolves the team''s organization id to build that door (THE DOOR LAW).'
);

grant execute on function public.team_organization_id(uuid) to authenticated;

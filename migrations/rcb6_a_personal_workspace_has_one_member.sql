-- chair-step: revokes client EXECUTE on the new trigger function only (it is never a client door); adds a membership guard trigger on iam.memberships (SHARE ROW EXCLUSIVE, 86 ms on the clone)
-- lane: RC-B6
-- lock: iam
--
-- A PERSONAL WORKSPACE BELONGS TO ONE PERSON (RC-B6 round 2 privacy finding).
-- test@test.com — and one other account — became MEMBERS of admin@admin.com's
-- personal workspace (2026-07-10). A member of an organization can read what is
-- filed there, so a personal workspace with a second member is not personal.
-- Nothing refused it: an invite / accept / admin add into a personal workspace
-- simply succeeded.
--
-- The rule, at the one place every path writes: iam.memberships refuses a live
-- ORGANIZATION membership in a personal workspace for anyone but its owner
-- (the person who created it). It judges only the row being written:
--   * the two EXISTING extra memberships are left exactly as they are — they are
--     data, reported to the chair, never removed here;
--   * leaving / removing one of them (setting deleted_at) is always allowed (the
--     WHEN clause does not fire for an archived row), so the owner can clean up
--     through the product.
-- Additive: one function, one trigger. The trigger's CREATE takes SHARE ROW
-- EXCLUSIVE on iam.memberships for the length of the statement (measured on the
-- clone — see the lane report), so it runs in the 1–4 AM PT window.

create or replace function iam._a_personal_workspace_has_one_member()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_personal boolean;
  v_owner uuid;
begin
  select organization.is_personal, organization.created_by
    into v_personal, v_owner
    from iam.organizations as organization
   where organization.id = new.container_id;

  if coalesce(v_personal, false)
     and v_owner is not null
     and new.user_id is distinct from v_owner then
    raise exception
      'A personal workspace belongs to one person. Share the item you want to work on together, or create an organization for the team.'
      using errcode = '23514',
            detail = format('personal organization %s; user %s is not its owner', new.container_id, new.user_id);
  end if;
  return new;
end;
$function$;

revoke all on function iam._a_personal_workspace_has_one_member() from public, anon, authenticated;

create trigger _a_personal_workspace_has_one_member
  before insert or update of container_type, container_id, user_id, deleted_at
  on iam.memberships
  for each row
  when (new.container_type = 'organization' and new.deleted_at is null)
  execute function iam._a_personal_workspace_has_one_member();

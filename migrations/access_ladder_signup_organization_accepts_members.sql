-- chair-step: DROPS the membership trigger _a_personal_workspace_has_one_member on iam.memberships and its function; nothing else. Existing membership rows are not touched.
-- lane: access-ladder T-1
-- lock: iam
--
-- ANYONE MAY BE INVITED INTO ANY ORGANIZATION, INCLUDING THE ONE CREATED AT SIGNUP.
-- (The access ladder, common-docs/policies/access-ladder.md, "Organizations are unlimited
-- and equal" — Arman, 2026-09-26.)
--
-- rcb6_a_personal_workspace_has_one_member.sql (applied 2026-09-26 06:17 UTC) made
-- iam.memberships refuse any organization membership for a non-owner in an organization
-- whose deprecated iam.organizations.is_personal flag is true: "A personal workspace belongs
-- to one person…". There is no personal/business type of organization, so that refusal is
-- a live bug: the organization created at signup could not take a second member.
--
-- Reproduced live before this file (rolled-back transaction, admin@admin.com's signup
-- organization 884d1ce8…, test@test.com): a direct membership insert failed with
-- 23514 "A personal workspace belongs to one person…".
--
-- This removes the trigger and its function. Membership DATA is untouched.
-- Measured: DROP TRIGGER takes ACCESS EXCLUSIVE on iam.memberships for a catalog-only change;
-- the runner's 2s lock_timeout gives up rather than queueing behind traffic.

drop trigger if exists _a_personal_workspace_has_one_member on iam.memberships;
drop function if exists iam._a_personal_workspace_has_one_member();

do $$
begin
  if exists (select 1 from pg_trigger t
              where t.tgrelid = 'iam.memberships'::regclass
                and t.tgname = '_a_personal_workspace_has_one_member') then
    raise exception 'access-ladder T-1: the trigger is still present after the drop';
  end if;
  if to_regprocedure('iam._a_personal_workspace_has_one_member()') is not null then
    raise exception 'access-ladder T-1: the function is still present after the drop';
  end if;
end $$;

-- based-on: iam.my_orgs() 50a4c6aa81ed02e1aab78120e3dcc4bd60e9116b9c0bf6a7d53603759d43725f
-- based-on: custom.may_invite_outside(uuid, uuid) df3642dee1c0a576d1684698ee0a3dca7fa5d87088d7059740ab9dccafc18fd8
--
-- Access-lane release findings, the class rather than one call site.
--
-- iam.my_orgs() is a declared anonymous door because public RLS policies call it
-- and a signed-out caller must get zero rows, not 42501. The membership test
-- lives in iam.my_orgs_all(). D6 reads the door body only, and that body never
-- mentions auth.uid(), so the gate is invisible and the door counts as ungated.
-- A null uid now returns before the helper.
--
-- custom.may_invite_outside already returns false when the role is null, then
-- still writes `v_role in (...)`. `NULL in (...)` is null, and a later edit that
-- drops the early return reopens DD-199. Every comparison coalesces to 'none'.
--
-- Writers already pass the organization. The NOT NULL change is the chair-step
-- file beside this one: SET NOT NULL is non-additive and this file must stay
-- a function replace the ordinary path can apply.

set local lock_timeout = '15s';

create or replace function iam.my_orgs()
returns setof uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
-- THE ACCESS ANSWER for the whole platform. An archived organization is not one of yours: the
-- policies that ask this question all close in the same instant, and they all reopen the
-- instant it is restored. Nothing is deleted on either side of that line.
-- A signed-out caller has no memberships. The test is in THIS body, not only in
-- iam.my_orgs_all(), so a null auth.uid() returns zero rows.
begin
  if (select auth.uid()) is null then
    return;
  end if;
  return query
    select o.id
      from iam.my_orgs_all() as m(id)
      join iam.organizations o on o.id = m.id
     where o.archived_at is null;
end
$fn$;

create or replace function custom.may_invite_outside(p_organization_id uuid, p_table_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me   uuid := custom.query_principal();
  v_who  text;
  v_role text;
begin
  if v_me is null then return false; end if;

  v_who := coalesce(
    platform.knob_resolve('custom', 'outside_invite_who', p_organization_id) #>> '{}',
    'org_admins_and_table_owners');

  select m.role into v_role
    from iam.organization_member m
   where m.organization_id = p_organization_id and m.user_id = v_me;

  -- A person outside the organization can never invite another person into it, whatever
  -- the knob says: they hold no role here and the Table is not theirs to hand out.
  -- coalesce, not only the early return: NULL in ('owner','admin') is NULL, and the
  -- refusal must be false for exactly the people who have no role (DD-199).
  if v_role is null then return false; end if;

  if v_who = 'org_admins' then
    return coalesce(v_role, 'none') in ('owner', 'admin');
  end if;
  if v_who = 'table_admins' then
    return custom.has_visibility(v_me, 'record', p_table_id, 'admin'::public.permission_level);
  end if;
  -- `org_admins_and_table_owners`, the default.
  return coalesce(v_role, 'none') in ('owner', 'admin')
      or custom.has_visibility(v_me, 'record', p_table_id, 'admin'::public.permission_level);
end
$fn$;

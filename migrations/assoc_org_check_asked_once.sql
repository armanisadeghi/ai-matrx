-- assoc_org_check_asked_once
-- chair-step: re-expresses assoc_select on platform.associations with the same answer (set form of iam.has_org_access); ALTER POLICY takes the policy lock ~0.1 s; applied only when named.
-- draft: slow-reads lane (RC-A5 timings) — not yet applied; remove this line when rehearsed and measured.
--
-- THE DEFECT, measured on production 2026-09-26 as test@test.com (a plain member), rolled back:
-- after aei_reach_containers_asked_once the flash-card list (`select id from education.fc_card
-- order by created_at desc, id limit 50`) still took 433 ms. EXPLAIN (ANALYZE, BUFFERS): 236 ms
-- of it is ONE arm of fc_card's generated std_select — the fc_card -> fc_set `member` read of
-- platform.associations_live — where assoc_select calls iam.has_org_access(organization_id) once
-- PER EDGE: 4,079 calls of a plpgsql SECURITY DEFINER function (~58 µs each), 3,585 of them
-- refused. Every one of the generated policies that reads associations_live pays the same.
--
-- THE FIX (set-wise, same answer). iam.has_org_access(o) is iam.has_org_access_for(auth.uid(), o):
-- a membership row for (o, caller), OR o is a global-readable system organization and the caller is
-- a super admin. iam.org_access_ids() returns exactly that set once per statement, so
-- `organization_id in (select iam.org_access_ids())` is a hashed lookup with the same answer per row
-- (archived organizations included, exactly as has_org_access includes them — this file changes
-- speed, not access). Only assoc_select changes; the restrictive assoc_payload_follows_endpoints
-- (the association-visibility lane's) is untouched: its has_org_access arm runs only on gated rows.
-- Access delta and timings: aidream db/tests/test_access_read_latency.py.

create or replace function iam.org_access_ids()
returns setof uuid
language sql
stable
security definer
set search_path to ''
as $$
  -- The set form of iam.has_org_access(o): every o for which it answers true for the caller.
  -- Keep the two bodies identical in meaning; see iam.has_org_access_for.
  select m.organization_id from iam.organization_member m where m.user_id = (select auth.uid())
  union
  select s.organization_id from iam.system_orgs s
   where s.global_readable and public.is_super_admin_for((select auth.uid()))
$$;

comment on function iam.org_access_ids() is
  'Set form of iam.has_org_access(o) for the caller (membership, or global-readable system org for a super admin; archived organizations included, like has_org_access). For RLS: `organization_id in (select iam.org_access_ids())` asks once per statement instead of once per row.';

-- A client-callable definer door must be declared before a client grant survives (DD-169).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers, anonymous_callers)
values
  ('iam', 'org_access_ids', '', '{}'::oid[], 'assoc_org_check_asked_once.sql',
   'Caller-identity reader, the same shape as iam.my_orgs_all(): takes no argument and returns only the caller''s own organizations (membership, or global-readable system orgs for a super admin) — the set form of iam.has_org_access, read by platform.associations assoc_select. Reveals nothing iam.has_org_access does not.',
   true, false);

revoke all on function iam.org_access_ids() from public, anon;
grant execute on function iam.org_access_ids() to authenticated, service_role;

alter policy assoc_select on platform.associations
  using ((select public.is_platform_admin()) or organization_id in (select iam.org_access_ids()));

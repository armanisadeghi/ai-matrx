-- AUDIT-ORG RED TWIN -- it passes ONLY while the defect is live, and that is its whole job.
--
-- Same use case as the green suite: Castellano & Reyes, LLP, a five-attorney workers'
-- compensation and family law firm in Long Beach, claiming the Legal industry.
--
-- Run this against the state
-- `migrations/inverse/auditorg_library_audit_names_the_acting_organization.inverse.sql`
-- restores and it PASSES: it asserts, positively, that the firm's audit row lands in
-- admin@admin.com's OWN workspace instead of in the firm -- a row the firm can never read,
-- describing something that did not happen there.
--
-- Run it after `migrations/campaign/auditorg_library_audit_names_the_acting_organization.sql`
-- and it MUST FAIL at clause 2. A green twin that nobody has watched go red proves only that
-- an assertion can be written.
--
-- It ends in ROLLBACK and leaves nothing behind.

\set suite 'auditorg_acting_organization_red.sql'
\set requires 'function:public._library_audit|relation:rag.library_audit_log|relation:iam.org_industries|function:public.industry_assign_org'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_firm  uuid := '7cd12da2-2213-4378-8fba-a9e2dc4ea657';   -- Castellano & Reyes, LLP
  c_ind   uuid := 'dd86c8d3-07fb-4c6b-a2a5-eb1a1fac87f9';   -- iam.industries "Legal"
  v_audit rag.library_audit_log;
  v_actor_org uuid;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_admin::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if auth.uid() <> c_admin then
    raise exception '0: the seat is not admin@admin.com -- auth.uid() is %', auth.uid();
  end if;

  v_actor_org := iam.default_organization_id(c_admin);
  if v_actor_org is null or v_actor_org = c_firm then
    raise exception '0: this twin needs the actor-derived organization (%) to differ from the firm (%)',
      v_actor_org, c_firm;
  end if;

  perform public.industry_assign_org(c_firm, c_ind, false, null);

  select * into v_audit from rag.library_audit_log
   where action = 'industry_assign' and target_organization_id = c_firm
   order by created_at desc limit 1;
  if v_audit.id is null then
    raise exception '1: industry_assign_org wrote no audit row at all';
  end if;

  -- 2 -- THE DEFECT, ASSERTED POSITIVELY. With the old writer live the firm's audit row is
  --      keyed to the person who acted, not to the organization the action happened in.
  if v_audit.organization_id is distinct from v_actor_org then
    raise exception '2: the audit row landed in % -- the defect this twin exists to demonstrate is GONE (it used to land in the actor''s own organization %). This twin is expected to fail here once the fix is live.',
      v_audit.organization_id, v_actor_org;
  end if;

  raise notice 'auditorg_acting_organization_red: the defect is live -- Castellano & Reyes'' audit row landed in admin@admin.com''s own workspace (%), not in the firm (%)', v_actor_org, c_firm;
end $$;

rollback;

-- DEFAULT-ORG-3 -- THE RED TWIN. It asserts the DEFECT, positively.
--
-- Same use case as the green suite: Brightwater Pool & Spa Service, a twelve-technician
-- residential pool and spa maintenance company in Chandler, Arizona, whose route supervisor
-- leaves a service note on a customer record after each stop.
--
-- This file PASSES while public.cmt_add answers "which organization does this comment belong
-- to?" with the author's own personal workspace -- that is, before
-- migrations/campaign/dorg3_three_doors_name_the_organization_they_act_in.sql and again after
-- its inverse -- and it FAILS once the record answers for itself. A guard you cannot show
-- failing is not a guard.
--
-- It ends in ROLLBACK and leaves nothing behind.

\set suite 'dorg3_acting_organization_red.sql'
\set requires 'function:public.cmt_add|relation:platform.comments|relation:crm.party'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_brightwater uuid;
  v_actor_org uuid;
  v_customer uuid;
  v_comment uuid;
  v_row platform.comments;
begin
  -- Provenance: platform._stamp_actor_tier refuses an automated write that names no system.
  perform set_config('app.actor_system', 'campaign.default_org_3_suite', true);

  insert into iam.organizations (name, slug, abbreviation)
  values ('Brightwater Pool & Spa Service', 'brightwater-pool-spa-dorg3-red', 'BPS')
  returning id into v_brightwater;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_brightwater, 'organization', v_brightwater, c_admin, 'owner', 'active');
  insert into crm.party (party_kind, display_name, organization_id)
  values ('person', 'Marguerite Okonjo — 2118 E Ocotillo Rd', v_brightwater)
  returning id into v_customer;

  perform set_config('request.jwt.claims',
    json_build_object('sub', c_admin::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select o.id into v_actor_org
    from iam.organizations o
    join iam.memberships m on m.organization_id = o.id and m.container_type = 'organization'
   where m.user_id = c_admin and o.is_personal
   limit 1;
  if v_actor_org is null or v_actor_org = v_brightwater then
    raise exception 'RED: this twin needs the actor''s own workspace (%) to differ from Brightwater (%)',
      v_actor_org, v_brightwater;
  end if;

  -- THE DEFECT, STATED POSITIVELY: a service note about a Brightwater customer, filed with no
  -- organization named, lands in the SUPERVISOR'S OWN workspace.
  v_comment := public.cmt_add('party', v_customer,
    'Filter DE at 18 months, pressure 24 psi over clean; quoted grid replacement to Mrs. Okonjo at the stop.');
  select * into v_row from platform.comments where id = v_comment;

  if v_row.organization_id is distinct from v_actor_org then
    raise exception 'RED TWIN FAILS (which is the point once the fix is in): the service note landed in % -- the defect this twin asserts would have put it in the actor''s own workspace (%). Brightwater is %.',
      v_row.organization_id, v_actor_org, v_brightwater;
  end if;

  raise notice 'dorg3_acting_organization_red: PASSES -- the defect is present: a Brightwater customer''s service note landed in the actor''s own workspace (%), not in Brightwater (%)',
    v_actor_org, v_brightwater;
end $$;

rollback;

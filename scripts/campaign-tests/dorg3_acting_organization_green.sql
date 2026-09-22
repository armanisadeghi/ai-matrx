-- DEFAULT-ORG-3 -- a comment belongs to the organization THE COMMENTED RECORD belongs to,
-- and a creator profile belongs to the organization the call names. Never the actor's own.
--
-- THE USE CASE THIS SUITE NAMES (no fake test data): Brightwater Pool & Spa Service, a
-- twelve-technician residential pool and spa maintenance company in Chandler, Arizona, runs
-- weekly service routes. Each customer is a record in the company's CRM; after a stop, the
-- route supervisor leaves a service note on that customer so the next technician sees what was
-- found -- "Filter DE at 18 months, pressure 24 psi over clean; quoted grid replacement" --
-- and so the office can answer the customer when they call. The note is a comment on the
-- customer record, and it belongs to Brightwater, because that is whose customer it is.
--
-- WHY THE ORGANIZATION IS THE WHOLE POINT. platform.comments is read by public.cmt_list,
-- which filters on organization_id. Before
-- migrations/campaign/dorg3_three_doors_name_the_organization_they_act_in.sql, public.cmt_add
-- looked the organization up ONLY for `task` and otherwise wrote
-- public.ensure_personal_organization(auth.uid()) -- so a service note left on a customer
-- record landed in the SUPERVISOR'S OWN personal workspace, where Brightwater can never read
-- it and where the job it describes did not happen.
--
-- THE SEAT AND THE ORGANIZATION ARE DELIBERATELY DIFFERENT. admin@admin.com's own workspace
-- is not Brightwater, so "the record's organization" and "an organization derived from the
-- person" give different answers here and the suite can tell them apart. Clause 0 refuses to
-- run if they ever coincide.
--
-- RED BEFORE / GREEN AFTER. Run this before the migration and clause 2 raises; run it after
-- and all nine pass. It ends in ROLLBACK and leaves nothing behind.
--
-- IT TAKES THE SEAT (SEAT-RECIPE): the assertions run as `authenticated` with
-- admin@admin.com's claims, because public.cmt_add reads auth.uid().

\set suite 'dorg3_acting_organization_green.sql'
\set requires 'function:public.cmt_add|function:platform.entity_organization_id|relation:platform.comments|relation:crm.party|relation:workspace.tasks|relation:platform.entity_types'
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
  v_route_task uuid;
  v_other_customer uuid;
  v_other_org uuid := '7cd12da2-2213-4378-8fba-a9e2dc4ea657';  -- Castellano & Reyes, LLP
  v_comment uuid;
  v_row platform.comments;
  v_sqlstate text;
begin
  -- Provenance: platform._stamp_actor_tier refuses an automated write that names no system.
  perform set_config('app.actor_system', 'campaign.default_org_3_suite', true);

  -- ── THE FIXTURE, AS THE SERVER. Brightwater exists for the length of this transaction. ──
  insert into iam.organizations (name, slug, abbreviation)
  values ('Brightwater Pool & Spa Service', 'brightwater-pool-spa-dorg3', 'BPS')
  returning id into v_brightwater;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_brightwater, 'organization', v_brightwater, c_admin, 'owner', 'active');

  -- A route customer, and one of Brightwater's weekly route stops.
  insert into crm.party (party_kind, display_name, organization_id)
  values ('person', 'Marguerite Okonjo — 2118 E Ocotillo Rd', v_brightwater)
  returning id into v_customer;
  insert into workspace.tasks (title, organization_id)
  values ('Tuesday route — Ocotillo / Knox loop, 11 stops', v_brightwater)
  returning id into v_route_task;

  -- A customer belonging to SOMEBODY ELSE. Used once, in clause 6.
  insert into crm.party (party_kind, display_name, organization_id)
  values ('person', 'Elena Castellano (firm principal)', v_other_org)
  returning id into v_other_customer;

  -- ── THE PRIMITIVE READS THE RECORD'S OWN ORGANIZATION (as the server, before the seat:
  --    these are server-only functions and clause 1 below proves that from the seat). ──
  if not platform.entity_is_org_scoped('party') then
    raise exception 'P: the party entity type is not organization-scoped, so no record can answer for itself';
  end if;
  if platform.entity_organization_id('party', v_customer) is distinct from v_brightwater then
    raise exception 'P: the customer record answered % -- it belongs to Brightwater (%)',
      platform.entity_organization_id('party', v_customer), v_brightwater;
  end if;
  if platform.entity_organization_id('party', gen_random_uuid()) is not null then
    raise exception 'P: a record that does not exist answered with an organization';
  end if;

  -- ── 0 -- take the seat and prove it. ──
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_admin::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat -- current_user is %', current_user;
  end if;
  if auth.uid() <> c_admin then
    raise exception '0: the seat is not admin@admin.com -- auth.uid() is %', auth.uid();
  end if;

  -- The organization a person-derived answer WOULD give. Read here for ONE reason: to prove
  -- the comment is not keyed to it. Nothing in this suite uses it to decide anything.
  select o.id into v_actor_org
    from iam.organizations o
    join iam.memberships m on m.organization_id = o.id and m.container_type = 'organization'
   where m.user_id = c_admin and o.is_personal
   limit 1;
  if v_actor_org is null or v_actor_org = v_brightwater then
    raise exception '0: this suite needs the actor''s own workspace (%) to differ from Brightwater (%), or it cannot tell the two answers apart',
      v_actor_org, v_brightwater;
  end if;

  -- ── 1 -- NO CLIENT SEAT REACHES THE PRIMITIVES. They run as the definer with BYPASSRLS,
  --        so a client that could call platform.entity_organization_id would hold an oracle
  --        mapping any record id to the organization that owns it. Both are declared
  --        server_only, so `authenticated` has no EXECUTE and both answer 42501 from here.
  begin
    perform platform.entity_is_org_scoped('party');
    raise exception '1: platform.entity_is_org_scoped is callable from a client seat -- it must not be';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform platform.entity_organization_id('party', v_customer);
    raise exception '1: platform.entity_organization_id is callable from a client seat -- it must not be';
  exception when insufficient_privilege then
    null;
  end;

  -- ── 2 -- THE SERVICE NOTE LANDS IN BRIGHTWATER, WITH NO p_org_id NAMED AT ALL. ──
  --        This is the clause the old body failed: `party` is not `task`, so it substituted.
  v_comment := public.cmt_add('party', v_customer,
    'Filter DE at 18 months, pressure 24 psi over clean; quoted grid replacement to Mrs. Okonjo at the stop.');
  select * into v_row from platform.comments where id = v_comment;
  if v_row.id is null then
    raise exception '2: cmt_add wrote no comment';
  end if;
  if v_row.organization_id is distinct from v_brightwater then
    raise exception '2: the service note landed in organization % -- the customer it is about belongs to Brightwater (%)',
      v_row.organization_id, v_brightwater;
  end if;
  if v_row.organization_id = v_actor_org then
    raise exception '2: the service note landed in the ACTOR''s own workspace (%), which is exactly the answer this file removes',
      v_actor_org;
  end if;

  -- ── 3 -- THE TASK PATH, WHICH ALWAYS WORKED, STILL WORKS. ──
  v_comment := public.cmt_add('task', v_route_task, 'Knox loop resequenced — Ocotillo first, saves 22 minutes.');
  select * into v_row from platform.comments where id = v_comment;
  if v_row.organization_id is distinct from v_brightwater then
    raise exception '3: the route note landed in % not Brightwater (%)', v_row.organization_id, v_brightwater;
  end if;

  -- ── 4 -- AN EXPLICIT p_org_id THAT AGREES WITH THE RECORD IS HONOURED. ──
  v_comment := public.cmt_add('party', v_customer, 'Gate code changed to 4417 — front latch, not the side.',
                              null, v_brightwater);
  select * into v_row from platform.comments where id = v_comment;
  if v_row.organization_id is distinct from v_brightwater then
    raise exception '4: an explicitly named organization was not honoured: %', v_row.organization_id;
  end if;

  -- ── 5 -- NOTHING NAMES THE ORGANIZATION: REFUSE, DO NOT SUBSTITUTE. ──
  --        An unregistered entity type cannot answer for itself, and neither may the author's
  --        own workspace.
  begin
    perform public.cmt_add('dorg3_unregistered_thing', gen_random_uuid(), 'nobody named an organization');
    raise exception '5: cmt_add accepted a comment nothing could place -- it must refuse';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate <> '23502' then
      raise exception '5: cmt_add raised % when nothing named the organization -- expected 23502', v_sqlstate;
    end if;
  end;

  -- ── 6 -- THE HOLE THE TASK-ONLY CHECK LEFT OPEN IS CLOSED. ──
  --        Naming your OWN organization while pointing at somebody ELSE's customer record
  --        used to be accepted for every entity type but `task`.
  begin
    perform public.cmt_add('party', v_other_customer, 'filed against the wrong firm''s customer',
                           null, v_brightwater);
    raise exception '6: cmt_add filed a comment naming Brightwater onto another organization''s record';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate <> '22023' then
      raise exception '6: cmt_add raised % for a record in another organization -- expected 22023', v_sqlstate;
    end if;
  end;

  -- ── 7 -- THE RETIRED SIGNUP DOOR IS LOUD, NOT DEAD. ──
  --        It is attached to nothing; re-attaching it must fail at the first signup rather
  --        than quietly run a second provisioning path.
  if exists (
    select 1 from pg_trigger t
     where not t.tgisinternal
       and t.tgfoid = 'public.create_personal_organization()'::regprocedure) then
    raise exception '7: public.create_personal_organization is attached to a trigger -- this file retired it on the understanding that it is attached to nothing';
  end if;

  -- ── 8 -- THE CREATOR HANDLE CARRIES THE PROFILE'S OWN ORGANIZATION, AND THE THREE-ARGUMENT
  --        OVERLOAD EXISTS FOR THE CASE WHERE NOTHING CARRIES ONE. ──
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'creator_claim_handle'
       and p.oid::regprocedure::text = 'creator_claim_handle(text,text,uuid)') then
    raise exception '8: the three-argument creator_claim_handle does not exist';
  end if;
  -- ONE signature, not two. A second (text, text) overload made every existing two-argument
  -- call ambiguous (42725) and killed the creator dashboard; the repair is
  -- migrations/campaign/dorg3_the_creator_handle_has_one_signature.sql. p_organization_id
  -- carries a default, so the two-argument call the client makes still reaches it.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'creator_claim_handle') <> 1 then
    raise exception '8: public.creator_claim_handle has % signatures -- two of them make every two-argument call ambiguous (42725)',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'creator_claim_handle');
  end if;
  begin
    perform public.creator_claim_handle('dorg3-not-a-real-claim', 'Route Supervisor');
    raise exception '8: a two-argument creator_claim_handle call was accepted with a handle that is not valid -- the clause proves the CALL RESOLVES, so it must fail on the handle rule';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = '42725' then
      raise exception '8: the two-argument call the creator dashboard makes is AMBIGUOUS (42725) -- there is more than one creator_claim_handle signature again';
    end if;
  end;

  raise notice 'dorg3_acting_organization_green: 9/9 (P, 0-8) -- Brightwater Pool & Spa Service''s service notes landed in Brightwater (%), never in the actor''s own workspace (%); a note pointed at another organization''s customer was refused 22023, and a comment nothing could place was refused 23502', v_brightwater, v_actor_org;
end $$;

rollback;

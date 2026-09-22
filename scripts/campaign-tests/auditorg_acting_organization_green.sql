-- AUDIT-ORG -- an audit row's organization is the organization the action was performed IN.
--
-- THE USE CASE THIS SUITE NAMES (no fake test data): Castellano & Reyes, LLP, a five-attorney
-- workers' compensation and family law firm in Long Beach, is being set up on the platform.
-- A firm administrator claims the Legal industry for the firm's organization and subscribes
-- the firm to a Matrx Library rulebook. Both are actions taken INSIDE the firm's organization.
--
-- WHY THE ORGANIZATION IS THE WHOLE POINT. `rag.library_audit_log`'s only client policy is
--   std_select USING (organization_id IS NOT NULL AND organization_id IN (SELECT iam.my_orgs()))
-- so `organization_id` decides WHOSE AUDIT TRAIL the row appears in. Before
-- `migrations/campaign/auditorg_library_audit_names_the_acting_organization.sql` that column
-- was filled from the ACTOR -- so a platform administrator claiming an industry for a client
-- firm wrote the firm's audit row into the administrator's OWN workspace, where the firm could
-- never read it, and where it did not happen.
--
-- THE SEAT AND THE ORGANIZATION ARE DELIBERATELY DIFFERENT. admin@admin.com's own workspace is
-- NOT Castellano & Reyes, so "the acting organization" and "an organization derived from the
-- person" give different answers here and the suite can tell them apart. (The DOORS-ONLY-2
-- suite used an organization that WAS the actor's own, so its clause 2 could not.)
--
-- RED BEFORE / GREEN AFTER. Run this before the migration and clause 2 raises; run it after
-- and all six pass. It ends in ROLLBACK and leaves nothing behind.
--
-- IT TAKES THE SEAT (SEAT-RECIPE): every clause runs as `authenticated` with admin@admin.com's
-- claims, because these doors read `auth.uid()`.

\set suite 'auditorg_acting_organization_green.sql'
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
  v_assigned iam.org_industries;
  v_audit rag.library_audit_log;
  v_actor_org uuid;
  v_n integer;
  v_sqlstate text;
begin
  -- A -- THE RETIRED ARITY IS LOUD, NOT DEAD, in the context that actually calls it: inside a
  --      SECURITY DEFINER door, running as the server. A caller that still derives the
  --      organization from the person is told what to pass instead.
  begin
    perform public._library_audit(c_admin, 'industry_assign', null, null, c_ind, c_firm, '{}'::jsonb);
    raise exception 'A: the seven-argument writer accepted a call -- it must refuse and name its replacement';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate <> '23502' then
      raise exception 'A: the seven-argument writer raised % -- expected 23502 with the remedy', v_sqlstate;
    end if;
  end;

  -- B -- AND THE NEW WRITER REFUSES A CALL THAT NAMES NO ACTING ORGANIZATION, rather than
  --      inventing one.
  begin
    perform public._library_audit(c_admin, null, 'industry_assign', null, null, c_ind, c_firm, '{}'::jsonb);
    raise exception 'B: the writer accepted a call with no acting organization';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate <> '23502' then
      raise exception 'B: the writer raised % for a missing acting organization -- expected 23502', v_sqlstate;
    end if;
  end;

  -- 0 -- take the seat and prove it.
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
  -- the audit row is not keyed to it. Nothing in this suite uses it to decide anything.
  v_actor_org := iam.default_organization_id(c_admin);
  if v_actor_org is null or v_actor_org = c_firm then
    raise exception '0: this suite needs the actor-derived organization (%) to differ from the firm (%), or it cannot tell the two answers apart',
      v_actor_org, c_firm;
  end if;

  select count(*) into v_n from rag.library_audit_log;

  -- 1 -- THE INDUSTRY DOOR. The firm claims Legal.
  v_assigned := public.industry_assign_org(c_firm, c_ind, false, null);
  if v_assigned.organization_id <> c_firm or v_assigned.industry_id <> c_ind then
    raise exception '1: industry_assign_org returned the wrong row: org % industry %',
      v_assigned.organization_id, v_assigned.industry_id;
  end if;

  -- 2 -- THE AUDIT ROW LANDS IN THE ORGANIZATION THE ACTION HAPPENED IN.
  select * into v_audit from rag.library_audit_log
   where action = 'industry_assign' and target_organization_id = c_firm
   order by created_at desc limit 1;
  if v_audit.id is null then
    raise exception '2: industry_assign_org wrote no audit row';
  end if;
  if v_audit.organization_id is distinct from c_firm then
    raise exception '2: the audit row landed in organization % -- the action was performed in Castellano & Reyes (%)',
      v_audit.organization_id, c_firm;
  end if;
  if v_audit.organization_id = v_actor_org then
    raise exception '2: the audit row landed in the ACTOR-derived organization (%), which is exactly the answer this file removes',
      v_actor_org;
  end if;
  if v_audit.target_organization_id is distinct from c_firm then
    raise exception '2: the audit row''s target_organization_id is % but the organization acted upon is %',
      v_audit.target_organization_id, c_firm;
  end if;
  if v_audit.actor_user_id is distinct from c_admin then
    raise exception '2: the audit row''s actor is % not %', v_audit.actor_user_id, c_admin;
  end if;

  -- 3 -- THE TWIN DOOR still works, and its audit row lands in the same place.
  perform public.industry_unassign_org(c_firm, c_ind, null);
  select * into v_audit from rag.library_audit_log
   where action = 'industry_unassign' and target_organization_id = c_firm
   order by created_at desc limit 1;
  if v_audit.id is null then
    raise exception '3: industry_unassign_org wrote no audit row';
  end if;
  if v_audit.organization_id is distinct from c_firm then
    raise exception '3: the unassign audit row landed in % not %', v_audit.organization_id, c_firm;
  end if;

  -- 4 -- EVERY NEW ROW HAS AN OWNER, and none of them went to the actor's own organization.
  if (select count(*) from rag.library_audit_log) <> v_n + 2 then
    raise exception '4: expected two new audit rows, found %',
      (select count(*) from rag.library_audit_log) - v_n;
  end if;
  if exists (select 1 from rag.library_audit_log where organization_id is null) then
    raise exception '4: an audit row has no owning organization';
  end if;

  -- 5 -- NO CLIENT SEAT REACHES THE WRITER AT ALL. It is declared server_only, so the
  --      authenticated role's EXECUTE is revoked and both arities answer 42501 from here.
  begin
    perform public._library_audit(c_admin, c_firm, 'industry_assign', null, null, c_ind, c_firm, '{}'::jsonb);
    raise exception '5: the audit writer is callable from a client seat -- it must not be';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate <> '42501' then
      raise exception '5: calling the writer from the seat raised % -- expected 42501 (server_only)', v_sqlstate;
    end if;
  end;

  raise notice 'auditorg_acting_organization_green: 7/7 (A, B, 0-5) -- both industry doors wrote their audit row into Castellano & Reyes (%), never into the actor''s own organization (%)', c_firm, v_actor_org;
end $$;

rollback;

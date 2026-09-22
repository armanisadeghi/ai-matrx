-- DOORS-ONLY-2 -- `public._library_audit` writes the kernel organization, so the fourteen
-- doors that call it stop dying with 23502.
--
-- THE USE CASE THIS SUITE NAMES (no fake test data): Ashcroft & Vance Family Law, a
-- two-attorney family-law practice in Orange County, is being set up on the platform. An
-- administrator claims the Legal industry for the firm's organization, subscribes the firm to
-- a Matrx Library rulebook, and saves a local-search starter pack for the practice. Those are
-- three different door families -- industry, library, seo -- and ALL THREE were dead on the
-- live database with `23502 null value in column "organization_id" of relation
-- "library_audit_log"` before `migrations/campaign/doorsonly2_library_audit_names_the_kernel_organization.sql`.
--
-- RED BEFORE / GREEN AFTER. Run this file before the migration and clause 1, 2 and 3 raise;
-- run it after and all five pass. It ends in ROLLBACK and leaves nothing behind -- the starter
-- pack and the grant it creates are never committed.
--
-- IT TAKES THE SEAT (SEAT-RECIPE): every clause runs as `authenticated` with
-- admin@admin.com's claims, because these doors read `auth.uid()` and a superuser call would
-- exercise a different function.


-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'doorsonly2_library_audit_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_org   uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';   -- the firm's organization
  c_ind   uuid := 'dd86c8d3-07fb-4c6b-a2a5-eb1a1fac87f9';   -- iam.industries "Legal"
  c_rb    uuid := '5d353449-5a2c-4034-ac00-97b5defb23ca';   -- a real platform.rulebook
  v_assigned iam.org_industries;
  v_sub   jsonb;
  v_pack  jsonb;
  v_audit rag.library_audit_log;
  v_actor_org uuid;
  v_n     integer;
begin
  -- PART 0 -- take the seat and prove it.
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_admin::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat -- current_user is %', current_user;
  end if;
  if auth.uid() <> c_admin then
    raise exception '0: the seat is not admin@admin.com -- auth.uid() is %', auth.uid();
  end if;

  v_actor_org := iam.default_organization_id(c_admin);
  if v_actor_org is null then
    raise exception '0: admin@admin.com has no default organization, so this suite cannot state what the kernel column must hold';
  end if;

  select count(*) into v_n from rag.library_audit_log;

  -- 1 -- THE INDUSTRY DOOR. The firm claims Legal. This is the call DOORS-ONLY filed:
  --      `400 23502` for every caller, so no organization could claim an industry at all.
  v_assigned := public.industry_assign_org(c_org, c_ind, false, null);
  if v_assigned.organization_id <> c_org or v_assigned.industry_id <> c_ind then
    raise exception '1: industry_assign_org returned the wrong row: org % industry %',
      v_assigned.organization_id, v_assigned.industry_id;
  end if;

  -- 2 -- THE AUDIT ROW IS THE POINT. The kernel column names the ACTOR's organization (it is
  --      what rag.library_audit_log's std_select policy reads, so it decides whose audit trail
  --      the row appears in); the organization acted UPON stays in target_organization_id.
  select * into v_audit from rag.library_audit_log
   where action = 'industry_assign' and target_organization_id = c_org
   order by created_at desc limit 1;
  if v_audit.id is null then
    raise exception '2: industry_assign_org wrote no audit row';
  end if;
  if v_audit.organization_id is distinct from v_actor_org then
    raise exception '2: the audit row''s kernel organization_id is % but the actor''s organization is %',
      v_audit.organization_id, v_actor_org;
  end if;
  if v_audit.target_organization_id is distinct from c_org then
    raise exception '2: the audit row''s target_organization_id is % but the organization acted upon is %',
      v_audit.target_organization_id, c_org;
  end if;
  if v_audit.actor_user_id is distinct from c_admin then
    raise exception '2: the audit row''s actor is % not %', v_audit.actor_user_id, c_admin;
  end if;

  -- 3 -- THE LIBRARY DOOR, a different family, same single cause.
  v_sub := public.library_subscribe('rulebook', c_rb, c_org, null, null);
  if coalesce((v_sub->>'subscribed')::boolean, false) is not true then
    raise exception '3: library_subscribe did not subscribe: %', v_sub;
  end if;

  -- 4 -- THE SEO DOOR, a third family. The practice's local-search starter pack.
  v_pack := seo.starter_pack_save(jsonb_build_object(
    'name',        'Family Law Local Search Starter -- Ashcroft & Vance',
    'industry',    'Legal',
    'industry_id', c_ind::text,
    'summary',     'Local search starter pack for a two-attorney family law practice serving Orange County: practice-area pages, consultation intake and court-location landing pages.',
    'geo_model',   'local_radius'));
  if nullif(v_pack->>'id', '') is null then
    raise exception '4: starter_pack_save returned no pack: %', v_pack;
  end if;

  -- 5 -- ALL THREE DOORS WROTE THEIR AUDIT ROW, and every one of them carries an owner.
  if (select count(*) from rag.library_audit_log) <> v_n + 3 then
    raise exception '5: expected three new audit rows, found %',
      (select count(*) from rag.library_audit_log) - v_n;
  end if;
  if exists (select 1 from rag.library_audit_log where organization_id is null) then
    raise exception '5: an audit row has no owning organization';
  end if;

  -- and the industry door's twin still works, so the firm can let the claim go again.
  perform public.industry_unassign_org(c_org, c_ind, null);

  raise notice 'doorsonly2_library_audit_green: 5/5 -- industry, library and seo doors all live; kernel organization_id = % on every audit row', v_actor_org;
end $$;

rollback;

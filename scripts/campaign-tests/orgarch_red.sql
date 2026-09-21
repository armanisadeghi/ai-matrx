-- LANE ORG-ARCHIVE — THE RED TWIN of scripts/campaign-tests/orgarch_green.sql.
-- It runs the REAL BYTES of both inverse files and then asserts that every clause the green
-- suite proves is GONE. If any block below fails, the green suite is passing on something other
-- than this lane's work.
-- On the MAIN database, in one transaction that ends in ROLLBACK. Nothing survives it.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/orgarch_red.sql
--
-- Replacing iam.my_orgs() and its two policies takes locks behind every signed-in statement in
-- flight, so this raises lock_timeout and waits for them rather than failing as if the assertion
-- had.

\set ON_ERROR_STOP on
\timing off

begin;

set local lock_timeout = '90s';
set local statement_timeout = '180s';

-- The real inverse bytes, in the order a rollback of this lane would run them.
\i migrations/inverse/orgarch_the_two_doors_archive_and_restore_down.sql
\i migrations/inverse/orgarch_an_organization_is_archived_never_deleted_down.sql

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_name    text;
  v_red     integer := 0;
  v_n       integer;
  v_boss    text := current_user;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'orgarch_red.sql runs on the MAIN database only';
  end if;

  perform set_config('app.actor_system', 'campaign-test/orgarch_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  v_name := 'Cascade Grounds Management ' || substr(v_org::text, 1, 8);
  insert into iam.organizations (id, name, slug, abbreviation, created_by, is_personal, settings)
  values (v_org, v_name, 'cascade-grounds-red-' || substr(v_org::text, 1, 8), 'CGR', c_admin, false,
          jsonb_build_object('campaign_test', 'ORG-ARCHIVE'));
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');

  perform set_config('role', 'authenticated', true);

  -- BLOCK 1 — there is no way to archive an organization at all.
  begin
    perform iam.organization_archive(v_org, v_name, null);
    raise exception 'BLOCK 1 IS NOT RED: iam.organization_archive still exists after its inverse';
  exception when undefined_function then v_red := v_red + 1;
  end;

  -- BLOCK 2 — and no way to restore one.
  begin
    perform iam.organization_restore(v_org, v_name);
    raise exception 'BLOCK 2 IS NOT RED: iam.organization_restore still exists after its inverse';
  exception when undefined_function then v_red := v_red + 1;
  end;

  -- BLOCK 3 — there is no archive-aware list reader, so no list could hide or reveal anything.
  begin
    perform public.list_user_organizations(c_admin, 'active');
    raise exception 'BLOCK 3 IS NOT RED: public.list_user_organizations survived its inverse';
  exception when undefined_function then v_red := v_red + 1;
  end;

  -- BLOCK 4 — THE DEFECT ITSELF: an archived organization is still one of yours, so every one of
  -- the 730 policies that ask my_orgs() keeps its rows open to every member.
  perform set_config('role', v_boss, true);     -- nothing sets archived_at now that the door is gone
  update iam.organizations set archived_at = now(), archived_by = c_admin where id = v_org;
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from iam.my_orgs() m(id) where m.id = v_org;
  if v_n = 0 then
    raise exception 'BLOCK 4 IS NOT RED: my_orgs() still excludes an archived organization, so '
                    'the inverse did not really put the pre-lane body back';
  end if;
  v_red := v_red + 1;

  -- BLOCK 5 — and the old list reader hands an archived organization back as if nothing happened.
  -- public.get_user_organizations holds no client grant (postgres and service_role only), so this
  -- one block steps out of the seat to ask it, and asserts nothing else while it is out.
  perform set_config('role', v_boss, true);
  select count(*) into v_n from public.get_user_organizations(c_admin) where id = v_org;
  perform set_config('role', 'authenticated', true);
  if v_n = 0 then
    raise exception 'BLOCK 5 IS NOT RED: get_user_organizations still hides archived organizations';
  end if;
  v_red := v_red + 1;

  if v_red <> 5 then
    raise exception 'only % of 5 blocks were red', v_red;
  end if;
  raise notice '% of 5 blocks are RED (the defect they assert is back) — the green suite is '
               'passing on this lane''s work and nothing else.', v_red;
end
$t$;

rollback;

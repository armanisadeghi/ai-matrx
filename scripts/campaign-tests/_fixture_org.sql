-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- THE ONE FIXTURE-ORGANIZATION HELPER FOR psql SCRIPTS.  \i scripts/campaign-tests/_fixture_org.sql
--
-- WHY IT EXISTS (lane FIXTURE-ORGS, 2026-09-23). A script that must LEAVE an organization
-- behind — a headless walk whose browser half runs after psql exits — used to insert a new one
-- on every run, with a random slug suffix, under the same realistic name. Ten "Rincon Plumbing
-- Co — Ojai Branch" rows and eight "Ironclad Mobile Mechanic…" rows piled up on the main
-- database that way, and a member's Shared-with-me showed identical rows she could not tell
-- apart. 44 of them were archived by FIXTURE-ORGS.
--
-- THE RULE: a script that keeps an organization finds it BY SLUG and reuses it. It never mints
-- one per run. (A suite that only needs an organization for its own assertions does not keep
-- one at all: it builds inside `begin; … rollback;` and leaves nothing.)
--
-- HOW TO USE IT (before the DO block that needs the organization):
--
--     \set fixture_slug 'rincon-plumbing-co-carpinteria-portal-walk'
--     \set fixture_name 'Rincon Plumbing Co — Carpinteria Branch'
--     \set fixture_abbr 'RPC'
--     \i scripts/campaign-tests/_fixture_org.sql
--
-- and inside the DO block:   v_org uuid := current_setting('matrx.fixture_org')::uuid;
-- psql also gets :fixture_org, and :fixture_org_fresh ('t' only on the run that created it).
--
-- WHAT IT DOES, OUT LOUD:
--   * the slug is live      -> reuses it, and says so. A DIFFERENT NAME on that slug is refused:
--                              one slug is one business, never two.
--   * the slug is archived  -> REFUSES, naming the restore door. It never un-archives by a
--                              table write and never mints a sibling to get round the archive.
--   * the slug is absent    -> creates it once, as admin@admin.com, tagged
--                              settings.test_fixture, with admin@admin.com as its owner.
--   admin@admin.com's owner membership is made sure of on every run (idempotent).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
\if :{?fixture_slug}
\else
  \echo 'FIXTURE ORG REFUSED: set fixture_slug (and fixture_name, fixture_abbr) before \\i _fixture_org.sql'
  \quit
\endif

select set_config('matrx.fixture_slug', :'fixture_slug', false),
       set_config('matrx.fixture_name', :'fixture_name', false),
       set_config('matrx.fixture_abbr', :'fixture_abbr', false) \g /dev/null

do $fixture_org$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com
  v_slug  text := current_setting('matrx.fixture_slug');
  v_name  text := current_setting('matrx.fixture_name');
  v_abbr  text := current_setting('matrx.fixture_abbr');
  v_id    uuid;
  v_have  text;
  v_arch  timestamptz;
  v_fresh boolean := false;
begin
  select id, name, archived_at into v_id, v_have, v_arch
    from iam.organizations where slug = v_slug;

  if v_id is null then
    insert into iam.organizations (name, slug, abbreviation, created_by, settings)
    values (v_name, v_slug, v_abbr, c_admin, jsonb_build_object('test_fixture', true))
    returning id into v_id;
    v_fresh := true;
    raise notice 'FIXTURE ORG created once: % (%) %', v_name, v_slug, v_id;
  elsif v_arch is not null then
    raise exception 'FIXTURE ORG REFUSED: % (%) is archived since %. Restore it through iam.organization_restore(%, %) from the admin@admin.com seat — this helper never mints a second copy.',
      v_have, v_slug, v_arch, v_id, quote_literal(v_have);
  elsif v_have is distinct from v_name then
    raise exception 'FIXTURE ORG REFUSED: slug % already belongs to "%", not "%". One slug is one business — pick a slug of its own.',
      v_slug, v_have, v_name;
  else
    raise notice 'FIXTURE ORG reused by slug: % (%) %', v_name, v_slug, v_id;
  end if;

  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_id, 'organization', v_id, c_admin, 'owner', 'active')
  on conflict (container_type, container_id, user_id) do nothing;

  perform set_config('matrx.fixture_org', v_id::text, false);
  perform set_config('matrx.fixture_org_fresh', v_fresh::text, false);
end
$fixture_org$;

select current_setting('matrx.fixture_org') as fixture_org,
       current_setting('matrx.fixture_org_fresh') as fixture_org_fresh \gset

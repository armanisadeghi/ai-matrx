-- LANE TAILS-7 — THE RED TWIN: with the fix taken away, a seo set-door DESTROYS the edge.
--
-- It does not describe the old shape; it PUTS IT BACK, for real. `\ir` below runs this lane's
-- own inverse — the file rule 27 requires — inside this transaction, so every clause here is
-- measured against the bodies that shipped before
-- `migrations/campaign/tails7_the_seo_set_doors_archive_the_edge.sql`.
--
--   RED 0  asserts the inverse actually took, so a twin that silently failed to remove the
--          thing under test cannot report red for the wrong reason.
--   RED 1  Harborview's marketing lead moves the site to the new map and back: the old choice
--          is GONE, and what comes back is a stranger with a new id and a new first-chosen date.
--   RED 2  she clears a page's funnel stage — the plainest removal there is — and the edge is
--          destroyed rather than withdrawn.
--   RED 3  the mapper re-runs the page's coverage and the topic it KEPT comes back as a
--          different edge: no author, no first-covered date, no history.
--   RED 4  the CONTROL — setting a value for the first time still works, so the difference
--          above is these doors and not a broken database.
--
-- The whole thing ROLLS BACK: the main database keeps the fix.
--
-- 🚨 ONE THING THIS TWIN CANNOT SHOW, said here rather than left to be discovered. The defect
-- the rewrite of `seo.set_page_map_topics` avoids — `INSERT … RETURNING` yielding zero rows on
-- the revive path, so the door reports a write it MADE as one it left alone — exists in neither
-- the old shape (which never met a tombstone) nor the new one. It would have existed in the
-- naive DELETE→assoc_unset swap, which is not a file and never was. Clause 6 of the green suite
-- asserts the count for exactly that reason.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'tails7_seo_archive_red.sql'
\set requires '!tablegrant:authenticated:platform.associations:DELETE'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\pset pager off

begin;

set local lock_timeout = '10s';
set local statement_timeout = '180s';

-- THE PLANT: this lane's own inverse, executed for real.
\ir ../../migrations/inverse/tails7_the_seo_set_doors_archive_the_edge_down.sql

do $red$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_brand   uuid := gen_random_uuid();
  v_site    uuid := gen_random_uuid();
  v_map_old uuid := gen_random_uuid();
  v_map_new uuid := gen_random_uuid();
  v_t_impl  uuid := gen_random_uuid();
  v_t_crown uuid := gen_random_uuid();
  v_t_white uuid := gen_random_uuid();
  v_page    uuid := gen_random_uuid();
  v_facet   uuid := gen_random_uuid();
  v_fv_cons uuid := gen_random_uuid();
  v_fv_dec  uuid := gen_random_uuid();
  v_edge    uuid;
  v_edge2   uuid;
  v_first   timestamptz;
  v_ans     jsonb;
  v_n       integer;
  v_offend  text;
begin
  perform set_config('app.actor_system', 'campaign.tails7.red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ── THE PRACTICE AND ITS MAP (plants) ────────────────────────────────────────────────
  insert into iam.organizations (id, name, slug, abbreviation, created_by, settings)
  values (v_org, 'Harborview Dental Group — Santa Barbara',
          'harborview-dental-sb-t7-' || substr(v_org::text, 1, 8), 'HDG', c_admin,
          jsonb_build_object('test_fixture', true));
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');

  insert into web.brand (id, organization_id, name, created_by)
  values (v_brand, v_org, 'Harborview Dental Group', c_admin);

  insert into web.site (id, organization_id, brand_id, name, root_url, domain, created_by)
  values (v_site, v_org, v_brand, 'harborviewdental.com',
          'https://harborviewdental.com', 'harborviewdental.com', c_admin);

  insert into web.page (id, organization_id, site_id, url, url_hash, path, provenance,
                        canonical_page_id, created_by)
  values (v_page, v_org, v_site, 'https://harborviewdental.com/services/dental-implants',
          md5('https://harborviewdental.com/services/dental-implants'),
          '/services/dental-implants', 'crawl', v_page, c_admin);

  insert into seo.topical_map (id, organization_id, brand_id, name, description, created_by)
  values (v_map_old, v_org, v_brand, 'Harborview 2025 service map',
          'The map the previous agency left behind.', c_admin),
         (v_map_new, v_org, v_brand, 'Harborview 2026 restorative map',
          'Rebuilt around restorative and cosmetic dentistry.', c_admin);

  insert into seo.map_topic (id, map_id, organization_id, slug, name, status, created_by)
  values (v_t_impl,  v_map_new, v_org, 'dental-implants',  'Dental implants',  'active', c_admin),
         (v_t_crown, v_map_new, v_org, 'crowns-and-bridges','Crowns and bridges','active', c_admin),
         (v_t_white, v_map_new, v_org, 'teeth-whitening',  'Teeth whitening',  'active', c_admin);

  insert into seo.map_facet (id, organization_id, key, label, applies_to, created_by)
  values (v_facet, v_org, 'hdg_funnel_stage', 'Funnel stage', 'both', c_admin);
  insert into seo.map_facet_value (id, facet_id, organization_id, brand_id, slug, name, created_by)
  values (v_fv_cons, v_facet, v_org, v_brand, 'consideration', 'Consideration', c_admin),
         (v_fv_dec,  v_facet, v_org, v_brand, 'decision',      'Decision',      c_admin);

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 0 — THE INVERSE IS IN: all five set-doors DESTROY an association again.
  -- ════════════════════════════════════════════════════════════════════════════
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'seo'::regnamespace
     and p.proname in ('set_site_map','set_page_intents','set_page_map_facet','set_map_topic_facet','set_page_map_topics')
     and p.prosrc ~* 'delete\s+from\s+platform\.associations';
  if v_n <> 5 then
    raise exception 'RED 0: the inverse did not take — only % of the five doors are back to DELETE, so nothing below measures the old shape', v_n;
  end if;
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'seo'::regnamespace
     and p.proname in ('set_site_map','set_page_intents','set_page_map_facet','set_map_topic_facet','set_page_map_topics')
     and p.prosrc ~* 'platform\.assoc_unset';
  if v_n <> 0 then
    raise exception 'RED 0: % door(s) still call platform.assoc_unset after the inverse', v_n;
  end if;
  raise notice 'RED 0 — the inverse is in: all five seo set-doors DESTROY the edge again.';

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED: this twin did not take the seat — current_user is %', current_user;
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 1 — the site's old map choice is DESTROYED, and comes back as a stranger.
  -- ════════════════════════════════════════════════════════════════════════════
  perform seo.set_site_map(v_site, v_map_old);
  select a.id, a.created_at into v_edge, v_first from platform.associations a
   where a.source_type='web_site' and a.source_id=v_site and a.target_type='seo_topical_map'
     and a.target_id=v_map_old and a.role='uses';
  perform seo.set_site_map(v_site, v_map_new);
  if exists (select 1 from platform.associations a where a.id = v_edge) then
    raise exception 'RED 1 did not reproduce: the old map choice survived as a row';
  end if;
  perform seo.set_site_map(v_site, v_map_old);
  select a.id into v_edge2 from platform.associations a
   where a.source_type='web_site' and a.source_id=v_site and a.target_type='seo_topical_map'
     and a.target_id=v_map_old and a.role='uses';
  if v_edge2 is not distinct from v_edge then
    raise exception 'RED 1 did not reproduce: the same edge came back';
  end if;
  raise notice 'RED 1 — moving the site off the 2025 map DESTROYED the choice (% is gone); putting it back minted a stranger (%) with no history.', v_edge, v_edge2;

  perform seo.set_site_map(v_site, v_map_new);

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 2 — clearing a page's funnel stage destroys the edge.
  -- ════════════════════════════════════════════════════════════════════════════
  perform seo.set_page_map_facet(v_page, 'hdg_funnel_stage', 'consideration', 'human');
  select a.id into v_edge from platform.associations a
   where a.source_type='web_page' and a.source_id=v_page and a.target_type='seo_map_facet_value'
     and a.target_id=v_fv_cons and a.role='facet';
  perform seo.set_page_map_facet(v_page, 'hdg_funnel_stage', null, 'human');
  if exists (select 1 from platform.associations a where a.id = v_edge) then
    raise exception 'RED 2 did not reproduce: the cleared facet survived as a row';
  end if;
  raise notice 'RED 2 — she cleared the funnel stage and the edge (%) was destroyed, not withdrawn: nothing to put back and nothing that says she ever set it.', v_edge;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 3 — the mapper re-runs and the topic it KEPT comes back as a different edge.
  -- ════════════════════════════════════════════════════════════════════════════
  perform seo.set_page_map_topics(v_page,
    jsonb_build_array(jsonb_build_object('slug','dental-implants','confidence',90,'reason','primary service page')),
    'mapper');
  select a.id, a.created_at into v_edge, v_first from platform.associations a
   where a.source_type='web_page' and a.source_id=v_page and a.target_type='seo_map_topic'
     and a.target_id=v_t_impl and a.role='covers';
  perform seo.set_page_map_topics(v_page,
    jsonb_build_array(jsonb_build_object('slug','dental-implants','confidence',95,'reason','primary service page')),
    'mapper');
  select a.id into v_edge2 from platform.associations a
   where a.source_type='web_page' and a.source_id=v_page and a.target_type='seo_map_topic'
     and a.target_id=v_t_impl and a.role='covers';
  if v_edge2 is not distinct from v_edge then
    raise exception 'RED 3 did not reproduce: the kept coverage survived the re-run as the same edge';
  end if;
  raise notice 'RED 3 — the mapper re-ran and the topic it KEPT changed identity (% then %): the day the page was first mapped to implants is gone.', v_edge, v_edge2;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 4 — THE CONTROL. Setting a value for the first time still works, so the three
  -- failures above are these doors and not a broken database.
  -- ════════════════════════════════════════════════════════════════════════════
  perform seo.set_map_topic_facet(v_map_new, 'teeth-whitening', 'hdg_funnel_stage', 'consideration', 'human');
  if not exists (select 1 from platform.associations a
                  where a.source_type='seo_map_topic' and a.source_id=v_t_white
                    and a.target_type='seo_map_facet_value' and a.target_id=v_fv_cons and a.role='facet') then
    raise exception 'RED 4: even a FIRST set does not work, so nothing above is about archiving';
  end if;
  raise notice 'RED 4 — the control holds: a first set still works.';

  raise notice '=== TAILS-7 RED — the inverse was run for real, and with it a seo set-door DESTROYS the edge: what Harborview un-sets she cannot put back. Rolling back; the main database keeps the fix. ===';
end $red$;

rollback;

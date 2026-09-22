-- LANE TAILS-7 — THE GREEN SUITE: the seo set-doors ARCHIVE the edge, so what a person
-- un-sets she can put back, and the door stops lying about what it wrote.
--
-- THE USE CASE. Harborview Dental Group, Santa Barbara. Their marketing lead keeps a topical
-- map for harborviewdental.com so that every service page covers the right subject and carries
-- the right funnel stage. In one afternoon she moves the site from the map she inherited to the
-- one she rebuilt and then back when she sees the old one still holds the implant pages;
-- re-aims the implant page's intent and changes her mind; sets a page's funnel stage and clears
-- it; and lets the mapper re-run the site's coverage twice.
--
-- Before `migrations/campaign/tails7_the_seo_set_doors_archive_the_edge.sql` every one of those
-- reversals DESTROYED the edge: a new id, no created_by, no day it was first set and no history
-- in common with the link that had been there. The red twin,
-- `scripts/campaign-tests/tails7_seo_archive_red.sql`, runs this lane's inverse for real and
-- shows every clause below failing again.
--
-- THE SEAT. PART 0 takes `authenticated` and proves it cannot touch platform.associations at
-- all. Everything asserted below happens through the seo doors. The plants — the organization,
-- the brand, the site, the pages, the map, its topics and one facet — are made as the connected
-- role because none of them has a client door this suite is testing.
--
-- ONE transaction, ROLLBACK at the end.
--
-- 🚨 THE MAIN DATABASE. The guard below names main's own system identifier.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'tails7_seo_archive_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\pset pager off

begin;

set local lock_timeout = '10s';
set local statement_timeout = '180s';

do $green$
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
  perform set_config('app.actor_system', 'campaign.tails7.green', true);
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
  -- PART 0 — THE SEAT.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  begin
    delete from platform.associations where id = gen_random_uuid();
    raise exception '0: this seat can DELETE from platform.associations directly, so no door decides anything';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 OK — the seat is `authenticated` and it cannot unmake an edge except through a door.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 1 — SHE MOVES THE SITE TO THE NEW MAP, AND THE OLD CHOICE IS ARCHIVED.
  -- ════════════════════════════════════════════════════════════════════════════
  perform seo.set_site_map(v_site, v_map_old);
  select a.id, a.created_at into v_edge, v_first from platform.associations a
   where a.source_type='web_site' and a.source_id=v_site
     and a.target_type='seo_topical_map' and a.target_id=v_map_old and a.role='uses';
  if v_edge is null then raise exception '1: putting the site on a map made no edge at all'; end if;

  perform seo.set_site_map(v_site, v_map_new);
  if exists (select 1 from platform.associations_live a where a.id = v_edge) then
    raise exception '1: the site still uses the old map after she moved it';
  end if;
  if not exists (select 1 from platform.associations a where a.id = v_edge and a.deleted_at is not null) then
    raise exception '1: moving the site to another map DESTROYED the old choice — there is nothing to put back';
  end if;
  if not exists (select 1 from platform.associations a
                  where a.id = v_edge and a.deleted_via_type='web_site' and a.deleted_via_id=v_site) then
    raise exception '1: the withdrawal does not say what took the old map off';
  end if;
  raise notice 'CLAUSE 1 OK: the site is on the 2026 map and the 2025 choice is archived, naming the site that dropped it.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 2 — SHE PUTS IT BACK, AND GETS THE SAME CHOICE BACK.
  -- ════════════════════════════════════════════════════════════════════════════
  perform seo.set_site_map(v_site, v_map_old);
  select a.id into v_edge2 from platform.associations_live a
   where a.source_type='web_site' and a.source_id=v_site
     and a.target_type='seo_topical_map' and a.target_id=v_map_old and a.role='uses';
  if v_edge2 is distinct from v_edge then
    raise exception '2: the old map came back as a DIFFERENT edge (% then %)', v_edge, v_edge2;
  end if;
  if (select a.created_at from platform.associations a where a.id=v_edge) is distinct from v_first then
    raise exception '2: the choice came back with a new "first chosen" date';
  end if;
  select count(*) into v_n from platform.associations a
   where a.source_type='web_site' and a.source_id=v_site and a.target_type='seo_topical_map' and a.role='uses'
     and a.deleted_at is null;
  if v_n <> 1 then raise exception '2: % live map(s) for one site', v_n; end if;
  raise notice 'CLAUSE 2 OK: the same choice came back, first made at %, and the site still uses exactly one map.', v_first;

  -- put the site on the map whose topics the rest of the suite uses
  perform seo.set_site_map(v_site, v_map_new);

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 3 — A PAGE'S INTENT. She aims the implant page at implants, re-aims it at
  -- crowns, and changes her mind. One edge per topic, each with its own history.
  -- ════════════════════════════════════════════════════════════════════════════
  perform seo.set_page_intents(v_site,
    jsonb_build_array(jsonb_build_object('page_id', v_page, 'disposition', 'move',
                                         'topic_slug', 'dental-implants', 'state', 'proposed')),
    'human');
  select a.id, a.created_at into v_edge, v_first from platform.associations_live a
   where a.source_type='web_page' and a.source_id=v_page and a.target_type='seo_map_topic' and a.role='intent';
  if v_edge is null then raise exception '3: the page got no intent at all'; end if;

  perform seo.set_page_intents(v_site,
    jsonb_build_array(jsonb_build_object('page_id', v_page, 'disposition', 'move',
                                         'topic_slug', 'crowns-and-bridges', 'state', 'proposed')),
    'human');
  if not exists (select 1 from platform.associations a where a.id=v_edge and a.deleted_at is not null) then
    raise exception '3: re-aiming the page DESTROYED its previous intent';
  end if;

  perform seo.set_page_intents(v_site,
    jsonb_build_array(jsonb_build_object('page_id', v_page, 'disposition', 'move',
                                         'topic_slug', 'dental-implants', 'state', 'accepted')),
    'human');
  select a.id into v_edge2 from platform.associations_live a
   where a.source_type='web_page' and a.source_id=v_page and a.target_type='seo_map_topic'
     and a.target_id=v_t_impl and a.role='intent';
  if v_edge2 is distinct from v_edge then
    raise exception '3: the original intent came back as a DIFFERENT edge (% then %)', v_edge, v_edge2;
  end if;
  if (select a.payload->>'state' from platform.associations a where a.id=v_edge) <> 'accepted' then
    raise exception '3: the revived intent kept the OLD state instead of the one she just set';
  end if;
  if (select a.created_at from platform.associations a where a.id=v_edge) is distinct from v_first then
    raise exception '3: the intent came back with a new "first set" date';
  end if;
  raise notice 'CLAUSE 3 OK: the page''s intent moved, came back as the same edge, and carries the state she set last.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 4 — CLEARING A FACET IS THE PLAINEST REMOVAL THERE IS, and it used to destroy.
  -- ════════════════════════════════════════════════════════════════════════════
  perform seo.set_page_map_facet(v_page, 'hdg_funnel_stage', 'consideration', 'human');
  select a.id, a.created_at into v_edge, v_first from platform.associations_live a
   where a.source_type='web_page' and a.source_id=v_page
     and a.target_type='seo_map_facet_value' and a.target_id=v_fv_cons and a.role='facet';
  if v_edge is null then raise exception '4: the funnel stage did not go on the page'; end if;

  perform seo.set_page_map_facet(v_page, 'hdg_funnel_stage', null, 'human');
  if exists (select 1 from platform.associations_live a where a.id=v_edge) then
    raise exception '4: clearing the facet left it standing';
  end if;
  if not exists (select 1 from platform.associations a where a.id=v_edge and a.deleted_at is not null) then
    raise exception '4: CLEARING the facet DESTROYED the edge — a person un-setting a value is exactly what archiving is for';
  end if;

  -- a DIFFERENT value goes on cleanly over the withdrawn one …
  perform seo.set_page_map_facet(v_page, 'hdg_funnel_stage', 'decision', 'human');
  if not exists (select 1 from platform.associations_live a
                  where a.source_type='web_page' and a.source_id=v_page
                    and a.target_type='seo_map_facet_value' and a.target_id=v_fv_dec and a.role='facet') then
    raise exception '4: the new value did not go on over the archived one';
  end if;
  -- … and the original value comes back as THE SAME edge.
  perform seo.set_page_map_facet(v_page, 'hdg_funnel_stage', 'consideration', 'human');
  select a.id into v_edge2 from platform.associations_live a
   where a.source_type='web_page' and a.source_id=v_page
     and a.target_type='seo_map_facet_value' and a.target_id=v_fv_cons and a.role='facet';
  if v_edge2 is distinct from v_edge then
    raise exception '4: the consideration stage came back as a DIFFERENT edge (% then %)', v_edge, v_edge2;
  end if;
  if (select a.created_at from platform.associations a where a.id=v_edge) is distinct from v_first then
    raise exception '4: the facet came back with a new "first set" date';
  end if;
  select count(*) into v_n from platform.associations_live a
   where a.source_type='web_page' and a.source_id=v_page and a.target_type='seo_map_facet_value' and a.role='facet';
  if v_n <> 1 then raise exception '4: % live value(s) for one facet on one page', v_n; end if;
  raise notice 'CLAUSE 4 OK: clearing a facet archives it, another value goes on cleanly, and the first one comes back as itself.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 5 — THE SAME DOOR ON A TOPIC, which is a different function and a different row.
  -- ════════════════════════════════════════════════════════════════════════════
  perform seo.set_map_topic_facet(v_map_new, 'dental-implants', 'hdg_funnel_stage', 'decision', 'human');
  select a.id into v_edge from platform.associations_live a
   where a.source_type='seo_map_topic' and a.source_id=v_t_impl
     and a.target_type='seo_map_facet_value' and a.target_id=v_fv_dec and a.role='facet';
  if v_edge is null then raise exception '5: the topic did not take the facet'; end if;
  perform seo.set_map_topic_facet(v_map_new, 'dental-implants', 'hdg_funnel_stage', null, 'human');
  if not exists (select 1 from platform.associations a where a.id=v_edge and a.deleted_at is not null) then
    raise exception '5: clearing the topic''s facet DESTROYED the edge';
  end if;
  perform seo.set_map_topic_facet(v_map_new, 'dental-implants', 'hdg_funnel_stage', 'decision', 'human');
  select a.id into v_edge2 from platform.associations_live a
   where a.source_type='seo_map_topic' and a.source_id=v_t_impl
     and a.target_type='seo_map_facet_value' and a.target_id=v_fv_dec and a.role='facet';
  if v_edge2 is distinct from v_edge then
    raise exception '5: the topic''s facet came back as a DIFFERENT edge';
  end if;
  raise notice 'CLAUSE 5 OK: the topic door archives and revives the same way the page door does.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 6 — THE MAPPER RE-RUNS, AND THE DOOR TELLS THE TRUTH ABOUT WHAT IT WROTE.
  --
  -- 🚨 THIS IS THE CLAUSE THE WHOLE REWRITE EXISTS FOR. `set_page_map_topics` clears its own
  -- source wholesale and re-inserts. Once the clear is a withdrawal, the revive trigger
  -- brings each re-stated edge back IN PLACE and returns NULL, so the old
  -- `INSERT … RETURNING true INTO v_wrote` saw ZERO ROWS on a write that had LANDED — and
  -- would have reported every re-stated topic as one it left alone for somebody else. This
  -- asserts the count, not just the rows.
  -- ════════════════════════════════════════════════════════════════════════════
  v_ans := seo.set_page_map_topics(v_page,
    jsonb_build_array(jsonb_build_object('slug','dental-implants','confidence',90,'reason','primary service page'),
                      jsonb_build_object('slug','crowns-and-bridges','confidence',40,'reason','mentions crowns over implants')),
    'mapper');
  if (v_ans->>'covers')::int <> 2 then
    raise exception '6: the first run says it covered % topic(s), not 2 — %', v_ans->>'covers', v_ans;
  end if;
  select a.id, a.created_at into v_edge, v_first from platform.associations_live a
   where a.source_type='web_page' and a.source_id=v_page and a.target_type='seo_map_topic'
     and a.target_id=v_t_impl and a.role='covers';

  -- the second run keeps implants, drops crowns, adds whitening
  v_ans := seo.set_page_map_topics(v_page,
    jsonb_build_array(jsonb_build_object('slug','dental-implants','confidence',95,'reason','primary service page'),
                      jsonb_build_object('slug','teeth-whitening','confidence',25,'reason','cross-links the whitening offer')),
    'mapper');
  if (v_ans->>'covers')::int <> 2 then
    raise exception '6: the re-run says it covered % topic(s), not 2 — the door is reporting a write it actually made as one somebody else held: %',
      v_ans->>'covers', v_ans;
  end if;
  if jsonb_array_length(v_ans->'kept_existing') <> 0 then
    raise exception '6: the re-run claims it left rows alone for another writer: %', v_ans->'kept_existing';
  end if;
  if (select a.id from platform.associations_live a
       where a.source_type='web_page' and a.source_id=v_page and a.target_type='seo_map_topic'
         and a.target_id=v_t_impl and a.role='covers') is distinct from v_edge then
    raise exception '6: the topic the mapper kept came back as a DIFFERENT edge';
  end if;
  if (select (a.payload->>'confidence')::int from platform.associations a where a.id=v_edge) <> 95 then
    raise exception '6: the revived coverage kept the OLD confidence instead of the one just written';
  end if;
  if (select a.created_at from platform.associations a where a.id=v_edge) is distinct from v_first then
    raise exception '6: the kept coverage came back with a new "first covered" date';
  end if;
  -- the topic it DROPPED is on the record as withdrawn, not gone
  if not exists (select 1 from platform.associations a
                  where a.source_type='web_page' and a.source_id=v_page and a.target_type='seo_map_topic'
                    and a.target_id=v_t_crown and a.role='covers' and a.deleted_at is not null) then
    raise exception '6: the topic the re-run dropped was DESTROYED rather than withdrawn';
  end if;
  raise notice 'CLAUSE 6 OK: the re-run counted both writes as its own, kept edge % with its first-covered date, and the dropped topic is archived.', v_edge;

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 7 — THE RANK LADDER SURVIVED THE REWRITE. A person's coverage still outranks the
  -- mapper, the mapper is still TOLD whose row it left alone, and her row is not touched.
  -- ════════════════════════════════════════════════════════════════════════════
  perform seo.set_page_map_topics(v_page,
    jsonb_build_array(jsonb_build_object('slug','crowns-and-bridges','confidence',100,'reason','she says this page is about crowns')),
    'human');
  select a.id into v_edge from platform.associations_live a
   where a.source_type='web_page' and a.source_id=v_page and a.target_type='seo_map_topic'
     and a.target_id=v_t_crown and a.role='covers';
  v_ans := seo.set_page_map_topics(v_page,
    jsonb_build_array(jsonb_build_object('slug','crowns-and-bridges','confidence',10,'reason','the robot disagrees')),
    'mapper');
  if (v_ans->>'covers')::int <> 0 then
    raise exception '7: the mapper overruled a person — it says it covered %', v_ans->>'covers';
  end if;
  if (v_ans->'kept_existing'->0->>'kept_existing') <> 'human' then
    raise exception '7: the mapper was not told whose row it left alone — %', v_ans->'kept_existing';
  end if;
  if (select (a.payload->>'confidence')::int from platform.associations a where a.id=v_edge) <> 100 then
    raise exception '7: the person''s confidence was overwritten by the robot';
  end if;
  raise notice 'CLAUSE 7 OK: a person still outranks the mapper, and the mapper is told whose row stands.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 8 — THE CENSUS, WHICH IS THE FORCING FUNCTION. Written as a POPULATION: every
  -- `seo` function that still destroys an association must be exactly the three MOVE doors,
  -- plus the brand mirror tails5a already reasoned. A converted door that quietly goes back
  -- to deleting fails here, and so does a fourth door nobody reasoned appearing later.
  -- ════════════════════════════════════════════════════════════════════════════
  select string_agg(fn, ', ' order by fn) into v_offend
    from (select p.proname as fn
            from pg_proc p
           where p.pronamespace = 'seo'::regnamespace
             and p.prosrc ~* 'delete\s+from\s+platform\.associations') s
   where fn not in ('merge_map_topics', '_tm_reject_topics', '_tm_remove_topics', '_map_brand_edge');
  if v_offend is not null then
    raise exception '8: seo door(s) still DESTROY an association with no reason on the record: %', v_offend;
  end if;
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'seo'::regnamespace
     and p.proname in ('set_site_map','set_page_intents','set_page_map_facet','set_map_topic_facet','set_page_map_topics')
     and p.prosrc ~* 'platform\.assoc_unset';
  if v_n <> 5 then
    raise exception '8: only % of the five converted doors call platform.assoc_unset', v_n;
  end if;
  raise notice 'CLAUSE 8 OK: all five set-doors go through platform.assoc_unset, and the only seo functions left destroying an edge are the three move-doors and the brand mirror.';

  raise notice 'ALL CLAUSES GREEN — a seo set-door withdraws an edge, and what she un-sets she can put back as itself.';
end $green$;

rollback;

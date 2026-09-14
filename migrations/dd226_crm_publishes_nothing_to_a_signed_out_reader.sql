-- dd226_crm_publishes_nothing_to_a_signed_out_reader
-- (DD-226. db-rules §0/§6d/§9. GRANTS ONLY — no DDL, no policy, no row touched.)
--
-- THE DOCTRINE THIS FILE APPLIES (DD-222, B-113): the bound of a signed-out surface is the set of
-- columns that surface renders. Where the four-repository census finds NO signed-out surface, the
-- bound is the EMPTY list — a declared "no signed-out reader exists" and a live `anon` column grant
-- cannot both be true, and the grant is the half that is wrong.
--
-- Every relation below carries, in `ANON_COLUMN_SURFACE` (lib/security/public-exposure.ts), the
-- DD-186 reason "No signed-out reader was found for it in the four-repository census — the bound is
-- what keeps a column added tomorrow from publishing itself". DD-186 wrote that sentence and then
-- left the columns granted. This file makes the grant agree with the sentence.
--
-- ═══ THE CENSUS, RE-RUN BY THIS LANE ══════════════════════════════════════════════════════════
-- matrx-frontend: every `.from("<table>")` / `.schema(...).from(...)` call site was enumerated and
--   each was checked against the set of code a signed-out visitor can actually execute — the files
--   under `app/(public)/**` (which are the only routes that name a table for an anonymous URL), and
--   the eight call sites of `getScriptSupabaseClient()`, which builds a client on the PUBLISHABLE
--   key and therefore runs as `anon` wherever it is called from. No relation below appears in
--   either set.
-- matrx-extend / matrx-local: no reader of any relation below.
-- aidream: reads this database as the service role or through matrx-orm; its one publishable-key
--   client always carries the caller's JWT.
-- `utils/permissions/publicLane.ts` (`PUBLIC_LANE_COLUMNS`) — the register that decides which types
--   get an indexable signed-out page at all — names `note`, `message_template` and `fc_set`. No type
--   below is in it, so `/p/e/<type>/<id>` does not exist for any of them and `publicLaneSelect()`
--   throws rather than inventing one.
--
-- ═══ RED, MEASURED AGAINST THE LIVE DATABASE, EVERY PROBE ROLLED BACK ═════════════════════════
--   crm.blocklist_entry — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (ERR Cannot read properties of undefined (reading 'slice')); the grant itself is the finding.
--   crm.contact_medium — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"c72b905e-7bc9-48da-9483-4f7e26515e86","channel":"email","platform_slug":null,"value_raw":"info@acmerobotics.com","value_key":"info@acmerobotics.com","display_value":"info@acmerobotics.com","external_id":null,"handle":null,"profile_url":null,"line_type":…
--   crm.deal — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (ERR Cannot read properties of undefined (reading 'slice')); the grant itself is the finding.
--   crm.enrichment_call — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (EMPTY-TABLE (anon cols: 18)); the grant itself is the finding.
--   crm.jurisdiction_policy — LIVE TO THE INTERNET RIGHT NOW — 35 row(s) readable by `anon` today. RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"country_code":"NO","country_name":"Norway","region":"EEA","cold_b2b":"unknown","cold_b2c":"unknown","conditions":"Not researched. ePrivacy is a DIRECTIVE — each member state implemented it differently, and art. 13(5) lets each decide whether the consent rule…
--   crm.outreach_list — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"ed2a968a-4503-4cf7-bf72-be1c54a964f8","name":"Phase 4 — first governed send","description":"Production Lane B proof from a real reputation case: preview, human approval, compliance refusal, then the first earned send.","list_kind":"email","status":"draf…
--   crm.party — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (ERR This write declares actor_tier=code, but names no actor_system. An agent or automated write must say WHICH agent/system it is (x-matrx-actor); the grant itself is the finding.
--   crm.registry_ingest_run — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (EMPTY-TABLE (anon cols: 28)); the grant itself is the finding.
--   crm.registry_source — LIVE TO THE INTERNET RIGHT NOW — 17 row(s) readable by `anon` today. RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"48033ca5-edb1-4553-8af9-7f87cbaaac84","slug":"crossref","label":"Crossref","homepage_url":"https://www.crossref.org/","terms_url":"https://www.crossref.org/documentation/retrieve-metadata/rest-api/","terms_version":"2026-08-14","licence_class":"permissi…
--   crm.saved_view — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"fe4b7f1e-56fb-441b-9407-6dd45392d03c","name":"Plastic surgery practices","description":null,"definition":{"kind":"organization","sort":"updated_at","search":"plastic","filters":{},"version":1,"direction":"desc","scopeKind":"mine","organizationId":null},…
--   crm.sending_identity — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"221aa330-65b7-4ccc-8e90-b7f5bed62461","display_name":"info@aimatrx.com","provider":"google_workspace","connection_id":"abdc64da-158d-4668-9d3a-950134130e7f","provider_account":"info@aimatrx.com","from_address":"info@aimatrx.com","from_address_key":"info…
--   crm.sending_policy — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"907332e4-d09b-4e37-9061-f4c0b735b650","outreach_enabled":true,"disabled_at":null,"disabled_by":null,"disabled_reason":null,"disabled_by_kind":null,"enabled_at":"2026-08-15T02:24:55.395Z","enabled_by":"4cf62e4e-2679-484f-b652-034e697418df","notes":null,"…
--
-- The relations whose row gate currently yields nothing to `anon` are latent exactly as
-- `agent.exemplar` was before DD-222: the grant is open and the data has simply not arrived on the
-- public side of the gate yet. Latency is an accident of data, never a decision.
--
-- Signed-in readers are untouched: the count of columns `authenticated` may SELECT is captured
-- before and asserted identical after, per relation. Columns are revoked BY NAME — a table-level REVOKE does not remove column grants (B-78
-- measured that on `docproc.processed_documents`) — and the loop takes the names from the catalog,
-- so it cannot miss one the way a hand-typed list can. It RAISES if a single column survives.
--
-- This file changes no row and no policy: `pub_read` is the generated DD-173 base contract and only
-- `iam.apply_rls` may write a policy (§6d).

do $$
declare
  r         record;
  v_col     record;
  v_before  int;
  v_after   int;
  v_auth    int;
  v_auth0   int;
  v_total   int;
  v_names   text;
begin
  for r in
    select unnest(array[
      'crm.blocklist_entry',
      'crm.contact_medium',
      'crm.deal',
      'crm.enrichment_call',
      'crm.jurisdiction_policy',
      'crm.outreach_list',
      'crm.party',
      'crm.registry_ingest_run',
      'crm.registry_source',
      'crm.saved_view',
      'crm.sending_identity',
      'crm.sending_policy'
    ]) as rel
  loop
    select count(*) filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')),
           count(*),
           count(*) filter (where has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')),
           string_agg(a.attname, ', ' order by a.attnum)
             filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT'))
      into v_before, v_total, v_auth0, v_names
      from pg_attribute a
     where a.attrelid = r.rel::regclass and a.attnum > 0 and not a.attisdropped;

    for v_col in
      select a.attname
        from pg_attribute a
       where a.attrelid = r.rel::regclass and a.attnum > 0 and not a.attisdropped
         and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')
       order by a.attnum
    loop
      execute format('revoke select (%I) on %s from anon', v_col.attname, r.rel);
    end loop;
    execute format('revoke select on %s from anon', r.rel);

    select count(*) filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')),
           count(*) filter (where has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT'))
      into v_after, v_auth
      from pg_attribute a
     where a.attrelid = r.rel::regclass and a.attnum > 0 and not a.attisdropped;

    if v_after <> 0 then
      raise exception 'dd226: anon still holds SELECT on % column(s) of %. The point of this file '
                      'is that the number is zero.', v_after, r.rel;
    end if;
    if has_table_privilege('anon', r.rel::regclass, 'SELECT') then
      raise exception 'dd226: anon still holds a table-level SELECT on %.', r.rel;
    end if;
    -- The signed-in reader must be EXACTLY as wide after as before. (Not "all columns":
    -- `files.files` legitimately gives `authenticated` 25 of its 28 — this file may not change
    -- that number in either direction.)
    if v_auth <> v_auth0 then
      raise exception 'dd226: authenticated SELECT on % moved from % to % column(s). This file may '
                      'only close the signed-out door.', r.rel, v_auth0, v_auth;
    end if;

    raise notice 'dd226: % closed to anon — % of % columns revoked (%), authenticated keeps % of % (unchanged).',
                 r.rel, v_before, v_total, coalesce(v_names, '(none)'), v_auth, v_total;
  end loop;
end $$;

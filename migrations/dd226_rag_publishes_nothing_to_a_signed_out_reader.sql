-- dd226_rag_publishes_nothing_to_a_signed_out_reader
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
--   rag.context_item_suggestions — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"10d72bb1-d2dc-4870-9734-931950ca7994","scope_type_id":"5155b79c-4c54-4694-b644-2e21ea6833b7","suggested_key":"related_models","display_name":"Related Models","rationale":"Identifies specific named architectures or systems referenced in the analysis (e.g…
--   rag.kg_alerts — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"6f2c0a8f-6f67-4774-bdab-67630b6cca65","source_kind":"note","source_id":"73410645-9d01-4847-b5d4-133da8ca0861","target_scope_id":"27ad1ec9-4bd7-4805-ad24-bf68c6abdeaa","target_slot_key":"applicant_name","kind":"new_info","severity":"fyi","description":"A…
--   rag.kg_sweep_queue — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"ea7a2846-19d5-4444-9eb8-7eabc1ccde26","change_type":"context_item","entity_id":"eedcc7a8-29b4-4501-befe-3f9f58494db7","scope_type_id":"37fd85b9-c25a-4b29-8048-e770bc8bd26f","status":"done","enqueued_at":"2026-07-22T17:34:13.570Z","claim_at":"2026-07-22T…
--   rag.kg_sweep_run — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"7b448f9a-ab31-463f-9bb1-d34bd5b68b32","run_id":"4d3c892c-0cdf-434e-b5f1-254763e2439e","trigger_type":"scope_type","trigger_entity_id":"0bd93465-61b4-45a4-9b87-9a2e9d70f956","scope_type_id":"0bd93465-61b4-45a4-9b87-9a2e9d70f956","status":"completed","cha…
--   rag.kg_value_matches — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"402a8cb5-eb19-4aa0-89db-402d6ac48e44","source_kind":"note","source_id":"4eaf3d69-9400-462b-bb60-f0f266217f5c","kg_entity_id":null,"target_scope_id":"c5c4a09d-6368-40c6-aae3-723ccc57d01f","target_context_item_id":"9efb64c3-929e-46af-aef1-50a5db9851de","t…
--   rag.ner_canonicalizer_shadow — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"23572021-5341-4833-8997-3403a8d6a4ed","source_kind":"note","source_id":"73410645-9d01-4847-b5d4-133da8ca0861","run_id":"00000000-0000-0000-0000-000000000000","input_pair_count":486,"agent_input_json":[{"kind":"date","name":"2023-11-16","mention_count":2…
--   rag.scope_suggestions — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"8d2d5bee-5866-46a3-bf2e-a2a4e399f30d","source_kind":"cld_file","source_id":"b4632ab2-9a6a-4e9e-8284-bd6fdeb434eb","scope_type_id":"58eb395c-7e2e-458a-97ad-f583a720d3c5","scope_type_label":"Matter","suggested_name":"Michael Summers Medical Evaluation","s…
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
      'rag.context_item_suggestions',
      'rag.kg_alerts',
      'rag.kg_sweep_queue',
      'rag.kg_sweep_run',
      'rag.kg_value_matches',
      'rag.ner_canonicalizer_shadow',
      'rag.scope_suggestions'
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

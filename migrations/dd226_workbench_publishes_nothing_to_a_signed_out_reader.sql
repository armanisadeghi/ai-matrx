-- dd226_workbench_publishes_nothing_to_a_signed_out_reader
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
-- KEPT IN THIS SCHEMA, NOT TOUCHED BY THIS FILE:
--   workbench.heatmap_saves — /free/zip-code-heatmap/[id] under app/(public) reads it directly. A REAL signed-out reader; its bound stays exactly what that page renders.
--
-- ═══ RED, MEASURED AGAINST THE LIVE DATABASE, EVERY PROBE ROLLED BACK ═════════════════════════
--   workbench.note_folders — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"6870dca6-c204-4592-87a0-ba370bcc9625","name":"Research","parent_id":null,"path":"Research","position":0,"created_at":"2026-07-24T04:51:55.862Z","updated_at":"2026-09-14T07:44:49.415Z","deleted_at":null,"visibility":"public"}…
--   workbench.udt_dataset_row_versions — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 7)); the grant itself is the finding.
--   workbench.udt_datasets — LIVE TO THE INTERNET RIGHT NOW — 7 row(s) readable by `anon` today. RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"4ddb39e5-8fa5-4236-b17b-ec2fe82e277a","table_name":"AG Pickup Data","description":"Imported table with 256 rows","is_public":true,"created_at":"2025-11-13T22:51:01.721Z","updated_at":"2026-08-15T06:44:37.150Z","row_ordering_config":null,"project_id":nul…
--   workbench.udt_document_snapshots — LIVE TO THE INTERNET RIGHT NOW — 74 row(s) readable by `anon` today. RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 6)); the grant itself is the finding.
--   workbench.udt_documents — LIVE TO THE INTERNET RIGHT NOW — 1 row(s) readable by `anon` today. RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"49b85ebf-af6e-43c8-9fc4-3f4e1ed17c34","document_name":"Workflow System — Core Evaluation Mandate & Vision Brief","description":"A complete capture of Arman's vision for evaluating and rebuilding the workflow system: ground rules, server-side stress-test…
--   workbench.udt_structured_lists — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"6a7822ca-859c-4903-87a3-c8243058dcc5","created_at":"2026-06-30T23:26:20.918Z","updated_at":"2026-09-14T07:44:52.733Z","list_name":"scene options","description":"Created from agent variable \"scene\".","is_public":true,"public_read":true,"visibility":"pu…
--   workbench.udt_workbooks — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"2d0e4674-91b3-47d1-a3ce-fa031361b690","workbook_name":"Untitled workbook","description":null,"source":"created","original_file_id":null,"project_id":null,"task_id":null,"is_public":true,"created_at":"2026-08-18T17:14:17.302Z","updated_at":"2026-09-14T07…
--   workbench.working_documents — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"ddc9ef65-348e-55ee-887c-58675ebfa0f7","title":"You are an AI Model Config Sync Agent. Your job is to...","content":"You are an AI Model Config Sync Agent. Cross-reference live provider docs with the database and update AI model records. Use web search a…
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
      'workbench.note_folders',
      'workbench.udt_dataset_row_versions',
      'workbench.udt_datasets',
      'workbench.udt_document_snapshots',
      'workbench.udt_documents',
      'workbench.udt_structured_lists',
      'workbench.udt_workbooks',
      'workbench.working_documents'
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

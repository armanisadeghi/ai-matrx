-- dd226_files_publishes_nothing_to_a_signed_out_reader
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
--   files.analysis — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 15)); the grant itself is the finding.
--   files.analysis_result — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 15)); the grant itself is the finding.
--   files.files — LIVE TO THE INTERNET RIGHT NOW — 200 row(s) readable by `anon` today. RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"ba264fbf-782c-416c-a899-e0ff72068f78","file_path":"Images/Generated/66fd3df6-fabf-4454-8494-f51dc821d70c/thumb.jpg","file_name":"thumb.jpg","mime_type":"image/jpeg","size_bytes":"43554","checksum":"011a06a04f6f8b2963d9542880a07aa24d5f61ec260d504f4038022…
--   files.folders — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"1baeb172-334e-4856-83c5-f97ecff0fdaa","folder_path":"system-files/scraper/web/d0aff5b6-0710-4848-8304-164db3c80ab7/sessions/bd90115a-109c-4170-b155-261f1fe4f94d","folder_name":"bd90115a-109c-4170-b155-261f1fe4f94d","parent_id":"679dba74-2e66-4b30-a345-a…
--   files.idempotency — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 9)); the grant itself is the finding.
--   files.uploads_inflight — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (ERR Cannot read properties of undefined (reading 'slice')); the grant itself is the finding.
--   files.webhook_deliveries — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 14)); the grant itself is the finding.
--   files.webhooks — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 12)); the grant itself is the finding.
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
      'files.analysis',
      'files.analysis_result',
      'files.files',
      'files.folders',
      'files.idempotency',
      'files.uploads_inflight',
      'files.webhook_deliveries',
      'files.webhooks'
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

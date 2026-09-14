-- dd226_workflow_publishes_nothing_to_a_signed_out_reader
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
--   workflow.card — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 11)); the grant itself is the finding.
--   workflow.comparison — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (EMPTY-TABLE (anon cols: 16)); the grant itself is the finding.
--   workflow.definition — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (ERR This write declares actor_tier=code, but names no actor_system. An agent or automated write must say WHICH agent/system it is (x-matrx-actor); the grant itself is the finding.
--   workflow.run — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (ERR Cannot read properties of undefined (reading 'slice')); the grant itself is the finding.
--   workflow.runtime_surface — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"d2b9c7a4-1e63-4f0b-8c5d-9a47e0f21b36","definition_id":"f6d0e4b2-7a91-4c58-b3aa-51e9c2d7f804","name":"Podcast run surface","audience":"consumer","profile":"full","is_default":true,"schema_version":1,"config":{"pages":[{"id":"brief","title":"Your brief"},…
--   workflow.template — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"04ea2fcd-323f-4ed9-ac25-773c57f55ca6","name":"Two-Step Pipeline","description":"Two Transform nodes wired in sequence. Teaches how output flows along an edge into the next node's input.","category":"Starter","definition":{"edges":[{"id":"e1","source":"f…
--   workflow.trigger — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (ERR Cannot read properties of undefined (reading 'slice')); the grant itself is the finding.
--   workflow.trigger_event — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 13)); the grant itself is the finding.
--   workflow.v_definition_catalog — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (ERR column "ctid" does not exist); the grant itself is the finding.
--   workflow.v_engram_confirmed_run — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 4)); the grant itself is the finding.
--   workflow.work_item — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 17)); the grant itself is the finding.
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
      'workflow.card',
      'workflow.comparison',
      'workflow.definition',
      'workflow.run',
      'workflow.runtime_surface',
      'workflow.template',
      'workflow.trigger',
      'workflow.trigger_event',
      'workflow.v_definition_catalog',
      'workflow.v_engram_confirmed_run',
      'workflow.work_item'
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

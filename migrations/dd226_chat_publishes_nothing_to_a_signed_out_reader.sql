-- dd226_chat_publishes_nothing_to_a_signed_out_reader
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
--   chat.agent_memory — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"ca44a7d6-8e01-4d61-b7e3-4a3e360fe58f","memory_type":"long","scope":"user","scope_id":null,"key":"user_role_project","content":"User is the Admin on this project and is an agent. They work full-time on the AI Matrx project to improve it continuously. The…
--   chat.agent_run — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"89b9337a-4ba7-40da-8194-b80f4a35c137","kind":"content_plan.deepen","status":"completed","input_fingerprint":null,"request":{"route":"/practice-areas/epli-policy-defense","node_id":"2c5eff52-1ecf-41d6-980b-8577918d6f3c","site_id":"8cc4ba7b-2817-47f4-aef6…
--   chat.conversation — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"789b506f-036d-5be7-b2d5-ad08a80c1b13","title":"We just went through and created a new sort of vocabulary system, and that did…","system_instruction":null,"config":{},"status":"active","message_count":2,"forked_from_id":null,"forked_at_position":null,"cr…
--   chat.user_request — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"96a48e8d-43d8-4e05-bebf-c97f5af5643c","total_input_tokens":70576,"total_output_tokens":3623,"total_cached_tokens":94128,"total_tokens":168327,"total_cost":"0.578723","total_duration_ms":57973,"api_duration_ms":56592,"tool_duration_ms":845,"iterations":6…
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
      'chat.agent_memory',
      'chat.agent_run',
      'chat.conversation',
      'chat.user_request'
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

-- dd226_users_publishes_nothing_to_a_signed_out_reader
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
--   users.feedback_comments — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 6)); the grant itself is the finding.
--   users.guest_execution_log — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 14)); the grant itself is the finding.
--   users.guest_executions — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 15)); the grant itself is the finding.
--   users.invitation_requests — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"78c3b224-8677-456f-b33b-20a6cc90266c","status":"pending"}…
--   users.profiles — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"a4955b5c-d524-4d72-a90e-0658d5d51148","display_name":"developer111","avatar_url":"https://avatars.githubusercontent.com/u/297194136?v=4","status_text":null,"is_online":false,"last_seen_at":null,"created_at":"2026-07-21T16:57:47.164Z","updated_at":"2026-…
--   users.system_announcements — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"77b29cdb-ab5d-484d-95c1-1e1e21aae936","title":"Major System Updates!","message":"Significant updates across system!\n\nThings will definitely be broken and there will be new bugs. Please report all bugs asap!\n\nNew Bug Submission Feature: Click the \"S…
--   users.user_achievements — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (EMPTY-TABLE (anon cols: 8)); the grant itself is the finding.
--   users.user_analysis_preferences — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 8)); the grant itself is the finding.
--   users.user_follows — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 4)); the grant itself is the finding.
--   users.user_form_profile — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 32)); the grant itself is the finding.
--   users.user_markdown_samples — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"35ac35e6-e15f-4526-89b8-ec02ca51e7b5","name":"Phase C Draft","description":"Written by the agent during verification.","content":"# Phase C\n\nBuffer for the entity-target checks.\n","detected_blocks":[],"created_at":"2026-08-10T01:19:01.999Z","updated_…
--   users.user_memory — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (ERR Cannot read properties of undefined (reading 'slice')); the grant itself is the finding.
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
      'users.feedback_comments',
      'users.guest_execution_log',
      'users.guest_executions',
      'users.invitation_requests',
      'users.profiles',
      'users.system_announcements',
      'users.user_achievements',
      'users.user_analysis_preferences',
      'users.user_follows',
      'users.user_form_profile',
      'users.user_markdown_samples',
      'users.user_memory'
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

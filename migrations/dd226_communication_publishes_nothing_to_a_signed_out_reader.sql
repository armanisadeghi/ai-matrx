-- dd226_communication_publishes_nothing_to_a_signed_out_reader
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
--   communication.dm_conversations — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"c5e65aec-7be1-4d74-bf74-8155161c30b3","type":"direct","group_name":null,"group_image_url":null,"created_at":"2026-08-11T22:33:45.193Z","updated_at":"2026-09-14T07:43:50.955Z","deleted_at":null,"visibility":"public"}…
--   communication.meet_call_invites — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (EMPTY-TABLE (anon cols: 16)); the grant itself is the finding.
--   communication.meet_meetings — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"352873e0-5376-49d2-9e83-fe08af06196d","room_name":"canary-c7-0908-172542","slug":"canary-c7-0908-172542","title":"MRI-C7 recording proof","kind":"instant","host_user_id":"87a6e699-3622-4869-8843-d0867456c0dd","scheduled_for":null,"scheduled_duration_min…
--   communication.notification — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"e5994e00-f518-4609-b56c-2d232b63fd03","event_key":"cms.form_submission","recipient_user_id":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","channel":"email","dedupe_key":"e2e-test-notification-spine-1:email","payload":{"link":{"inbox":"https://aimatrx.com/cms/e…
--   communication.notification_event_override — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (ERR Cannot read properties of undefined (reading 'slice')); the grant itself is the finding.
--   communication.notification_event_type — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"719f1646-ceb2-435f-935f-90b34f970beb","event_key":"hr.time.attestation_request","label":"Attestation requested","description":"An attestation is required — a break or meal waiver, or a period close.","default_channels":{"sms":true,"email":true,"in_app":…
--   communication.notification_preference — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"65b4fb9e-067f-4bcd-8811-caceef634662","event_key":"cms.form_submission","channel":"email","enabled":true,"created_at":"2026-09-12T04:51:49.220Z","updated_at":"2026-09-14T07:43:56.042Z","deleted_at":null,"visibility":"public"}…
--   communication.sms_consent — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"bba70b26-2493-4e31-be39-f56413b56633","consent_type":"transactional","status":"opted_in","opted_in_at":"2026-02-14T02:38:20.731Z","opted_out_at":null,"opt_in_method":"web_form","opt_out_method":null,"opt_in_keyword":null,"opt_out_keyword":null,"created_…
--   communication.sms_conversations — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"1c36b60b-71a2-47a7-b7a8-e9411e33348d","external_phone_number":"zzz.hrb001.verify@example.invalid","our_phone_number":"+14158059951","status":"active","conversation_type":"notification","ai_agent_id":null,"last_message_at":"2026-08-28T17:16:46.632Z","las…
--   communication.sms_notification_preferences — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"07e5f7cb-c890-4305-90ca-33c41c1f7666","sms_enabled":true,"dm_notifications":false,"task_notifications":true,"job_completion_notifications":false,"system_alerts":true,"marketing_messages":false,"ai_agent_messages":true,"quiet_hours_enabled":true,"quiet_h…
--   communication.sms_notifications — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"e7ef9f52-59f0-4566-9d0c-793afe4e1f5e","message_id":null,"notification_type":"task_due_date","category":"transactional","reference_type":"task","reference_id":"fdc1641c-2d3c-4120-af0f-bdc4af6f30e5","status":"skipped","failure_reason":"sms_program_not_enr…
--   communication.sms_phone_numbers — Latent (the grant is open; no row is on the public side of the gate today). RED, one row flipped to visibility='public' inside a rolled-back transaction and read AS ANON: {"id":"9de3f283-e4cc-4a6f-963c-b8cec9fff279","twilio_sid":"PN_placeholder_sid","friendly_name":"AI Matrx Main","capabilities":{"mms":true,"sms":true,"voice":false},"number_type":"local","is_active":true,"assigned_at":"2026-02-14T01:45:22.113Z","released_at":nu…
--   communication.sms_rate_limits — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 4)); the grant itself is the finding.
--   communication.sms_webhook_logs — Latent (the grant is open; no row is on the public side of the gate today). RED not expressible by a visibility flip (NO-VISIBILITY-COLUMN (anon cols: 15)); the grant itself is the finding.
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
      'communication.dm_conversations',
      'communication.meet_call_invites',
      'communication.meet_meetings',
      'communication.notification',
      'communication.notification_event_override',
      'communication.notification_event_type',
      'communication.notification_preference',
      'communication.sms_consent',
      'communication.sms_conversations',
      'communication.sms_notification_preferences',
      'communication.sms_notifications',
      'communication.sms_phone_numbers',
      'communication.sms_rate_limits',
      'communication.sms_webhook_logs'
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

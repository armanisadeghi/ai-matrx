-- W4-ANON — THE GREEN SUITE. DOOR-17 · DOOR-19 · DOOR-20 · DOOR-21.
--
-- RUN IT against the MAIN database:
--   "$PSQL" "$MAIN_DSN" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w4_anon_green.sql
--
-- Not a migration. EVERYTHING ROLLS BACK: the disposable organization it makes, its
-- memberships, its knob override, its Table, its form, its tokens and every submission.
-- ITS RED TWIN is `scripts/campaign-tests/w4_anon_red.sql`.
--
-- EVERY REFUSAL HERE IS PAIRED WITH A POSITIVE CONTROL, because this is the campaign's only
-- unauthenticated surface and "it refused" is worthless without "and the legitimate call
-- succeeded one line earlier". The replay is counted as ROWS rather than asserted as an absence
-- of errors, for the same reason.
--
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). This lane has TWO callers and the suite now keeps
-- them apart instead of running everything as the role that owns `custom.record`:
--
--   THE SERVER. `custom.anon_write`, `custom.anon_token_verify` and `custom.anon_inbound_land`
--   carry server_only reasons in `platform.client_callable_door`, and rightly: the server is
--   what holds the token and reads the request Origin header, and a browser handing the
--   function an origin string would be stating its own origin, which is not a check. Every
--   clause about those three STEPS OUT of the seat for exactly that statement and says why.
--   The same goes for the two internal ledgers `custom.anon_hit` and `custom.anon_replay`,
--   which are steps of the write path and carry no client grant.
--
--   THE PERSON. Everything an ADMIN of the Table does runs from the seat `authenticated`,
--   proved in PART 0, through the doors: `custom.anon_token_issue`, `custom.anon_token_revoke`,
--   `custom.anon_publish`, `custom.anon_capture`, and `custom.anon_submissions` — the read of
--   what landed, which THIS LANE HAD TO BUILD (migrations/campaign/
--   seatsuites_the_quarantine_has_a_door.sql). Until it existed nothing a person could call
--   could see a quarantined submission at all, so every "and this is what landed" clause in
--   this file could only be made by reading the table as its owner.
--
-- PART 9 is new and is the question the old seat could not ask: `test@test.com` is a member of
-- this organization who is not an admin of the Table, and the triage read, the publish door and
-- the token door all refuse her — paired with the one thing she CAN do.
--
-- STILL NO DOOR, and it steps out and says so: creating an `custom.anon_form` row. There is no
-- client verb that makes a form; `custom.anon_publish` only opens one that already exists.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w4_anon_green.sql'
\set requires 'grant:authenticated:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

select set_config('zz.boss', current_user, true);
select set_config('app.actor_system', 'campaign.w4_anon.green', true);

update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key in ('associations_guard', 'accessible_entity_ids_guard');

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- FIXTURES, as the connected role. A seat is a PERSON.
-- ════════════════════════════════════════════════════════════════════════════════════════════
do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid;
begin
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Trailhead & Torch Journeys', 'trailhead-torch-journeys-' || substr(v_org::text, 1, 8), 'TTJ', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- Without this the store is switched off globally and every door refuses a person.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w4_anon_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;
  perform set_config('zz.org', v_org::text, true);
  perform set_config('zz.home', v_home::text, true);
end $fixture$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- PART 0 — THE SEAT. Everything after this line runs as a signed-in person unless it says so.
-- ════════════════════════════════════════════════════════════════════════════════════════════
do $part0$
begin
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';
end $part0$;

-- THE TABLE AND ITS FIELDS, THROUGH THE DOORS. `internal_note` is deliberately declared and
-- deliberately NOT exposed by the form: it is the key PART 3 tries to push through the door.
do $tables$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_t   uuid;
begin
  v_t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Trip Enquiries', 'slug', 'trip_enquiries', 'type', 'entity', 'display', 'list',
    'label_singular', 'Enquiry', 'label_plural', 'Enquiries', 'ordered', false, 'weight', 'light',
    'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
    'parent_id', current_setting('zz.home'), 'title_field', 'name', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','name'),
                                jsonb_build_object('name','message'),
                                jsonb_build_object('name','internal_note'))));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key','name','label','Name','plain','text','sort',10));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key','message','label','Message','plain','text','sort',20));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key','internal_note','label','Internal note','plain','text','sort',30));
  perform set_config('zz.tenq', v_t::text, true);
end $tables$;

-- THE FORM. There is NO client door that creates one — `custom.anon_publish` only opens a form
-- that already exists — so this one fixture step is made as the connected role and says so, and
-- asserts nothing while it is out. Every verb that acts ON the form below is a door.
select set_config('role', current_setting('zz.boss'), true);
insert into custom.anon_form (organization_id, table_id, slug, title,
                              exposed_field_keys, required_field_keys,
                              rate_limit_per_window, rate_limit_window)
values (current_setting('zz.org')::uuid, current_setting('zz.tenq')::uuid,
        'plan-my-trip', 'Plan my trip',
        '["name","message"]'::jsonb, '["name"]'::jsonb,
        2, interval '1 hour')
returning set_config('zz.form', id::text, true) as form_id;
select set_config('role', 'authenticated', true);

\echo ''
\echo '══ PART 1 — DOOR-17: CLOSED BY DEFAULT, and only an explicit publish act opens it'
\echo ''

do $p1$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org    uuid := current_setting('zz.org')::uuid;
  v_secret text;
  v_tok    uuid;
  v_err    text;
  v_at     timestamptz;
  v_boss   text := current_setting('zz.boss');
begin
  -- ISSUING A WRITE TOKEN IS AN ADMIN ACT ON THE TABLE, and it is a DOOR: from the seat, as
  -- admin@admin.com. Everything the token then does is the anonymous caller's, and the SERVER
  -- is what performs that — see below.
  perform set_config('request.jwt.claims', c_admin_j, true);
  select token_id, secret into v_tok, v_secret
    from custom.anon_token_issue(v_org, 'write', '["https://example.test"]'::jsonb,
                                 current_setting('zz.form')::uuid);
  if v_tok is null or v_secret is null then
    raise exception 'DOOR-20 FAIL: the token door gave a signed-in admin no token at all';
  end if;
  perform set_config('zz.secret', v_secret, true);
  perform set_config('zz.token', v_tok::text, true);

  -- THE FORM EXISTS AND IS NOT PUBLISHED. It must refuse.
  -- `custom.anon_write` is declared SERVER-ONLY: the server holds the token and reads the
  -- request Origin header, and there is no account behind this call at all. So it runs out of
  -- the seat, with NO principal, which is exactly what it has in life.
  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform custom.anon_write(v_secret, 'https://example.test', '{"name":"Ada"}'::jsonb);
    raise exception 'DOOR-17 FAIL: an unpublished form accepted a submission';
  exception when sqlstate '42501' then
    v_err := sqlerrm;
  end;
  perform set_config('role', 'authenticated', true);
  if v_err not ilike '%not accepting responses%' then
    raise exception 'DOOR-17 FAIL: the refusal for an unpublished form reads "%", which does not say the form is closed', v_err;
  end if;

  -- THE POSITIVE CONTROL: an admin PUBLISHES — through the door, from the seat — and the
  -- identical call works. Without this the refusal above could be any of the five checks.
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_at := custom.anon_publish(v_org, current_setting('zz.form')::uuid);
  if v_at is null then
    raise exception 'DOOR-17 FAIL: publishing returned no timestamp, so the form is still closed';
  end if;

  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', '', true);
  perform custom.anon_write(v_secret, 'https://example.test', '{"name":"Ada"}'::jsonb);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  raise notice 'PART 1 PASS: the form refused with "%" while unpublished, and the identical submission landed once an admin published it through the publish door', left(v_err, 48);
end $p1$;

\echo ''
\echo '══ PART 2 — DOOR-17: the submission is QUARANTINED, not a record'
\echo ''

do $p2$
declare
  v_org  uuid := current_setting('zz.org')::uuid;
  v_sub  record;
  v_recs integer;
begin
  -- THROUGH THE TRIAGE DOOR, from the seat. `custom.anon_submission` carries no client grant:
  -- before `custom.anon_submissions` existed this clause could only be made by reading the
  -- table as its owner, which is not a thing any screen can do.
  select * into v_sub
    from custom.anon_submissions(v_org, current_setting('zz.tenq')::uuid, null, 100, 0) s
   order by s.created_at desc limit 1;
  if v_sub is null then
    raise exception 'DOOR-17 FAIL: the submission that landed in PART 1 is invisible to an admin of the Table';
  end if;

  if v_sub.state <> 'quarantined' then
    raise exception 'DOOR-17 FAIL: an anonymous submission was born in state "%", and the only state it may be born in is quarantined', v_sub.state;
  end if;
  if v_sub.record_id is not null then
    raise exception 'DOOR-17 FAIL: the submission already points at record % — record_id IS the quarantine', v_sub.record_id;
  end if;
  if v_sub.source <> 'anonymous' then
    raise exception 'DOOR-17 FAIL: the submission''s source is "%" and must be stamped anonymous', v_sub.source;
  end if;

  -- AND NOTHING REACHED THE STORE. Asked of the READ DOOR, which is what a screen has: the
  -- Table holds no record at all.
  select count(*) into v_recs
    from custom.read_records(v_org, current_setting('zz.tenq')::uuid, false, 200, 0);
  if v_recs <> 0 then
    raise exception 'DOOR-17 FAIL: an anonymous write put % row(s) into the Table. A submission is not a record until a Rule clears it.', v_recs;
  end if;

  raise notice 'PART 2 PASS: the triage door shows one submission, quarantined, source "anonymous", record_id null — and the read door shows the Table holding 0 records';
end $p2$;

\echo ''
\echo '══ PART 3 — DOOR-17: the token is scoped to the form''s exposed fields'
\echo ''

-- THE WHOLE OF PART 3 IS THE SERVER'S LANE and says so: every clause is about what
-- `custom.anon_write` does with a payload, and that function is declared server_only.
select set_config('role', current_setting('zz.boss'), true);
select set_config('request.jwt.claims', '', true);

do $p3$
declare v_err text;
begin
  begin
    perform custom.anon_write(current_setting('zz.secret'), 'https://example.test',
                              '{"name":"Mallory","internal_note":"I should not be able to set this"}'::jsonb);
    raise exception 'DOOR-17 FAIL: a key the form does not expose was accepted';
  exception when sqlstate '42501' then
    v_err := sqlerrm;
  end;
  if v_err not ilike '%internal_note%' then
    raise exception 'DOOR-17 FAIL: the refusal does not NAME the offending field: "%"', v_err;
  end if;

  -- A REQUIRED FIELD LEFT EMPTY IS REFUSED BY ITS OWN NAME, so a screen can point at it.
  begin
    perform custom.anon_write(current_setting('zz.secret'), 'https://example.test',
                              '{"message":"no name here"}'::jsonb);
    raise exception 'DOOR-17 FAIL: a submission missing a required field was accepted';
  exception when sqlstate '22004' then
    if sqlerrm not ilike '%name%' then
      raise exception 'DOOR-17 FAIL: the missing-field refusal does not name the field: "%"', sqlerrm;
    end if;
  end;

  raise notice 'PART 3 PASS: an unexposed key was refused BY NAME ("%"), and a missing required field was refused by its own name — neither was silently dropped', left(v_err, 52);
end $p3$;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
                  '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);

\echo ''
\echo '══ PART 4 — DOOR-20: the origin list is exact, and revocation is final'
\echo ''

do $p4$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := current_setting('zz.org')::uuid;
  v_boss text := current_setting('zz.boss');
  v_err  text;
  v_sub  uuid;
begin
  -- THE SERVER'S THREE STATEMENTS, out of the seat, with no principal — the anonymous caller.
  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', '', true);

  -- THE POSITIVE CONTROL FIRST: the listed origin works.
  v_sub := custom.anon_write(current_setting('zz.secret'), 'https://example.test',
                             '{"name":"Grace"}'::jsonb);
  if v_sub is null then
    raise exception 'DOOR-20 FAIL: the LISTED origin was refused, so the refusal below proves nothing';
  end if;

  -- AN UNLISTED ORIGIN IS REFUSED BY NAME. Not a suffix match: the near-miss below would pass a
  -- suffix check and is exactly how this class of check is usually broken.
  begin
    perform custom.anon_write(current_setting('zz.secret'), 'https://example.test.evil.test',
                              '{"name":"Mallory"}'::jsonb);
    raise exception 'DOOR-20 FAIL: a near-miss origin (https://example.test.evil.test) was accepted';
  exception when sqlstate '42501' then
    v_err := sqlerrm;
  end;
  perform set_config('role', 'authenticated', true);
  if v_err not ilike '%evil.test%' then
    raise exception 'DOOR-20 FAIL: the origin refusal does not name the origin: "%"', v_err;
  end if;

  -- REVOCATION IS THE PERSON'S ACT, and it is a door: from the seat, as the admin.
  perform set_config('request.jwt.claims', c_admin_j, true);
  if not custom.anon_token_revoke(v_org, current_setting('zz.token')::uuid) then
    raise exception 'DOOR-20 FAIL: revoking the token reported that it changed nothing';
  end if;

  -- After it, even the listed origin is refused, and it says why.
  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform custom.anon_write(current_setting('zz.secret'), 'https://example.test',
                              '{"name":"Ada again"}'::jsonb);
    raise exception 'DOOR-20 FAIL: a REVOKED token still wrote';
  exception when sqlstate '42501' then
    if sqlerrm not ilike '%revoked%' then
      raise exception 'DOOR-20 FAIL: the post-revocation refusal reads "%" and does not say it was revoked', sqlerrm;
    end if;
  end;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  raise notice 'PART 4 PASS: the listed origin wrote, a near-miss origin was refused by name ("%"), and after an admin revoked the token through the revoke door the same listed origin is refused as revoked', left(v_err, 44);
end $p4$;

\echo ''
\echo '══ PART 5 — DOOR-17: the rate limit refuses the (n+1)th, by name'
\echo ''

do $p5$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org    uuid := current_setting('zz.org')::uuid;
  v_boss   text := current_setting('zz.boss');
  v_secret text; v_tok uuid; v_err text; v_n integer; v_rows integer;
begin
  -- A FRESH TOKEN, through the door, as the admin.
  perform set_config('request.jwt.claims', c_admin_j, true);
  select token_id, secret into v_tok, v_secret
    from custom.anon_token_issue(v_org, 'write', '["https://example.test"]'::jsonb,
                                 current_setting('zz.form')::uuid);

  -- THE SERVER SIDE. The form's limit is 2 per hour. TWO succeed — that is the positive
  -- control — and the THIRD is refused by name. `custom.anon_hit`, the window ledger, is a step
  -- of the write path and carries no client grant, so it is read here and not from the seat.
  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', '', true);
  perform custom.anon_write(v_secret, 'https://example.test', '{"name":"One"}'::jsonb);
  perform custom.anon_write(v_secret, 'https://example.test', '{"name":"Two"}'::jsonb);
  begin
    perform custom.anon_write(v_secret, 'https://example.test', '{"name":"Three"}'::jsonb);
    raise exception 'DOOR-17 FAIL: the third submission passed a limit of 2 per window';
  exception when sqlstate '53400' then
    v_err := sqlerrm;
  end;

  -- AND THE COUNT IS ROWS — ONE row per (token, window), which is what makes the count atomic
  -- under concurrency rather than a read-then-write race. It reads 2, not 3: the refusal is
  -- raised inside the same statement that incremented, so the third attempt's increment rolls
  -- back with it. That is the right behaviour and the limit still holds — the next attempt
  -- increments 2 to 3, is refused, and rolls back to 2 again, forever.
  select count(*), max(hits) into v_rows, v_n from custom.anon_hit
   where organization_id = v_org and bucket = v_tok::text;

  -- AND IT STAYS REFUSED. A limit that only bites once is not a limit.
  begin
    perform custom.anon_write(v_secret, 'https://example.test', '{"name":"Four"}'::jsonb);
    raise exception 'DOOR-17 FAIL: the FOURTH submission got through, so the refusal did not stick';
  exception when sqlstate '53400' then null;
  end;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  if v_err not ilike '%too many%' then
    raise exception 'DOOR-17 FAIL: the rate refusal reads "%" and does not say what happened', v_err;
  end if;
  if v_rows <> 1 then
    raise exception 'DOOR-17 FAIL: the window is % rows for one token; a per-request row cannot be counted atomically', v_rows;
  end if;
  if v_n <> 2 then
    raise exception 'DOOR-17 FAIL: the window row holds % accepted writes, and exactly 2 were accepted', v_n;
  end if;

  -- AND THE TWO THAT WERE ACCEPTED ARE VISIBLE TO THE PERSON WHO HAS TO TRIAGE THEM, through
  -- the triage door, from the seat.
  select count(*) into v_rows
    from custom.anon_submissions(v_org, current_setting('zz.tenq')::uuid, 'quarantined', 200, 0) s
   where s.payload ->> 'name' in ('One', 'Two');
  if v_rows <> 2 then
    raise exception 'DOOR-17 FAIL: two submissions were accepted and the triage door shows %', v_rows;
  end if;

  raise notice 'PART 5 PASS: 2 of 2 accepted, the 3rd refused with "%", the window is ONE row holding exactly the 2 accepted writes, the 4th is refused too — and an admin sees both accepted ones through the triage door', left(v_err, 40);
end $p5$;

\echo ''
\echo '══ PART 6 — DOOR-21: three replays of two captures are TWO rows'
\echo ''

do $p6$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org    uuid := current_setting('zz.org')::uuid;
  v_boss   text := current_setting('zz.boss');
  v_secret text; v_tok uuid; v_ids uuid[] := array[]::uuid[]; v_i integer;
  v_rows integer; v_replays integer;
begin
  perform set_config('request.jwt.claims', c_admin_j, true);
  select token_id, secret into v_tok, v_secret
    from custom.anon_token_issue(v_org, 'write', '["https://example.test"]'::jsonb,
                                 current_setting('zz.form')::uuid);

  -- The form's limit would refuse the replays on their own, which would make this test pass for
  -- the wrong reason. Raising it is a change to the form row, and no client verb edits a form —
  -- the same gap PART 1's fixture names — so it steps out with the server's statements below.
  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', '', true);
  update custom.anon_form set rate_limit_per_window = 100
   where organization_id = v_org and id = current_setting('zz.form')::uuid;

  -- The CLIENT mints the ids. Two captures, replayed three times each, in the order a flaky
  -- network actually produces.
  for v_i in 1 .. 3 loop
    v_ids := v_ids || custom.anon_write(v_secret, 'https://example.test',
                                        '{"name":"Offline A"}'::jsonb, 'trailhead-website-capture');
    v_ids := v_ids || custom.anon_write(v_secret, 'https://example.test',
                                        '{"name":"Offline B"}'::jsonb, 'partner-portal-key');
  end loop;
  -- `custom.anon_replay` is the write path's own ledger and carries no client grant.
  select coalesce(sum(replays), 0) into v_replays from custom.anon_replay
   where organization_id = v_org and client_key in ('trailhead-website-capture', 'partner-portal-key');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- COUNTED AS ROWS, never asserted as an absence of errors — and counted THROUGH THE TRIAGE
  -- DOOR, which is where a person would notice six attempts had become two.
  select count(*) into v_rows
    from custom.anon_submissions(v_org, current_setting('zz.tenq')::uuid, null, 200, 0) s
   where s.client_key in ('trailhead-website-capture', 'partner-portal-key');
  if v_rows <> 2 then
    raise exception 'DOOR-21 FAIL: two client-minted ids replayed three times each produced % submission rows, and the answer is 2', v_rows;
  end if;
  if array_length(array(select distinct unnest(v_ids)), 1) <> 2 then
    raise exception 'DOOR-21 FAIL: the six calls returned % distinct ids; every replay must return the id the first one made', array_length(array(select distinct unnest(v_ids)), 1);
  end if;
  if v_replays <> 4 then
    raise exception 'DOOR-21 FAIL: four replays happened and the ledger counted %, so a client stuck in a loop would be invisible', v_replays;
  end if;

  raise notice 'PART 6 PASS: 6 calls, 2 client-minted ids, 2 rows on the triage door, the same 2 ids returned every time, and the 4 extra attempts are COUNTED rather than discarded';
end $p6$;

\echo ''
\echo '══ PART 7 — DOOR-19: an inbound address lands a record with its source stamped'
\echo ''

do $p7$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org    uuid := current_setting('zz.org')::uuid;
  v_boss   text := current_setting('zz.boss');
  v_secret text := 'torchlight-partner-secret';
  v_id     uuid;
  v_sub    record;
begin
  -- THE WHOLE INBOUND LANE IS THE SERVER'S: `custom.anon_inbound_land` takes no organization id
  -- and no table id BY DESIGN — the ADDRESS supplies both — and the transport that holds the
  -- address and the shared secret is the webhook endpoint, not a browser. There is no client
  -- verb that registers an address either, so the fixture row is written here too.
  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', '', true);
  insert into custom.anon_inbound (organization_id, table_id, channel, address, secret_hash, source)
  values (v_org, current_setting('zz.tenq')::uuid, 'webhook',
          'partner-booking-webhook', encode(digest(v_secret, 'sha256'), 'hex'), 'webhook');

  -- THE POSITIVE CONTROL: the right secret lands a submission.
  v_id := custom.anon_inbound_land('partner-booking-webhook', v_secret,
                                   '{"name":"From a webhook"}'::jsonb,
                                   '{"headers":{"x-source":"zapier"},"body":"raw"}'::jsonb);

  -- THE WRONG SECRET IS REFUSED.
  begin
    perform custom.anon_inbound_land('partner-booking-webhook', 'wrong', '{"name":"Nope"}'::jsonb);
    raise exception 'DOOR-19 FAIL: the wrong shared secret landed a submission';
  exception when sqlstate '42501' then null;
  end;

  -- AN UNKNOWN ADDRESS IS REFUSED WITHOUT CONFIRMING ANYTHING ABOUT IT.
  begin
    perform custom.anon_inbound_land('no-such-inbound-address', v_secret, '{"name":"Nope"}'::jsonb);
    raise exception 'DOOR-19 FAIL: an unknown inbound address accepted a delivery';
  exception when sqlstate '42501' then null;
  end;

  -- WHAT LANDED IS THE PERSON'S QUESTION, and it is asked from the seat, through the triage
  -- door: a webhook a person cannot see is a webhook nobody can answer for.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  select * into v_sub
    from custom.anon_submissions(v_org, current_setting('zz.tenq')::uuid, null, 200, 0) s
   where s.id = v_id;
  if v_sub is null then
    raise exception 'DOOR-19 FAIL: the webhook''s submission is invisible to an admin of the Table';
  end if;
  if v_sub.source <> 'webhook' then
    raise exception 'DOOR-19 FAIL: the submission''s source is "%" and the address stamps webhook', v_sub.source;
  end if;
  if v_sub.raw_payload -> 'headers' ->> 'x-source' <> 'zapier' then
    raise exception 'DOOR-19 FAIL: the originating payload did not reach the person — "why does the record say this" is then unanswerable';
  end if;
  if v_sub.state <> 'quarantined' then
    raise exception 'DOOR-19 FAIL: the webhook''s submission is in state "%" and an inbound delivery is quarantined like any other stranger''s', v_sub.state;
  end if;

  raise notice 'PART 7 PASS: the webhook landed one quarantined submission with source "webhook" and its originating headers, and an admin reads all of it on the triage door; the wrong secret and an unknown address were both refused';
end $p7$;

\echo ''
\echo '══ PART 8 — DOOR-21: the person''s OWN capture door, offline and replayed'
\echo ''

do $p8$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := current_setting('zz.org')::uuid;
  v_a    uuid;
  v_b    uuid;
  v_rows integer;
begin
  -- `custom.anon_capture` is the one verb in this lane that IS a signed-in person's, and it is
  -- the OTHER half of DOOR-21: the field worker's app, offline, minting its own id and syncing
  -- when it reconnects. Because there IS a principal it is not a stranger's submission at all —
  -- it takes EDITOR on the Table and writes a RECORD — and that is exactly why it is asked from
  -- the seat, where `custom.has_visibility` actually decides.
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_a := custom.anon_capture(v_org, 'roadshow-kiosk-capture', current_setting('zz.tenq')::uuid,
                             '{"name":"Captured in the van","message":"no signal"}'::jsonb,
                             'field-tablet', now());
  if v_a is null then
    raise exception 'DOOR-21 FAIL: the capture door gave a signed-in admin nothing at all';
  end if;

  -- THE REPLAY, twice: the same client-minted key comes back as the same record, whatever the
  -- device believes. A reconnect that cannot tell a retry from a second capture is how one
  -- enquiry becomes three.
  v_b := custom.anon_capture(v_org, 'roadshow-kiosk-capture', current_setting('zz.tenq')::uuid,
                             '{"name":"Captured in the van","message":"no signal"}'::jsonb,
                             'field-tablet', now());
  if v_b <> v_a then
    raise exception 'DOOR-21 FAIL: replaying one client-minted capture key returned % and then %', v_a, v_b;
  end if;
  v_b := custom.anon_capture(v_org, 'roadshow-kiosk-capture', current_setting('zz.tenq')::uuid,
                             '{"name":"Captured in the van","message":"no signal"}'::jsonb,
                             'field-tablet', now());
  if v_b <> v_a then
    raise exception 'DOOR-21 FAIL: the third replay of one client-minted capture key returned %', v_b;
  end if;

  -- COUNTED AS ROWS THROUGH THE READ DOOR, never asserted as an absence of errors: three calls,
  -- one record, and it reads back with the values the van typed.
  select count(*) into v_rows
    from custom.read_records(v_org, current_setting('zz.tenq')::uuid, false, 200, 0) rr
   where rr.document ->> 'name' = 'Captured in the van';
  if v_rows <> 1 then
    raise exception 'DOOR-21 FAIL: three replays of one client-minted key are % record(s) on the read door', v_rows;
  end if;
  if (custom.read_record(v_org, v_a, false) ->> 'message') <> 'no signal' then
    raise exception 'DOOR-21 FAIL: the captured record does not read back the value the device sent';
  end if;

  -- AND THE PERSON'S CAPTURE IS NOT A STRANGER'S SUBMISSION: it never enters the quarantine,
  -- because a signed-in editor is not a stranger. Asked of the triage door, from the seat.
  select count(*) into v_rows
    from custom.anon_submissions(v_org, current_setting('zz.tenq')::uuid, null, 200, 0) s
   where s.client_key = 'roadshow-kiosk-capture';
  if v_rows <> 0 then
    raise exception 'DOOR-21 FAIL: a signed-in person''s capture left % row(s) in the quarantine — quarantine is for callers with no account', v_rows;
  end if;

  raise notice 'PART 8 PASS: a signed-in admin captured through custom.anon_capture from the seat; three replays of the one client-minted key are ONE record that reads back its values, and none of them entered the stranger''s quarantine';
end $p8$;

\echo ''
\echo '══ PART 9 — the access question only the seat can ask: test@test.com'
\echo ''

do $p9$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org  uuid := current_setting('zz.org')::uuid;
  v_rec  uuid;
  v_err  text;
  v_rows integer;
begin
  -- A record she can be given, written by the admin through the write door.
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_rec := custom.record_write(v_org, current_setting('zz.tenq')::uuid,
                               '{"name":"Shared with Dana","message":"hello"}'::jsonb);

  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 9a. SHE MAY NOT READ WHAT STRANGERS SENT. She is a member of this organization and not an
  -- admin of the Table, and a quarantined payload is a stranger's raw input with the headers it
  -- arrived under. Naming the Table is refused outright; asking without naming it shows nothing.
  v_err := null;
  begin
    perform 1 from custom.anon_submissions(v_org, current_setting('zz.tenq')::uuid, null, 200, 0);
  exception when others then
    v_err := sqlerrm;
  end;
  if v_err is null then
    raise exception '9a: test@test.com read the quarantine of a Table she is not an admin of';
  end if;
  select count(*) into v_rows from custom.anon_submissions(v_org, null, null, 200, 0);
  if v_rows <> 0 then
    raise exception '9a: asking without naming the Table showed test@test.com % quarantined submission(s) anyway', v_rows;
  end if;

  -- 9b. NOR OPEN A FORM TO THE WORLD.
  v_err := null;
  begin
    perform custom.anon_publish(v_org, current_setting('zz.form')::uuid, false);
  exception when others then
    v_err := sqlerrm;
  end;
  if v_err is null then
    raise exception '9b: test@test.com closed a public form she is not an admin of';
  end if;

  -- 9c. NOR MINT A TOKEN THAT WRITES INTO IT.
  v_err := null;
  begin
    perform custom.anon_token_issue(v_org, 'write', '["https://example.test"]'::jsonb,
                                    current_setting('zz.form')::uuid);
  exception when others then
    v_err := sqlerrm;
  end;
  if v_err is null then
    raise exception '9c: test@test.com minted an anonymous write token for a form she is not an admin of';
  end if;

  -- 9d. THE CONTROL, so 9a-9c are not a door that refuses her everything: the record she IS
  -- given, she reads.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_rec, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if (custom.read_record(v_org, v_rec, false) ->> 'name') <> 'Shared with Dana' then
    raise exception '9d: the record shared with test@test.com at viewer does not read back for her';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);

  raise notice 'PART 9 PASS: test@test.com — a member who is not an admin of the Table — was refused the quarantine (by name and by silence), the publish door and the token door, and the record shared with her at viewer reads back';
end $p9$;

\echo ''
\echo '══ PART 10 — the posture: this lane granted `anon` nothing'
\echo ''

do $p10$
declare v_bad text; v_anon_doors integer;
begin
  -- THE SENTENCE THE WHOLE LANE RESTS ON, checked against the catalogue rather than asserted,
  -- and asked from the seat like everything else.
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom'
     and (p.proname like 'anon\_%' or p.proname like 'io\_%')
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('public', p.oid, 'EXECUTE'));
  if v_bad is not null then
    raise exception 'DOOR-17 FAIL: these functions are EXECUTE-able by anon or PUBLIC: %', v_bad;
  end if;
  if has_schema_privilege('anon', 'custom', 'USAGE') then
    raise exception 'DOOR-17 FAIL: role anon holds USAGE on schema custom';
  end if;
  -- THE DOOR REGISTER is an operator's catalogue, not a person's — `platform.client_callable_door`
  -- carries no client grant — so this ONE read steps out and the clause it serves is decided
  -- back in the seat, on the number it brought home.
  perform set_config('role', current_setting('zz.boss'), true);
  select count(*) into v_anon_doors from platform.client_callable_door
   where schema_name = 'custom' and anonymous_callers;
  perform set_config('role', 'authenticated', true);
  if v_anon_doors <> 0 then
    raise exception 'DOOR-17 FAIL: % custom door(s) declare anonymous_callers — the anonymous WRITER has no account, but the CALLER is always the server', v_anon_doors;
  end if;

  raise notice 'PART 10 PASS: no custom.anon_* or custom.io_* function is EXECUTE-able by anon or PUBLIC, anon holds no USAGE on the schema, and no door declares anonymous callers';
end $p10$;

\echo ''
\echo '══ W4-ANON GREEN SUITE PASSED — rolling back'
rollback;

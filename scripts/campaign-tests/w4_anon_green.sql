-- W4-ANON — THE GREEN SUITE. DOOR-17 · DOOR-19 · DOOR-20 · DOOR-21.
--
-- RUN IT against the MAIN database:
--   "$PSQL" "$MAIN_DSN" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w4_anon_green.sql
--
-- Not a migration. EVERYTHING ROLLS BACK.
-- ITS RED TWIN is `scripts/campaign-tests/w4_anon_red.sql`.
--
-- EVERY REFUSAL HERE IS PAIRED WITH A POSITIVE CONTROL, because this is the campaign's only
-- unauthenticated surface and "it refused" is worthless without "and the legitimate call
-- succeeded one line earlier". The replay is counted as ROWS rather than asserted as an absence
-- of errors, for the same reason.

\set ON_ERROR_STOP on
\timing off

do $target$
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'w4_anon_green.sql expects the MAIN database, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end $target$;

begin;

select set_config('app.actor_system', 'campaign.w4_anon.green', true);
\set org '39c38960-d30c-4840-b0c1-c9960de95582'

update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key in ('associations_guard', 'accessible_entity_ids_guard');

select custom.table_declare(:'org'::uuid, jsonb_build_object(
  'name', 'ZZ ANON Enquiry', 'slug', 'zz_anon_enquiry', 'type', 'entity', 'display', 'list',
  'label_singular', 'Enquiry', 'label_plural', 'Enquiries', 'ordered', false, 'weight', 'light',
  'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
  'parent_id', custom.table_kernel_id(), 'title_field', 'name', 'default_sort', '[]'::jsonb,
  'fields', jsonb_build_array(jsonb_build_object('name','name'),
                              jsonb_build_object('name','message'),
                              jsonb_build_object('name','internal_note')))) as t_enq \gset

select set_config('zz.org', :'org', true) as o,
       set_config('zz.tenq', :'t_enq', true) as t \gset

-- The form exposes TWO of the Table's three fields. `internal_note` is deliberately left out:
-- it is the key PART 3 tries to push through the door.
insert into custom.anon_form (organization_id, table_id, slug, title,
                              exposed_field_keys, required_field_keys,
                              rate_limit_per_window, rate_limit_window)
values (:'org'::uuid, :'t_enq'::uuid, 'zz-anon-green', 'Contact us',
        '["name","message"]'::jsonb, '["name"]'::jsonb,
        2, interval '1 hour')
returning id as form_id \gset

select set_config('zz.form', :'form_id', true) \gset

\echo ''
\echo '══ PART 1 — DOOR-17: CLOSED BY DEFAULT, and only an explicit publish act opens it'
\echo ''

do $p1$
declare
  v_secret text;
  v_tok    uuid;
  v_err    text;
  v_at     timestamptz;
begin
  -- Issuing a WRITE token is an admin act on the Table, so it is performed as the admin — the
  -- same account that publishes below. Everything after this line is the anonymous caller,
  -- holding nothing but the token.
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  select token_id, secret into v_tok, v_secret
    from custom.anon_token_issue(current_setting('zz.org')::uuid, 'write',
                                 '["https://example.test"]'::jsonb,
                                 current_setting('zz.form')::uuid);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('zz.secret', v_secret, true);
  perform set_config('zz.token', v_tok::text, true);

  -- THE FORM EXISTS AND IS NOT PUBLISHED. It must refuse.
  begin
    perform custom.anon_write(v_secret, 'https://example.test', '{"name":"Ada"}'::jsonb);
    raise exception 'DOOR-17 FAIL: an unpublished form accepted a submission';
  exception when sqlstate '42501' then
    v_err := sqlerrm;
  end;
  if v_err not ilike '%not accepting responses%' then
    raise exception 'DOOR-17 FAIL: the refusal for an unpublished form reads "%", which does not say the form is closed', v_err;
  end if;

  -- THE POSITIVE CONTROL: publish, and the identical call works. Without this the refusal above
  -- could be any of the five checks in the door.
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  v_at := custom.anon_publish(current_setting('zz.org')::uuid, current_setting('zz.form')::uuid);
  perform set_config('request.jwt.claims', '', true);
  if v_at is null then
    raise exception 'DOOR-17 FAIL: publishing returned no timestamp, so the form is still closed';
  end if;

  perform custom.anon_write(v_secret, 'https://example.test', '{"name":"Ada"}'::jsonb);

  raise notice 'PART 1 PASS: the form refused with "%" while unpublished, and the identical submission landed once an admin published it', left(v_err, 48);
end $p1$;

\echo ''
\echo '══ PART 2 — DOOR-17: the submission is QUARANTINED, not a record'
\echo ''

do $p2$
declare
  v_sub  custom.anon_submission;
  v_recs integer;
begin
  select * into v_sub from custom.anon_submission
   where organization_id = current_setting('zz.org')::uuid
     and form_id = current_setting('zz.form')::uuid
   order by created_at desc limit 1;

  if v_sub.state <> 'quarantined' then
    raise exception 'DOOR-17 FAIL: an anonymous submission was born in state "%", and the only state it may be born in is quarantined', v_sub.state;
  end if;
  if v_sub.record_id is not null then
    raise exception 'DOOR-17 FAIL: the submission already points at record % — record_id IS the quarantine', v_sub.record_id;
  end if;
  if v_sub.source <> 'anonymous' then
    raise exception 'DOOR-17 FAIL: the submission''s source is "%" and must be stamped anonymous', v_sub.source;
  end if;

  -- AND NOTHING REACHED THE STORE. The Table holds no record at all, so no read door has to be
  -- asked whether it can see one.
  select count(*) into v_recs from custom.record
   where organization_id = current_setting('zz.org')::uuid
     and table_id = current_setting('zz.tenq')::uuid;
  if v_recs <> 0 then
    raise exception 'DOOR-17 FAIL: an anonymous write put % row(s) into custom.record. A submission is not a record until a Rule clears it.', v_recs;
  end if;

  raise notice 'PART 2 PASS: the submission is quarantined with source "anonymous" and record_id null, and custom.record holds 0 rows for this Table';
end $p2$;

\echo ''
\echo '══ PART 3 — DOOR-17: the token is scoped to the form''s exposed fields'
\echo ''

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

\echo ''
\echo '══ PART 4 — DOOR-20: the origin list is exact, and revocation is final'
\echo ''

do $p4$
declare v_err text; v_sub uuid;
begin
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
  if v_err not ilike '%evil.test%' then
    raise exception 'DOOR-20 FAIL: the origin refusal does not name the origin: "%"', v_err;
  end if;

  -- REVOCATION. After it, even the listed origin is refused, and it says when.
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  if not custom.anon_token_revoke(current_setting('zz.org')::uuid, current_setting('zz.token')::uuid) then
    raise exception 'DOOR-20 FAIL: revoking the token reported that it changed nothing';
  end if;
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

  raise notice 'PART 4 PASS: the listed origin wrote, a near-miss origin was refused by name ("%"), and after revocation the same listed origin is refused as revoked', left(v_err, 44);
end $p4$;

\echo ''
\echo '══ PART 5 — DOOR-17: the rate limit refuses the (n+1)th, by name'
\echo ''

do $p5$
declare
  v_secret text; v_tok uuid; v_err text; v_n integer; v_rows integer;
begin
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  select token_id, secret into v_tok, v_secret
    from custom.anon_token_issue(current_setting('zz.org')::uuid, 'write',
                                 '["https://example.test"]'::jsonb,
                                 current_setting('zz.form')::uuid);
  perform set_config('request.jwt.claims', '', true);

  -- The form's limit is 2 per hour. TWO succeed — that is the positive control — and the THIRD
  -- is refused by name.
  perform custom.anon_write(v_secret, 'https://example.test', '{"name":"One"}'::jsonb);
  perform custom.anon_write(v_secret, 'https://example.test', '{"name":"Two"}'::jsonb);
  begin
    perform custom.anon_write(v_secret, 'https://example.test', '{"name":"Three"}'::jsonb);
    raise exception 'DOOR-17 FAIL: the third submission passed a limit of 2 per window';
  exception when sqlstate '53400' then
    v_err := sqlerrm;
  end;
  if v_err not ilike '%too many%' then
    raise exception 'DOOR-17 FAIL: the rate refusal reads "%" and does not say what happened', v_err;
  end if;

  -- AND THE COUNT IS ROWS — ONE row per (token, window), which is what makes the count atomic
  -- under concurrency rather than a read-then-write race. It reads 2, not 3: the refusal is
  -- raised inside the same statement that incremented, so the third attempt's increment rolls
  -- back with it. That is the right behaviour and the limit still holds — the next attempt
  -- increments 2 to 3, is refused, and rolls back to 2 again, forever.
  select count(*), max(hits) into v_rows, v_n from custom.anon_hit
   where organization_id = current_setting('zz.org')::uuid and bucket = v_tok::text;
  if v_rows <> 1 then
    raise exception 'DOOR-17 FAIL: the window is % rows for one token; a per-request row cannot be counted atomically', v_rows;
  end if;
  if v_n <> 2 then
    raise exception 'DOOR-17 FAIL: the window row holds % accepted writes, and exactly 2 were accepted', v_n;
  end if;

  -- AND IT STAYS REFUSED. A limit that only bites once is not a limit.
  begin
    perform custom.anon_write(v_secret, 'https://example.test', '{"name":"Four"}'::jsonb);
    raise exception 'DOOR-17 FAIL: the FOURTH submission got through, so the refusal did not stick';
  exception when sqlstate '53400' then null;
  end;

  raise notice 'PART 5 PASS: 2 of 2 accepted, the 3rd refused with "%", the window is ONE row holding exactly the 2 accepted writes, and the 4th is refused too', left(v_err, 40);
end $p5$;

\echo ''
\echo '══ PART 6 — DOOR-21: three replays of two captures are TWO rows'
\echo ''

do $p6$
declare
  v_secret text; v_tok uuid; v_ids uuid[] := array[]::uuid[]; v_i integer; v_rows integer;
begin
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  select token_id, secret into v_tok, v_secret
    from custom.anon_token_issue(current_setting('zz.org')::uuid, 'write',
                                 '["https://example.test"]'::jsonb,
                                 current_setting('zz.form')::uuid);
  perform set_config('request.jwt.claims', '', true);

  -- The form's limit would refuse the replays on their own, which would make this test pass for
  -- the wrong reason. So the limit is raised for this part, and the replay has to do the work.
  update custom.anon_form set rate_limit_per_window = 100
   where organization_id = current_setting('zz.org')::uuid and id = current_setting('zz.form')::uuid;

  -- The CLIENT mints the ids. Two captures, replayed three times each, in the order a flaky
  -- network actually produces.
  for v_i in 1 .. 3 loop
    v_ids := v_ids || custom.anon_write(v_secret, 'https://example.test',
                                        '{"name":"Offline A"}'::jsonb, 'zz-client-key-a');
    v_ids := v_ids || custom.anon_write(v_secret, 'https://example.test',
                                        '{"name":"Offline B"}'::jsonb, 'zz-client-key-b');
  end loop;

  -- COUNTED AS ROWS, never asserted as an absence of errors.
  select count(*) into v_rows from custom.anon_submission
   where organization_id = current_setting('zz.org')::uuid
     and client_key in ('zz-client-key-a', 'zz-client-key-b');
  if v_rows <> 2 then
    raise exception 'DOOR-21 FAIL: two client-minted ids replayed three times each produced % submission rows, and the answer is 2', v_rows;
  end if;
  if array_length(array(select distinct unnest(v_ids)), 1) <> 2 then
    raise exception 'DOOR-21 FAIL: the six calls returned % distinct ids; every replay must return the id the first one made', array_length(array(select distinct unnest(v_ids)), 1);
  end if;
  if (select sum(replays) from custom.anon_replay
       where organization_id = current_setting('zz.org')::uuid
         and client_key in ('zz-client-key-a', 'zz-client-key-b')) <> 4 then
    raise exception 'DOOR-21 FAIL: four replays happened and the ledger counted %, so a client stuck in a loop would be invisible',
      (select sum(replays) from custom.anon_replay
        where organization_id = current_setting('zz.org')::uuid
          and client_key in ('zz-client-key-a', 'zz-client-key-b'));
  end if;

  raise notice 'PART 6 PASS: 6 calls, 2 client-minted ids, 2 rows, the same 2 ids returned every time, and the 4 extra attempts are COUNTED rather than discarded';
end $p6$;

\echo ''
\echo '══ PART 7 — DOOR-19: an inbound address lands a record with its source stamped'
\echo ''

do $p7$
declare
  v_secret text := 'zz-webhook-secret';
  v_id     uuid;
  v_sub    custom.anon_submission;
begin
  insert into custom.anon_inbound (organization_id, table_id, channel, address, secret_hash,
                                   source)
  values (current_setting('zz.org')::uuid, current_setting('zz.tenq')::uuid, 'webhook',
          'zz-green-hook', encode(digest(v_secret, 'sha256'), 'hex'), 'webhook');

  -- THE POSITIVE CONTROL: the right secret lands a submission.
  v_id := custom.anon_inbound_land('zz-green-hook', v_secret,
                                   '{"name":"From a webhook"}'::jsonb,
                                   '{"headers":{"x-source":"zapier"},"body":"raw"}'::jsonb);
  select * into v_sub from custom.anon_submission
   where organization_id = current_setting('zz.org')::uuid and id = v_id;
  if v_sub.source <> 'webhook' then
    raise exception 'DOOR-19 FAIL: the submission''s source is "%" and the address stamps webhook', v_sub.source;
  end if;
  if v_sub.raw_payload -> 'headers' ->> 'x-source' <> 'zapier' then
    raise exception 'DOOR-19 FAIL: the originating payload was not kept — "why does the record say this" is then unanswerable';
  end if;

  -- THE WRONG SECRET IS REFUSED.
  begin
    perform custom.anon_inbound_land('zz-green-hook', 'wrong', '{"name":"Nope"}'::jsonb);
    raise exception 'DOOR-19 FAIL: the wrong shared secret landed a submission';
  exception when sqlstate '42501' then null;
  end;

  -- AN UNKNOWN ADDRESS IS REFUSED WITHOUT CONFIRMING ANYTHING ABOUT IT.
  begin
    perform custom.anon_inbound_land('zz-does-not-exist', v_secret, '{"name":"Nope"}'::jsonb);
    raise exception 'DOOR-19 FAIL: an unknown inbound address accepted a delivery';
  exception when sqlstate '42501' then null;
  end;

  raise notice 'PART 7 PASS: the webhook landed one quarantined submission with source "webhook" and its originating headers kept; the wrong secret and an unknown address were both refused';
end $p7$;

\echo ''
\echo '══ PART 8 — the posture: this lane granted `anon` nothing'
\echo ''

do $p8$
declare v_bad text;
begin
  -- THE SENTENCE THE WHOLE LANE RESTS ON, checked against the catalogue rather than asserted.
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
  if exists (select 1 from platform.client_callable_door
              where schema_name = 'custom' and anonymous_callers) then
    raise exception 'DOOR-17 FAIL: a custom door declares anonymous_callers — the anonymous WRITER has no account, but the CALLER is always the server';
  end if;

  raise notice 'PART 8 PASS: no custom.anon_* or custom.io_* function is EXECUTE-able by anon or PUBLIC, anon holds no USAGE on the schema, and no door declares anonymous callers';
end $p8$;

\echo ''
\echo '══ W4-ANON GREEN SUITE PASSED — rolling back'
rollback;

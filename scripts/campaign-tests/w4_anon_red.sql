-- W4-ANON — THE RED TWIN. Every break must be DETECTABLE, and this file proves each one is.
--
--   "$PSQL" "$MAIN_DSN" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w4_anon_red.sql
--
-- Five breaks, one at a time, inside the transaction, each restored before the next, all rolled
-- back at the end. If a break slips past the check the green suite makes, this file RAISES —
-- because a red twin whose breaks go undetected is telling you the green suite is decorative.
--
--   1. the door stops checking `published_at`      → a closed form takes writes.   Green PART 1.
--   2. the door narrows the payload instead of refusing an unexposed key
--                                                   → a field the form never showed is set.
--                                                                                 Green PART 3.
--   3. the origin check becomes a SUFFIX match      → example.test.evil.test passes. Green PART 4.
--   4. the replay ledger loses its uniqueness       → three replays become three rows. Green PART 6.
--   5. the quarantine door stops asking the ladder  → a member who is not an admin of the Table
--                                                     reads what strangers sent. Green PART 9.
--
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). This lane has two callers and this file keeps them
-- apart. Replacing a function body or dropping an index is DDL and belongs to the operator; the
-- anonymous write path — `custom.anon_write`, `custom.anon_token_verify` — is declared
-- server_only, because the server is what holds the token and reads the request Origin header.
-- Both step OUT of the seat for exactly those statements and say why. Everything a PERSON does
-- — issuing and revoking a token, publishing a form, and every read of what landed, through
-- `custom.anon_submissions` — is asked from the seat `authenticated`, proved in PART 0.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w4_anon_red.sql'
\set requires 'grant:authenticated:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

select set_config('zz.boss', current_user, true);
select set_config('app.actor_system', 'campaign.w4_anon.red', true);

update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key in ('associations_guard', 'accessible_entity_ids_guard');

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
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w4_anon_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;
  perform set_config('zz.org', v_org::text, true);
  perform set_config('zz.home', v_home::text, true);
end $fixture$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- PART 0 — THE SEAT.
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

do $tables$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_t   uuid;
begin
  v_t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Trip Enquiries', 'slug', 'trip_enquiries', 'type', 'entity', 'display', 'list',
    'label_singular', 'E', 'label_plural', 'Es', 'ordered', false, 'weight', 'light',
    'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
    'parent_id', current_setting('zz.home'), 'title_field', 'name', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','name'),
                                jsonb_build_object('name','internal_note'))));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key','name','label','Name','plain','text','sort',10));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key','internal_note','label','Internal note','plain','text','sort',20));
  perform set_config('zz.tenq', v_t::text, true);
end $tables$;

-- No client verb makes a form; `custom.anon_publish` only opens one that exists. This one
-- fixture row is written as the connected role and says so, and asserts nothing while out.
select set_config('role', current_setting('zz.boss'), true);
insert into custom.anon_form (organization_id, table_id, slug, title, exposed_field_keys,
                              required_field_keys, rate_limit_per_window, rate_limit_window)
values (current_setting('zz.org')::uuid, current_setting('zz.tenq')::uuid,
        'plan-my-trip', 'Plan my trip', '["name"]'::jsonb, '[]'::jsonb, 100, interval '1 hour')
returning set_config('zz.form', id::text, true) as form_id;
select set_config('role', 'authenticated', true);

-- THE TOKEN IS THE PERSON'S ACT, and it is a door: from the seat, as the admin.
do $setup$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_secret text; v_tok uuid;
begin
  perform set_config('request.jwt.claims', c_admin_j, true);
  select token_id, secret into v_tok, v_secret
    from custom.anon_token_issue(current_setting('zz.org')::uuid, 'write',
                                 '["https://example.test"]'::jsonb,
                                 current_setting('zz.form')::uuid);
  if v_secret is null then
    raise exception 'RED TWIN SETUP FAIL: the token door gave a signed-in admin no token';
  end if;
  perform set_config('zz.secret', v_secret, true);
  perform set_config('zz.token', v_tok::text, true);
end $setup$;

\echo ''
\echo '══ BREAK 1 — the door stops checking whether the form is published'
\echo ''

do $b1$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss text := current_setting('zz.boss');
  v_ok boolean := false;
begin
  -- The form has never been published, so the INTACT door refuses. That is the control.
  -- `custom.anon_write` is server_only and has no principal at all, so it steps out.
  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform custom.anon_write(current_setting('zz.secret'), 'https://example.test',
                              '{"name":"Ada"}'::jsonb);
    raise exception 'RED TWIN CONTROL FAILED (break 1): the intact door accepted a write to an UNPUBLISHED form';
  exception when sqlstate '42501' then
    v_ok := true;
  end;

  -- Now an ADMIN publishes it — through the publish door, from the seat — and the identical
  -- call succeeds. Together these two say the `published_at` check is load-bearing: removing it
  -- is exactly the difference between the two outcomes, and green PART 1 asserts the first.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.anon_publish(current_setting('zz.org')::uuid, current_setting('zz.form')::uuid);

  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', '', true);
  perform custom.anon_write(current_setting('zz.secret'), 'https://example.test',
                            '{"name":"Ada"}'::jsonb);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  raise notice 'BREAK 1 RED as required: CLOSED refused and PUBLISHED accepted the identical call — the published_at check is what separates them, and green PART 1 asserts the refusal';
end $b1$;

\echo ''
\echo '══ BREAK 2 — the door narrows the payload instead of refusing an unexposed key'
\echo ''

-- Replacing a body is DDL: no client door does it. Out of the seat for exactly this statement.
select set_config('role', current_setting('zz.boss'), true);
create or replace function custom.anon_write_narrowing(p_secret text, p_origin text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog' as $broken$
declare
  v_tok record; v_form custom.anon_form; v_exposed text[]; v_doc jsonb := '{}'::jsonb; v_key text;
begin
  select * into v_tok from custom.anon_token_verify(p_secret, p_origin, 'write');
  select * into v_form from custom.anon_form
   where organization_id = v_tok.organization_id and id = v_tok.form_id;
  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_exposed
    from jsonb_array_elements(v_form.exposed_field_keys);
  -- THE BREAK: keep what is exposed, silently DROP the rest. This is the shape almost every
  -- form backend ships, and it is why a person can type into a field and be told nothing.
  for v_key in select jsonb_object_keys(p_payload) loop
    if v_key = any (v_exposed) then
      v_doc := v_doc || jsonb_build_object(v_key, p_payload -> v_key);
    end if;
  end loop;
  return v_doc;
end;
$broken$;

-- BOTH CALLS BELOW ARE THE SERVER'S LANE and stay out of the seat with no principal:
-- `custom.anon_write` and `custom.anon_token_verify` are declared server_only, and the broken
-- twin is built out of the second of them.
do $b2$
declare v_doc jsonb;
begin
  v_doc := custom.anon_write_narrowing(current_setting('zz.secret'), 'https://example.test',
                                       '{"name":"Mallory","internal_note":"pushed"}'::jsonb);
  if v_doc ? 'internal_note' then
    raise exception 'RED TWIN UNDETECTED (break 2): the narrowing door kept the unexposed key, so it is not the behaviour being contrasted';
  end if;
  -- The narrowing door SUCCEEDS where the real one refuses. Green PART 3 asserts the refusal
  -- names `internal_note`; under the break there is no refusal at all and the person who typed
  -- into that field is told nothing.
  begin
    perform custom.anon_write(current_setting('zz.secret'), 'https://example.test',
                              '{"name":"Mallory","internal_note":"pushed"}'::jsonb);
    raise exception 'RED TWIN UNDETECTED (break 2): the REAL door also accepted the unexposed key';
  exception when sqlstate '42501' then
    raise notice 'BREAK 2 RED as required: the narrowing door returned % and said nothing; the real door refuses by name — green PART 3 asserts the name is in the message', v_doc;
  end;
end $b2$;

drop function custom.anon_write_narrowing(text, text, jsonb);

\echo ''
\echo '══ BREAK 3 — the origin check becomes a suffix match'
\echo ''

create or replace function custom.anon_origin_allowed_suffix(p_allowed jsonb, p_origin text)
returns boolean language sql immutable set search_path to 'pg_catalog' as $broken$
  -- THE BREAK, and it is the usual one: "does the origin END WITH something we allow".
  select exists (select 1 from jsonb_array_elements_text(p_allowed) o
                  where p_origin like '%' || o || '%');
$broken$;

do $b3$
declare v_allowed jsonb := '["https://example.test"]'::jsonb;
begin
  if not custom.anon_origin_allowed_suffix(v_allowed, 'https://example.test.evil.test') then
    raise exception 'RED TWIN UNDETECTED (break 3): even the sloppy match rejected the near miss, so the exact match below proves nothing';
  end if;
  -- The REAL door is an exact list membership, so the same near miss is refused by name. Still
  -- the server's lane, still no principal — an Origin header is not a person.
  begin
    perform custom.anon_write(current_setting('zz.secret'), 'https://example.test.evil.test',
                              '{"name":"Mallory"}'::jsonb);
    raise exception 'RED TWIN UNDETECTED (break 3): the real door accepted https://example.test.evil.test';
  exception when sqlstate '42501' then
    raise notice 'BREAK 3 RED as required: a suffix/contains match ADMITS https://example.test.evil.test; the real door refuses it — green PART 4 asserts that refusal names the origin';
  end;
end $b3$;

drop function custom.anon_origin_allowed_suffix(jsonb, text);

\echo ''
\echo '══ BREAK 4 — the replay ledger loses its uniqueness'
\echo ''

do $b4_writes$
declare
  v_ids uuid[] := array[]::uuid[];
  v_i integer;
begin
  -- FIRST the control, on the intact mechanism: three replays of one client-minted id, by the
  -- server, with no principal — the anonymous caller.
  for v_i in 1 .. 3 loop
    v_ids := v_ids || custom.anon_write(current_setting('zz.secret'), 'https://example.test',
                                        '{"name":"Offline"}'::jsonb, 'trailhead-website-capture');
  end loop;
  if array_length(array(select distinct unnest(v_ids)), 1) <> 1 then
    raise exception 'RED TWIN CONTROL FAILED (break 4): three replays of one id returned % distinct ids on the INTACT door',
      array_length(array(select distinct unnest(v_ids)), 1);
  end if;
end $b4_writes$;

-- THE COUNT IS THE PERSON'S QUESTION and is asked from the seat, through the triage door.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
                  '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);

do $b4_intact$
declare v_rows integer;
begin
  select count(*) into v_rows
    from custom.anon_submissions(current_setting('zz.org')::uuid,
                                 current_setting('zz.tenq')::uuid, null, 200, 0) s
   where s.client_key = 'trailhead-website-capture';
  if v_rows <> 1 then
    raise exception 'RED TWIN CONTROL FAILED (break 4): three replays of one id are % row(s) on the triage door with the unique index in place', v_rows;
  end if;
end $b4_intact$;

-- THE BREAK: drop the unique index the idempotency actually rests on, and write the same three
-- submissions by hand. Dropping an index is DDL and writing custom.anon_submission directly is
-- the server's own path; both step out, and the COUNT that judges them is taken back in the seat.
select set_config('role', current_setting('zz.boss'), true);
drop index custom.anon_submission_organization_id_form_id_client_key_idx;

do $b4_broken$
declare v_i integer;
begin
  for v_i in 1 .. 3 loop
    insert into custom.anon_submission (organization_id, form_id, table_id, source, payload,
                                        client_key, state)
    values (current_setting('zz.org')::uuid, current_setting('zz.form')::uuid,
            current_setting('zz.tenq')::uuid, 'anonymous', '{"name":"Offline"}'::jsonb,
            'partner-portal-key', 'quarantined');
  end loop;
end $b4_broken$;

select set_config('role', 'authenticated', true);

do $b4_judge$
declare v_rows integer;
begin
  select count(*) into v_rows
    from custom.anon_submissions(current_setting('zz.org')::uuid,
                                 current_setting('zz.tenq')::uuid, null, 200, 0) s
   where s.client_key = 'partner-portal-key';
  if v_rows <> 3 then
    raise exception 'RED TWIN UNDETECTED (break 4): without the unique index the same key still produced % row(s)', v_rows;
  end if;
  raise notice 'BREAK 4 RED as required: WITH the unique index three replays are 1 row on the triage door; WITHOUT it the same three writes are 3 — green PART 6 counts rows there, so it catches exactly this';
end $b4_judge$;

\echo ''
\echo '══ BREAK 5 — the quarantine door stops asking the ladder'
\echo ''

-- The door a person reaches, with its row filter removed. Green PART 9 asserts that
-- `test@test.com` — a member of this organization who is NOT an admin of the Table — is shown
-- nothing; under the break she is shown everything a stranger ever sent.
select set_config('role', current_setting('zz.boss'), true);
create or replace function custom.anon_submissions(
  p_organization_id uuid, p_table_id uuid default null, p_state text default null,
  p_limit integer default 100, p_offset integer default 0)
returns table(id uuid, form_id uuid, inbound_id uuid, table_id uuid, source text,
              state text, payload jsonb, raw_payload jsonb, client_key text,
              record_id uuid, remote_origin text, rejection_reason text,
              created_at timestamptz, cleared_at timestamptz)
language plpgsql stable security definer set search_path to 'pg_catalog' as $broken$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.anon_submissions');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.anon_submissions');
  -- THE BREAK: the organization wall and nothing else. Membership becomes the whole decision,
  -- which is tenancy standing in for permission.
  return query
    select s.id, s.form_id, s.inbound_id, s.table_id, s.source, s.state, s.payload,
           s.raw_payload, s.client_key, s.record_id, s.remote_origin, s.rejection_reason,
           s.created_at, s.cleared_at
      from custom.anon_submission s
     where s.organization_id = p_organization_id
       and s.deleted_at is null
       and (p_table_id is null or s.table_id = p_table_id)
     order by s.created_at desc, s.id desc
     limit greatest(least(coalesce(p_limit, 100), 500), 1);
end;
$broken$;
select set_config('role', 'authenticated', true);

do $b5$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org  uuid := current_setting('zz.org')::uuid;
  v_rec  uuid;
  v_rows integer;
begin
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_rec := custom.record_write(v_org, current_setting('zz.tenq')::uuid,
                               '{"name":"Shared with Dana"}'::jsonb);

  perform set_config('request.jwt.claims', c_dana_j, true);
  select count(*) into v_rows from custom.anon_submissions(v_org, null, null, 200, 0);
  if v_rows = 0 then
    raise exception 'RED TWIN UNDETECTED (break 5): the door with its row filter REMOVED still showed test@test.com nothing';
  end if;
  raise notice 'BREAK 5 RED as required: with the ladder taken out, test@test.com — a member who is not an admin of the Table — reads % quarantined submission(s) strangers sent; green PART 9 asserts 0', v_rows;

  -- THE POSITIVE CONTROL FOR THE BREAK ITSELF: put the filter back and the identical call from
  -- the identical person shows nothing. Without it, "she saw rows" could mean she was entitled.
  perform set_config('role', current_setting('zz.boss'), true);
  execute $intact$
  create or replace function custom.anon_submissions(
    p_organization_id uuid, p_table_id uuid default null, p_state text default null,
    p_limit integer default 100, p_offset integer default 0)
  returns table(id uuid, form_id uuid, inbound_id uuid, table_id uuid, source text,
                state text, payload jsonb, raw_payload jsonb, client_key text,
                record_id uuid, remote_origin text, rejection_reason text,
                created_at timestamptz, cleared_at timestamptz)
  language plpgsql stable security definer set search_path to 'pg_catalog' as $body$
  declare v_me uuid;
  begin
    perform custom.assert_store_door(p_organization_id, 'custom.anon_submissions');
    perform custom.assert_client_may_reach(p_organization_id, 'custom.anon_submissions');
    if p_table_id is not null then
      perform custom.assert_client_may_open(p_organization_id, p_table_id, 'custom.anon_submissions',
                                            'admin'::public.permission_level, 'record');
    end if;
    v_me := custom.query_principal();
    return query
      select s.id, s.form_id, s.inbound_id, s.table_id, s.source, s.state, s.payload,
             s.raw_payload, s.client_key, s.record_id, s.remote_origin, s.rejection_reason,
             s.created_at, s.cleared_at
        from custom.anon_submission s
       where s.organization_id = p_organization_id
         and s.deleted_at is null
         and (p_table_id is null or s.table_id = p_table_id)
         and (p_state is null or s.state = p_state)
         and (v_me is null
              or custom.has_visibility(v_me, 'record', s.table_id, 'admin'::public.permission_level))
       order by s.created_at desc, s.id desc
       limit greatest(least(coalesce(p_limit, 100), 500), 1)
      offset greatest(coalesce(p_offset, 0), 0);
  end;
  $body$;
  $intact$;
  perform set_config('role', 'authenticated', true);

  select count(*) into v_rows from custom.anon_submissions(v_org, null, null, 200, 0);
  if v_rows <> 0 then
    raise exception 'RED TWIN UNDETECTED (break 5): with the ladder RESTORED test@test.com still reads % quarantined submission(s), so the filter is not what was being tested', v_rows;
  end if;
  raise notice 'BREAK 5 control: with the ladder restored the identical call from the identical person reads 0 — so the rows above were the missing filter and nothing else';

  -- AND THE CONTROL FOR HER, so "she is refused" is not a door that refuses her everything:
  -- the record she IS given, she reads.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_rec, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if (custom.read_record(v_org, v_rec, false) ->> 'name') <> 'Shared with Dana' then
    raise exception 'RED TWIN CONTROL FAILED (break 5): the record shared with test@test.com at viewer does not read back for her';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'BREAK 5 control 2: the same person reads the record shared with her at viewer — the quarantine refusal is the ladder, not a door that says no to her about everything';
end $b5$;

\echo ''
\echo '══ W4-ANON RED TWIN: all five breaks were detectable — rolling back'
rollback;

-- LANE W1-V1-FIXES — THE RED TWIN. The four things `V1-MODEL` observed, asserted EXACTLY AS
-- THEY WERE MEASURED, against the SAME live objects `v1_fixes_green.sql` runs over, on the
-- MAIN database.
--
-- This file is the falsifiable statement of the defects. Every block below asserts that the
-- WRONG thing happens; each one therefore goes RED (is collected and raised at the end) the
-- moment its fix is in place, and `v1_fixes_green.sql` asserts the right thing in its place.
--
--   RED 1. THE OFF SWITCH DOES NOT HOLD THROUGH THE DOOR. With this organization's store
--          switched off, a role that is no member of `custom.record`'s owner is refused a
--          direct INSERT by name — and the SAME caller's `custom.record_write(...)` LANDS,
--          because that door is SECURITY DEFINER owned by the table's owner and the guard
--          asks `current_user`, which the door has already rewritten to the owner.
--   RED 2. A WRITE WITH NO CALLER-OPENED ENVELOPE CARRIES NO AUTHOR AND NO VERSION. The
--          envelope is built only over the keys a caller put in `_values`, so an ordinary
--          write stores none: `custom.value_read` answers `actor` NULL and `value_version` 1,
--          and 1 again after the value has moved.
--   RED 3. AN AGENT WRITE WITH NO `_on_behalf_of` LANDS UNREMARKED. The converse arm is
--          enforced (a `user` write claiming `_on_behalf_of` is refused by name); this one is
--          not enforced at all.
--   RED 4. A 5 MB VALUE LANDS. No per-value and no per-document ceiling exists anywhere in
--          the write path, published or enforced.
--   RED 5. ACCESS IS NOT ASKED AT THE DOOR. A member who was shared nothing writes into
--          somebody else's table. (SEAT-SUITES, 2026-09-19 — a defect the old seat could not
--          have seen: as a member of the role that owns `custom.record`,
--          `custom.assert_client_may_reach` returned true on its first line.)
--
--   (Finding 5 of the original lane, concurrency, needs two committing sessions and cannot be
--    proven inside one rolled-back transaction. Its harness is
--    `scripts/campaign-tests/v1_fixes_concurrency.sh`.)
--
-- 🚨 RE-POINTED AND SEATED (lane SEAT-SUITES, 2026-09-19). This twin used to run against the
-- rehearsal branch, where it had been failing before anyone touched it — that branch has no
-- `custom.field_declare` and 226 of main's 332 functions in schema `custom`, so the store
-- these blocks are about is not there. It also created a disposable role to stand in for "not
-- a member of the store's owner", which is what `authenticated` already is. The stand-in is
-- gone: it builds its fixtures as the connected role, takes the seat in PART 0 and asserts
-- every block through the door a signed-in person reaches.
--
-- EVERY block is measured, not only the first: a red twin that stops at its first failure says
-- nothing about the other four. They are collected and raised together at the end.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/v1_fixes_red.sql
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and its one
-- transaction ends in ROLLBACK.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'v1_fixes_red.sql'
\set requires 'grant:authenticated:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
-- Other lanes write this store all night and the server's lock_timeout is 5s; nothing here
-- takes a lock stronger than an ordinary row lock, so it waits rather than dying on traffic.
set local lock_timeout = '10s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_table   uuid;
  v_rec     uuid;
  v_owner   text;
  v_switch  text;
  v_actor   text;
  v_obo     text;
  v_ver     integer;
  v_res     jsonb;
  v_caught  text;
  v_boss    text := current_user;
  v_reds    text[] := '{}';
begin
  select pg_get_userbyid(c.relowner) into v_owner
    from pg_class c where c.oid = 'custom.record'::regclass;
  select platform.knob_resolve('custom','system_enabled', null) #>> '{}' into v_switch;
  if v_switch is distinct from 'false' then
    raise exception 'PRECONDITION: custom/system_enabled resolves "%" globally and RED 1 is about what OFF does.', v_switch;
  end if;
  raise notice 'PRECONDITION — custom.record owned by "%", custom/system_enabled = % globally, connected as "%".',
    v_owner, v_switch, v_boss;

  perform set_config('app.actor_system', 'campaign-test/v1_fixes_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Trailhead & Torch Journeys', 'trailhead-torch-' || substr(v_org::text, 1, 8), 'TTJ', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'v1_fixes_red');

  -- A Home has no client door of its own, so this one fixture row is written by the
  -- connected role and asserts nothing.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Every block below runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
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

  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Itineraries', 'slug', 'itineraries', 'type', 'entity',
    'label_singular', 'Itinerary', 'label_plural', 'Itineraries',
    'title_field', 'nm', 'display', 'page', 'weight', 'light',
    'ordered', false, 'row_order', 'sorted', 'default_sort', '[]'::jsonb,
    'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','nm')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_table, jsonb_build_object(
    'key', 'nm', 'label', 'Name', 'plain', 'text', 'sort', 10));

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 1 — the off switch does not hold through the door.
  -- Made red by: custom.record_write calling custom.assert_store_door, which judges
  -- custom.caller_role() and never current_user.
  -- ════════════════════════════════════════════════════════════════════════════
  v_res := platform.unified_data_store_set(v_org, false, c_admin, 'v1_fixes_red 1');
  if coalesce((v_res ->> 'switched_on')::boolean, true) is not false then
    raise exception 'RED 1 fixture: the switch door said it turned the store off and it reads on: %', v_res;
  end if;
  -- The control, which must hold either way: the table itself is unreachable from this seat.
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, v_table, 'record', jsonb_build_object('nm', 'direct'));
    raise exception 'RED 1 cannot run: a signed-in person INSERTed straight into custom.record, so the seat is not a client seat after all';
  exception when insufficient_privilege then null;
  end;
  v_rec := null;
  v_caught := null;
  begin
    v_rec := custom.record_write(v_org, v_table, jsonb_build_object('nm', 'through the door'));
  exception when others then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_rec is null then
    v_reds := array_append(v_reds, format('RED 1 did not go red: the door refused the caller with the store switched off ("%s"), so the switch now holds through custom.record_write', left(coalesce(v_caught,''), 90)));
  else
    raise notice 'RED 1 — "authenticated" wrote record % THROUGH custom.record_write while this organization''s store is switched off.', v_rec;
  end if;
  v_res := platform.unified_data_store_set(v_org, true, c_admin, 'v1_fixes_red 1 restore');

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 2 — a write with no caller-opened envelope carries no author, no version.
  -- Made red by: custom._value_envelope opening the envelope over the Table's applicable
  -- fields whether or not the writer opened one.
  -- ════════════════════════════════════════════════════════════════════════════
  v_rec := custom.record_write(v_org, v_table, jsonb_build_object('nm', 'first'));
  select actor, value_version into v_actor, v_ver from custom.value_read(v_org, v_rec, 'nm');
  if v_actor is not null then
    v_reds := array_append(v_reds, format('RED 2 did not go red: the store now stamps an author ("%s") on a write that opened no envelope', v_actor));
  else
    raise notice 'RED 2a — value "nm" reads back actor <NULL>, version %.', v_ver;
  end if;
  perform custom.record_update(v_org, v_rec, jsonb_build_object('nm', 'second'));
  select actor, value_version into v_actor, v_ver from custom.value_read(v_org, v_rec, 'nm');
  if v_ver <> 1 then
    v_reds := array_append(v_reds, format('RED 2 did not go red: the value moved first -> second and its version moved with it (now %s)', v_ver));
  else
    raise notice 'RED 2b — the value moved first -> second and its version is STILL %.', v_ver;
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 3 — an agent write with no `_on_behalf_of` lands unremarked.
  -- Made red by: the forward arm in custom._value_envelope.
  -- ════════════════════════════════════════════════════════════════════════════
  -- The control first: the converse arm IS built, and must stay built either way.
  v_caught := null;
  begin
    perform custom.record_write(v_org, v_table, jsonb_build_object(
      'nm', 'converse', '_actor', 'user', '_on_behalf_of', c_dana));
  exception when others then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'RED 3 CONTROL FAILED: a user write claiming _on_behalf_of landed, so the arm that WAS built is gone too.';
  end if;
  raise notice 'RED 3a — control: the converse IS refused: "%"', left(v_caught, 110);
  v_rec := null;
  v_caught := null;
  begin
    v_rec := custom.record_write(v_org, v_table,
      jsonb_build_object('nm', 'agent wrote this', '_actor', 'agent'));
  exception when others then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_rec is null then
    v_reds := array_append(v_reds, 'RED 3 did not go red: an agent write naming nobody was refused, so the forward arm is built');
  else
    select actor, on_behalf_of into v_actor, v_obo from custom.value_read(v_org, v_rec, 'nm');
    raise notice 'RED 3b — an agent write LANDED (record %) with actor "%" and on behalf of %.',
      v_rec, v_actor, coalesce(v_obo, '<NOBODY>');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 4 — a 5 MB value lands.
  -- Made red by: custom.size_refusal, read by custom._value_envelope before anything else
  -- touches the document, against the custom/value_max_bytes knob.
  -- ════════════════════════════════════════════════════════════════════════════
  v_rec := null;
  v_caught := null;
  begin
    v_rec := custom.record_write(v_org, v_table,
      jsonb_build_object('nm', repeat('x', 5 * 1024 * 1024)));
  exception when others then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_rec is null then
    v_reds := array_append(v_reds, format('RED 4 did not go red: the 5 MB value was refused ("%s"), so a ceiling is published and enforced', left(coalesce(v_caught,''), 90)));
  else
    raise notice 'RED 4 — a 5 MB value landed as record %. No ceiling is enforced anywhere in the write path.', v_rec;
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 5 (SEAT-SUITES) — access is not asked at the door, as a REAL SECOND PERSON.
  -- `test@test.com` is a member of this organization who was shared nothing.
  -- Made red by: custom.assert_client_may_change, which every write door now calls.
  -- ════════════════════════════════════════════════════════════════════════════
  -- One record of admin's for her to look at, made before the claims move.
  v_rec := custom.record_write(v_org, v_table, jsonb_build_object('nm', 'admin made this'));
  perform set_config('request.jwt.claims', c_dana_j, true);
  -- THE CONTROL FIRST, so RED 5 is not a door that refuses her everything: a record's default
  -- visibility lane is the organization and she is a member, so she READS admin's record.
  if (custom.read_record(v_org, v_rec, true) ->> 'nm') is distinct from 'admin made this' then
    raise exception 'RED 5 CONTROL FAILED: test@test.com cannot even read a record on her own organization''s lane, so the seat is refused everything and RED 5 proves nothing';
  end if;
  raise notice 'RED 5 control — test@test.com reads admin''s record on the organization lane.';
  v_rec := null;
  begin
    v_rec := custom.record_write(v_org, v_table, jsonb_build_object('nm', 'Dana wrote this'));
  exception when others then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_rec is null then
    v_reds := array_append(v_reds, format('RED 5 did not go red: test@test.com was refused a write into a table nobody gave her ("%s"), so the door asks the access question', left(coalesce(v_caught,''), 90)));
  else
    raise notice 'RED 5 — test@test.com wrote record % into a table nobody shared with her.', v_rec;
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);

  if array_length(v_reds, 1) > 0 then
    raise exception 'v1_fixes_red: % of the 6 clauses across its 5 blocks are RED (the defect they assert is gone): %',
      array_length(v_reds, 1), array_to_string(v_reds, ' | ');
  end if;
  raise notice 'v1_fixes_red: every block asserted the defect and found it — NOTHING IS FIXED.';
end;
$t$;

rollback;

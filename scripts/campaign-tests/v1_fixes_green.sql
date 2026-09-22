-- LANE W1-V1-FIXES — THE GREEN. The twin of `v1_fixes_red.sql`: every block below asserts
-- the RIGHT thing where the RED asserted the wrong one, against the SAME live objects on the
-- MAIN database.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/v1_fixes_green.sql
--
-- 🚨 RE-POINTED AND SEATED (lane SEAT-SUITES, 2026-09-19). This file used to run against the
-- rehearsal branch, where it had been FAILING since before anyone touched it: that branch
-- carries 226 functions in schema `custom` against main's 332 and has no `custom.field_declare`
-- at all, so the store these clauses are about is not there. The owner's 2026-09-18 ruling is
-- that there is no production and everything is the main database, so this suite now runs
-- there and nowhere else.
--
-- It also used to CREATE A DISPOSABLE ROLE (`ttj_record_writer`) to stand in for "a role that
-- is not a member of the store's owner" — which is what `authenticated` already IS. The
-- stand-in is gone: the suite builds its fixtures as the connected role, takes the seat
-- `authenticated` in PART 0, proves it holds it, and runs EVERY asserted clause through the
-- door a signed-in person reaches. Finding 1 is therefore asked the way a browser asks it.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGE, NAMED (rule 3), one per block:
--   1. remove `perform custom.assert_store_door(...)` from `custom.record_write`, or make
--      `custom.caller_role()` answer `current_user` again, and block 1 fails naming the
--      record that landed with this organization's store switched off.
--   2. put back the early `return new` in `custom._value_envelope` for a document that
--      opened no envelope, and block 2 fails on `actor <NULL>` / a stuck version.
--   3. remove the forward `_on_behalf_of` arm and block 3 fails naming the agent write that
--      landed.
--   4. drop `custom.size_refusal`, or raise `custom/value_max_bytes` above 5 MB, and block 4
--      fails naming the byte count that landed.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE (rule 3), in every block: each refusal is
-- paired with a POSITIVE control over the same door, the same table and the same person that
-- MUST land - the same write with the switch back on, an `agent` write that names its person,
-- a 99,000-byte value under the ceiling - so a body that simply refuses everything fails here
-- just as loudly as one that refuses nothing. The versions are asserted as a SEQUENCE (1,
-- then 2, then 2 again for a re-assert of the same value), which a constant cannot satisfy.
--
-- Finding 5 is not here: it needs two committing sessions and lives in
-- `scripts/campaign-tests/v1_fixes_concurrency.sh`.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and its one
-- transaction ends in ROLLBACK - the disposable organization, its memberships, its knob
-- override, its home, its table and every record all disappear with it.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'v1_fixes_green.sql'
\set requires 'exec:custom.table_declare'
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
  v_switch  text;
  v_actor   text;
  v_obo     text;
  v_ver     integer;
  v_bytes   integer;
  v_msg     text;
  v_caught  text;
  v_hint    text;
  v_res     jsonb;
  v_boss    text := current_user;   -- the connected role, for the fixture steps no door covers
begin
  -- The GLOBAL rung of the switch is what block 1 is about: it resolves false, and this
  -- organization is switched on ON TOP of it by its own override. Block 1 takes that override
  -- away again through the switch screen's own door and watches what a person is told.
  select platform.knob_resolve('custom','system_enabled', null) #>> '{}' into v_switch;
  if v_switch is distinct from 'false' then
    raise exception 'PRECONDITION: custom/system_enabled resolves "%" globally and block 1 is about what OFF does.', v_switch;
  end if;

  -- WHO IS WRITING. platform.associations refuses an automated write that does not name the
  -- system doing it, and the store reaches that table through platform._gc_entity_associations.
  perform set_config('app.actor_system', 'campaign-test/v1_fixes_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Trailhead & Torch Journeys', 'trailhead-torch-' || substr(v_org::text, 1, 8), 'TTJ', c_admin);
  -- A seat is a PERSON, and a person reaches an organization only through a membership.
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- And the store answers a person only where it is switched on.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'v1_fixes_green');

  -- A Home has no client door of its own (it is made by the onboarding path, not by a
  -- person's browser), so this one fixture row is written by the connected role.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
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

  -- The Table and its one column, THROUGH THE DOORS a person has. The old file INSERTed the
  -- Field row straight into `custom.record`, which needs a table privilege no person holds.
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

  -- ══ 1. THE SWITCH HOLDS THROUGH THE DOOR ════════════════════════════════════════
  -- The switch screen's own door turns THIS organization's store off, from the seat.
  v_res := platform.unified_data_store_set(v_org, false, c_admin, 'v1_fixes_green 1');
  if coalesce((v_res ->> 'switched_on')::boolean, true) is not false then
    raise exception 'GREEN 1 fixture: the switch door said it turned the store off and it reads on: %', v_res;
  end if;

  -- 1a. THE TABLE ITSELF is not reachable from this seat at all — no privilege, no door.
  --     This half is about the wall, not the switch; the switch is 1b's and 1c's.
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, v_table, 'record', jsonb_build_object('nm', 'direct'));
    raise exception 'GREEN 1a FAILED: a signed-in person INSERTed straight into custom.record.';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    raise notice '1a. the DIRECT insert is refused by name: "%"', v_msg;
  end;

  -- 1b. THE DEFECT'S OWN QUESTION: the same person, through the door that is SECURITY
  --     DEFINER owned by the table's owner. The guard used to read `current_user`, which the
  --     door had already rewritten to the owner, so the switch never held. It reads
  --     `custom.caller_role()` now, and the door refuses — naming itself.
  v_caught := null;
  begin
    v_rec := custom.record_write(v_org, v_table, jsonb_build_object('nm', 'through the door'));
  exception when others then
    get stacked diagnostics v_caught = message_text, v_hint = pg_exception_hint;
  end;
  if v_caught is null then
    raise exception 'GREEN 1b FAILED: "authenticated" wrote record % THROUGH custom.record_write while this organization''s store is switched off. The door still launders the caller.', v_rec;
  end if;
  if v_caught not like '%custom.record_write%' then
    raise exception 'GREEN 1b FAILED: refused, but the refusal does not name the door it was refused at: "%"', v_caught;
  end if;
  -- 🚨 RED-SUITES 2026-09-21 — RE-PINNED TO THE SENTENCE THE DOOR GIVES NOW, WHICH IS BETTER.
  -- This clause used to demand the words "switched off". The ruling that changed them is
  -- `limitsfix_a_new_organization_has_the_store_on.sql`: real-data crew D built a table and its
  -- columns before any door mentioned the switch, and the refusal they finally met named a knob,
  -- a campaign checklist and a database role — nothing a person could act on. The door is
  -- exactly as closed; the sentence now says WHOSE organization it is about and the HINT says
  -- WHERE the switch is. So the clause asserts the promise rather than the old phrasing, and it
  -- asserts the remedy too — which the old one never did.
  if v_caught not ilike '%has not turned the record store on%' then
    raise exception 'GREEN 1b FAILED: refused, but the refusal does not say this organization has not turned the store on: "%"', v_caught;
  end if;
  if coalesce(v_hint, '') not ilike '%turn the record store on%' then
    raise exception 'GREEN 1b FAILED: refused and said the store is off, but told the person nothing about where to turn it on: hint "%"', coalesce(v_hint, '<none>');
  end if;
  raise notice '1b. the SAME person THROUGH THE DOOR is refused, the refusal NAMES the door and the switch ("%"), and the hint says where to throw it.', v_caught;

  -- 1c. THE POSITIVE CONTROL, same person, same door, same table, switch back on — and it
  --     LANDS. A door that refused everything would pass 1b and fail here.
  v_res := platform.unified_data_store_set(v_org, true, c_admin, 'v1_fixes_green 1c');
  if not coalesce((v_res ->> 'switched_on')::boolean, false) then
    raise exception 'GREEN 1c FAILED: the switch door said it turned the store on and it reads off: %', v_res;
  end if;
  v_rec := custom.record_write(v_org, v_table, jsonb_build_object('nm', 'the person writes'));
  if (custom.read_record(v_org, v_rec, true) ->> 'nm') is distinct from 'the person writes' then
    raise exception 'GREEN 1c FAILED: the door refuses the person with the store ON too, so it is a wall and not a door.';
  end if;
  raise notice '1c. control — the same person writes through the same door once the store is on (record %).', v_rec;

  -- ══ 2. THE STORE OPENS THE ENVELOPE ═════════════════════════════════════════════
  v_rec := custom.record_write(v_org, v_table, jsonb_build_object('nm', 'first'));
  select actor, value_version into v_actor, v_ver from custom.value_read(v_org, v_rec, 'nm');
  if v_actor is null or v_ver <> 1 then
    raise exception 'GREEN 2a FAILED: a write that opened no envelope reads back actor % version % — the store is still leaving the envelope to the caller.',
      coalesce(v_actor, '<NULL>'), v_ver;
  end if;
  raise notice '2a. a write that opened NO envelope reads back actor "%" at version %.', v_actor, v_ver;

  perform custom.record_update(v_org, v_rec, jsonb_build_object('nm', 'second'));
  select value_version into v_ver from custom.value_read(v_org, v_rec, 'nm');
  if v_ver <> 2 then
    raise exception 'GREEN 2b FAILED: the value moved first -> second and its version is %, not 2.', v_ver;
  end if;
  raise notice '2b. the value moved first -> second and its version moved 1 -> %.', v_ver;

  perform custom.record_update(v_org, v_rec, jsonb_build_object('nm', 'second'));
  select value_version into v_ver from custom.value_read(v_org, v_rec, 'nm');
  if v_ver <> 2 then
    raise exception 'GREEN 2c FAILED: re-asserting the SAME value moved the version to %. A version counts changes, not writes.', v_ver;
  end if;
  raise notice '2c. control — re-asserting the same value leaves the version at %.', v_ver;

  -- ══ 3. AN AGENT SAYS WHO IT ACTS FOR ════════════════════════════════════════════
  v_caught := null;
  begin
    perform custom.record_write(v_org, v_table,
      jsonb_build_object('nm', 'agent wrote this', '_actor', 'agent'));
  exception when others then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'GREEN 3a FAILED: an agent write naming nobody landed.';
  end if;
  raise notice '3a. an agent write naming nobody is refused: "%"', v_caught;

  v_rec := custom.record_write(v_org, v_table, jsonb_build_object(
    'nm', 'agent for somebody', '_actor', 'agent', '_on_behalf_of', c_dana));
  select actor, on_behalf_of into v_actor, v_obo from custom.value_read(v_org, v_rec, 'nm');
  if v_actor <> 'agent' or v_obo is distinct from c_dana::text then
    raise exception 'GREEN 3b FAILED: the agent write that DOES name its person reads back actor % on behalf of %.',
      coalesce(v_actor,'<NULL>'), coalesce(v_obo,'<NOBODY>');
  end if;
  raise notice '3b. control — the same write naming its person lands, actor "%" on behalf of %.', v_actor, v_obo;

  -- ══ 4. A VALUE HAS A PUBLISHED CEILING ══════════════════════════════════════════
  v_caught := null;
  begin
    perform custom.record_write(v_org, v_table,
      jsonb_build_object('nm', repeat('x', 5 * 1024 * 1024)));
  exception when others then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'GREEN 4a FAILED: a 5 MB value landed.';
  end if;
  if v_caught not like '%nm%' then
    raise exception 'GREEN 4a FAILED: refused, but the refusal does not name the field: "%"', v_caught;
  end if;
  raise notice '4a. the 5 MB value is refused, naming the field: "%"', left(v_caught, 120);

  v_rec := custom.record_write(v_org, v_table, jsonb_build_object('nm', repeat('y', 99000)));
  -- Read back THROUGH THE DOOR, which is what a person is shown.
  v_bytes := octet_length(custom.read_record(v_org, v_rec, true) ->> 'nm');
  if v_bytes < 99000 then
    raise exception 'GREEN 4b FAILED: a 99,000-byte value under the 100,000 ceiling did not land whole (% bytes).', v_bytes;
  end if;
  raise notice '4b. control — a 99,000-byte value, under the published ceiling, lands whole (% bytes).', v_bytes;

  -- ══ 5. THE NEGATIVE CLAUSE, AS A REAL SECOND PERSON ═════════════════════════════
  -- `test@test.com` is a member of this organization and was shared nothing. Every refusal
  -- above is a STORE RULE; this one is the ACCESS question, which the old seat could not ask
  -- at all: as a member of the role that owns custom.record,
  -- `custom.assert_client_may_reach` returned true on its first line for every organization
  -- on the database.
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 5a. She cannot write into a table nobody gave her.
  v_caught := null;
  begin
    perform custom.record_write(v_org, v_table, jsonb_build_object('nm', 'sneaked in'));
  exception when others then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'GREEN 5a FAILED: test@test.com wrote a record into a table nobody shared with her';
  end if;
  raise notice '5a. test@test.com is refused a write into a table nobody gave her: "%"', left(v_caught, 120);

  -- 5b. Nor change the SHAPE of a table she is not an admin of.
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_table, jsonb_build_object('label','Sneaked in','plain','text'));
  exception when others then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'GREEN 5b FAILED: test@test.com added a column to a table she is not an admin of';
  end if;
  raise notice '5b. test@test.com is refused a column on a table she is not an admin of: "%"', left(v_caught, 120);

  -- 5c. Nor CHANGE a record nobody gave her at `editor`.
  --     MEASURED 2026-09-19, and it is the product's rule rather than a defect: she READS it,
  --     because a record's default visibility lane is the organization and she is a member of
  --     this one. Reading is not changing; the ladder bites at `editor`, and that is the
  --     clause worth asserting.
  v_caught := null;
  begin
    perform custom.record_update(v_org, v_rec, jsonb_build_object('nm', 'Dana was here'));
  exception when others then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'GREEN 5c FAILED: test@test.com changed a record nobody gave her';
  end if;
  raise notice '5c. test@test.com is refused a change to a record nobody gave her: "%"', left(v_caught, 120);

  -- 5d. THE CONTROL, so 5a-5c are not a door that refuses her everything: the record she IS
  --     given at `editor`, she changes — the same call, the same person, the same record.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_rec, 'user', c_dana, 'editor'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  perform custom.record_update(v_org, v_rec, jsonb_build_object('nm', 'Dana was here'));
  if (custom.read_record(v_org, v_rec, true) ->> 'nm') <> 'Dana was here' then
    raise exception 'GREEN 5d FAILED: the record shared with test@test.com at editor did not take her change';
  end if;
  raise notice '5d. control — the same record, shared with her at editor, takes her change.';
  perform set_config('request.jwt.claims', c_admin_j, true);

  raise notice '=== W1-V1-FIXES GREEN — findings 1 to 4 closed against the live objects on the MAIN database, every clause from the seat `authenticated`, each with a positive control, plus the access clauses 5a-5d as a real second person. This transaction rolls back. ===';
end;
$t$;

rollback;

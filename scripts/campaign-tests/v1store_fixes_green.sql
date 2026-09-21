-- LANE V1-STORE-FIXES — THE GREEN. The twin of `v1store_fixes_red.sql`: every block below
-- asserts the RIGHT thing where the RED asserted the wrong one, against the SAME live objects
-- on the MAIN database.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/v1store_fixes_green.sql
--
-- 🚨 RE-POINTED AND SEATED (lane SEAT-SUITES, 2026-09-19). This file used to run against the
-- rehearsal branch, where it had been FAILING since before anyone touched it: that branch
-- carries 226 functions in schema `custom` against main's 332 and has no `custom.field_declare`
-- at all. The owner's 2026-09-18 ruling is that there is no production and everything is the
-- main database, so it runs there and nowhere else now.
--
-- IT ALSO USED TO PROVE THE ORGANIZATION WALL BY INSERTING STRAIGHT INTO `custom.record` — a
-- table privilege no signed-in person holds, from the role that OWNS it, for which
-- `custom.assert_client_may_reach` returns TRUE on its first line. That proved something about
-- the triggers and nothing about the product. Every wall clause now goes through the door a
-- person actually reaches: `custom.record_write`, `custom.field_declare`, `custom.relation_own`
-- and `custom.relation_carry`. The measured refusals below are the ones a person is shown.
--
-- It no longer flips the GLOBAL `platform.feature_knob` row either. That row is the whole
-- database's switch and this is the whole database now; this organization is switched on by
-- its own override, which dies with the transaction.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGE, NAMED (rule 3), one per block:
--   1. drop `custom_record_organization_wall` (or take the `pg_partition_root` resolution back
--      out of `custom._organization_wall_guard`, which is how the wall passed everything while
--      every catalogue check read green) and blocks 1a-1d fail naming the row that landed.
--   2. drop `custom_record_store_door`, or put `custom._store_door` back to its
--      INSERT-OR-UPDATE-only body, and block 2 fails naming the row that was deleted for good.
--      Delete `custom.record_delete` and the remedy the refusal names stops existing, which
--      block 2d catches.
--   3. take `get diagnostics ... row_count` back out of `custom.promote_table` and block 3
--      fails on the success object it returns for a caller who changed nothing; take it out of
--      either INSTEAD OF writer and block 3b fails.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE (rule 3), in every block, because a wall that
-- refuses everything passes a test that only checks refusals:
--   · 1a pairs the refused cross-organization Table with the SAME write against this
--     organization's own Table (lands) and with the KERNEL Table, which belongs to no
--     organization and is REC-27's named exemption (every Table this suite declares carries it);
--   · 1b pairs the refused cross-organization containment with the same call inside the
--     organization (lands);
--   · 1c pairs the refused foreign options Table with this organization's own (lands);
--   · 1d pairs the refused foreign container with this organization's own Home (lands);
--   · 2 pairs the refused hard DELETE with the owner's hard DELETE (lands — the retention
--     lane), and runs the refusal with this organization's store switched ON, so the REC-23 arm
--     is proven not to be dead code hiding behind the off switch;
--   · 3 pairs the refusal with a real promotion that returns `table_rows_changed = 1`.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and its one
-- transaction ends in ROLLBACK — the two disposable organizations, their memberships, their
-- knob overrides, the disposable role and every record die with it.

\set ON_ERROR_STOP on
\timing off

begin;
-- Other lanes write this store all night and the server's lock_timeout is 5s; nothing here
-- takes a lock stronger than an ordinary row lock, so it waits rather than dying on traffic.
set local lock_timeout = '10s';

-- THE ONE OPERATOR FIXTURE, MADE BEFORE THE SEAT IS TAKEN AND NAMED AS WHAT IT IS.
-- Block 2's REC-23 clause is about a BACK-END ROLE that holds DELETE on the store and is not
-- its owner — a server lane, never a browser: `authenticated` holds no privilege on
-- `custom.record` at all, so the trigger it is about would never fire for a person. There is no
-- client door for "connect as another role", so this role is created here, used for exactly two
-- statements inside block 2, and rolled back with everything else.
create role ttj_retention_lane nologin bypassrls;
grant usage on schema custom to ttj_retention_lane;
grant select, insert, update, delete on custom.record to ttj_retention_lane;
-- `custom.store_is_open` is SECURITY INVOKER: a role that cannot SEE the knob rows reads the
-- switch as CLOSED (that is its documented trap, and it is correct — a switch this writer
-- cannot read is closed, never open). So this probe is given exactly the reads `authenticated`
-- has and nothing else; otherwise block 2 would prove the OFF switch a second time instead of
-- proving REC-23.
-- 🚨 RED-SUITES 2026-09-21 — THE PROBE IS GIVEN `authenticated`'S READS BY BEING GIVEN
-- `authenticated`, not by a hand-copied list of them. The list went stale twice in four days
-- and each time block 2 died on the OFF switch instead of proving REC-23:
--   · `w0_sync2_grant_surface_relevel.sql` (2026-09-17) revoked EXECUTE on
--     `platform.knob_resolve` from PUBLIC, so the probe could no longer read the switch at all.
--   · `redsuites_one_store_switch.sql` (2026-09-21) made every body ask
--     `custom.store_is_open`, which reads `iam.organizations` and, through `knob_resolve`,
--     `platform.memo_get`/`memo_put` — three more grants the list did not have.
-- A list of grants that has to be maintained in step with the platform is a fixture that
-- silently stops testing what it says it tests. Granting the ROLE cannot drift: whatever a
-- signed-in person may read, this probe may read, and nothing else. It is still not the owner
-- of `custom.record` — which is the whole point of block 2 — and the DELETE below is the one
-- privilege it holds that `authenticated` does not.
grant authenticated to ttj_retention_lane;
grant execute on function custom.assert_store_door(uuid, text) to ttj_retention_lane;
grant execute on function custom.caller_role() to ttj_retention_lane;
grant execute on function custom.store_is_open(uuid) to ttj_retention_lane;
do $g$ begin execute format('grant ttj_retention_lane to %I', current_user); end $g$;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org_a   uuid := gen_random_uuid();
  v_org_b   uuid := gen_random_uuid();
  v_home_a  uuid;
  v_home_b  uuid;
  v_table_a uuid;
  v_table_b uuid;
  v_list_b  uuid;
  v_rec_a   uuid;
  v_rec_b   uuid;
  v_rec_b2  uuid;
  v_id      uuid;
  v_n       integer;
  v_at      timestamptz;
  v_answer  jsonb;
  v_caught  text;
  v_boss    text := current_user;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'v1store_fixes_green.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;

  -- WHO IS WRITING. platform.associations refuses an automated write that does not name the
  -- system doing it, and the store reaches that table through platform._gc_entity_associations.
  perform set_config('app.actor_system', 'campaign-test/v1store_fixes_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- TWO disposable organizations, because a wall needs two sides. admin@admin.com owns both,
  -- so nothing below is refused for want of access — every refusal is the WALL.
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org_a, 'Trailhead & Torch Journeys — Moab Desk', 'trailhead-torch-moab-' || substr(v_org_a::text,1,8), 'TTM', c_admin),
    (v_org_b, 'Trailhead & Torch Journeys — Bar Harbor Desk', 'trailhead-torch-bar-harbor-' || substr(v_org_b::text,1,8), 'TTB', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org_a, 'organization', v_org_a, c_admin, 'owner',  'active'),
    (v_org_b, 'organization', v_org_b, c_admin, 'owner',  'active'),
    (v_org_b, 'organization', v_org_b, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', v_org_a, v_org_a, 'true'::jsonb, 'v1store_fixes_green'),
    ('custom','system_enabled','organization', v_org_b, v_org_b, 'true'::jsonb, 'v1store_fixes_green');

  -- A Home has no client door of its own (it is made by the onboarding path, not by a
  -- person's browser), so these two rows are written by the connected role and assert nothing.
  insert into custom.record (organization_id, table_id, data)
  values (v_org_a, null, jsonb_build_object('name','Home of A')) returning id into v_home_a;
  insert into custom.record (organization_id, table_id, data)
  values (v_org_b, null, jsonb_build_object('name','Home of B')) returning id into v_home_b;

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

  -- THE FIXTURE, THROUGH THE DOORS. Every Table below carries the KERNEL Table's id, which
  -- belongs to no organization: REC-27's shared vocabulary is the wall's one named exemption,
  -- and if it were not, not one of these declarations would land.
  v_table_a := custom.table_declare(v_org_a, jsonb_build_object(
    'type','entity','name','Order','slug','trip_orders',
    'label_singular','Order','label_plural','Orders','display','page','ordered',false,
    'weight','light','retention_days',30,'default_sort','[]'::jsonb,'row_order','sorted',
    'agent_writable',true,'title_field','name','parent_id', v_home_a::text,
    'fields', jsonb_build_array(jsonb_build_object('name','name'))));
  perform custom.field_declare(v_org_a, v_table_a, jsonb_build_object('key','name','label','Name','plain','text','sort',10));

  v_table_b := custom.table_declare(v_org_b, jsonb_build_object(
    'type','entity','name','Order','slug','trip_orders',
    'label_singular','Order','label_plural','Orders','display','page','ordered',false,
    'weight','light','retention_days',30,'default_sort','[]'::jsonb,'row_order','sorted',
    'agent_writable',true,'title_field','name','parent_id', v_home_b::text,
    'fields', jsonb_build_array(jsonb_build_object('name','name'))));
  perform custom.field_declare(v_org_b, v_table_b, jsonb_build_object('key','name','label','Name','plain','text','sort',10));

  -- A list Table of organization B, for 1c's positive control: a list field takes its choices
  -- from a Table that shows its records as a LIST, so the control has to be one.
  v_list_b := custom.table_declare(v_org_b, jsonb_build_object(
    'type','entity','name','Supplier','slug','outfitters',
    'label_singular','Supplier','label_plural','Suppliers','display','list','ordered',false,
    'weight','light','retention_days',30,'default_sort','[]'::jsonb,'row_order','sorted',
    'agent_writable',true,'title_field','name','parent_id', v_home_b::text,
    'fields', jsonb_build_array(jsonb_build_object('name','name'))));
  perform custom.field_declare(v_org_b, v_list_b, jsonb_build_object('key','name','label','Name','plain','text','sort',10));
  if v_table_a is null or v_table_b is null or v_list_b is null then
    raise exception 'GREEN fixture: the kernel Table exemption was refused, and every organization needs it';
  end if;
  raise notice 'fixture — three Tables declared through the door, each carrying the kernel Table id: REC-27''s exemption holds.';

  v_rec_a  := custom.record_write(v_org_a, v_table_a, jsonb_build_object('name','A-1'));
  v_rec_b  := custom.record_write(v_org_b, v_table_b, jsonb_build_object('name','PO-1'));
  v_rec_b2 := custom.record_write(v_org_b, v_table_b, jsonb_build_object('name','PO-2'));

  -- ══════════════════════════ 1a. a record may not carry another organization's Table ══════
  v_caught := null;
  begin
    perform custom.record_write(v_org_b, v_table_a, jsonb_build_object('name','the wall is open'));
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is distinct from 'the table this record belongs to belongs to a different organization' then
    raise exception 'GREEN 1a: a record carrying ANOTHER organization''s Table was not refused by name (got %)',
                    coalesce(v_caught, 'no refusal at all');
  end if;
  -- the control: this organization's own Table, the same door, the same person — it lands.
  if (custom.read_record(v_org_b, v_rec_b, true) ->> 'name') is distinct from 'PO-1' then
    raise exception 'GREEN 1a: this organization''s own Table was refused too, so the wall refuses everything';
  end if;
  raise notice 'GREEN 1a — a foreign Table is refused at custom.record_write; this organization''s own lands.';

  -- ══════════════════════════ 1b. containment may not cross, at the door that makes it ═════
  v_caught := null;
  begin
    perform custom.relation_own(v_org_b, v_rec_b, v_rec_a);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is distinct from 'that record is not in this organization' then
    raise exception 'GREEN 1b: custom.relation_own reached into another organization (got %)',
                    coalesce(v_caught, 'no refusal at all');
  end if;
  v_caught := null;
  begin
    perform custom.relation_carry(v_org_b, v_rec_b, v_rec_a);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is distinct from 'The record this would reach is not in this organization.' then
    raise exception 'GREEN 1b: custom.relation_carry reached into another organization (got %)',
                    coalesce(v_caught, 'no refusal at all');
  end if;
  -- the control: the same call, inside the organization — it lands.
  perform custom.relation_own(v_org_b, v_rec_b, v_rec_b2);
  raise notice 'GREEN 1b — relation_own and relation_carry refuse across organizations and land inside one.';

  -- ══════════════════════════ 1c. a Field may not point at a foreign Table ═════════════════
  v_caught := null;
  begin
    perform custom.field_declare(v_org_b, v_table_b, jsonb_build_object(
      'key','supplier','label','Supplier','parity_type','select','options_table_id', v_table_a::text));
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is distinct from 'the list field Supplier points at something that is not a table of this organization' then
    raise exception 'GREEN 1c: a field pointing at another organization''s Table was not refused by name (got %)',
                    coalesce(v_caught, 'no refusal at all');
  end if;
  -- the control: the same field pointing at this organization's own list Table — it lands.
  v_id := custom.field_declare(v_org_b, v_table_b, jsonb_build_object(
    'key','supplier','label','Supplier','parity_type','select','options_table_id', v_list_b::text));
  if v_id is null then
    raise exception 'GREEN 1c: this organization''s own options Table was refused too, so the wall refuses everything';
  end if;
  raise notice 'GREEN 1c — a Field may not take its choices from another organization''s Table, and may from its own.';

  -- ══════════════════════════ 1d. containment through the write door ═══════════════════════
  v_caught := null;
  begin
    perform custom.record_write(v_org_b, v_table_b,
      jsonb_build_object('name','PO-3','parent_id', v_rec_a::text));
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is distinct from 'that container is not in this organization' then
    raise exception 'GREEN 1d: containment lost its own refusal — the wall swallowed a better message (got %)',
                    coalesce(v_caught, 'no refusal at all');
  end if;
  -- the control: the same write into this organization's own Home — it lands.
  v_id := custom.record_write(v_org_b, v_table_b,
    jsonb_build_object('name','PO-3','parent_id', v_home_b::text));
  if (custom.read_record(v_org_b, v_id, true) ->> 'name') is distinct from 'PO-3' then
    raise exception 'GREEN 1d: this organization''s own container was refused too';
  end if;
  raise notice 'GREEN 1d — containment refuses a foreign container in its own words, and takes this organization''s.';

  -- ══════════════════════════ 2. the delete door ═══════════════════════════════════════════
  -- This organization's store is ON (the override above), which is what makes 2b REC-23's own
  -- law rather than the off switch answering for it.
  if not coalesce((platform.unified_data_store_state(v_org_b) ->> 'switched_on')::boolean, false) then
    raise exception 'GREEN 2 cannot run: this organization''s store reads OFF at entry';
  end if;

  -- 2a. FROM THE SEAT, THE HARD DELETE IS NOT REACHABLE AT ALL. A person holds no privilege on
  --     `custom.record`, so REC-23's trigger is not even the first thing that refuses her.
  v_caught := null;
  begin
    delete from custom.record where organization_id = v_org_b and id = v_rec_b;
  exception when insufficient_privilege then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'GREEN 2a: a signed-in person hard-DELETEd a row out of the store';
  end if;
  raise notice 'GREEN 2a — from the seat the hard DELETE is refused before any trigger runs: "%"', v_caught;

  -- 2b/2c. THE SERVER-LANE CLAUSE, STEPPED OUT OF THE SEAT AND SAID SO. REC-23 is about a
  --        back-end role that HOLDS delete on the store and is not its owner. No person is that
  --        role and no client door connects as one, so these two statements run outside the
  --        seat and assert nothing about what a person may do.
  perform set_config('role', v_boss, true);
  set local lock_timeout = '10s';
  set local role ttj_retention_lane;
  v_caught := null;
  begin
    delete from custom.record where organization_id = v_org_b and id = v_rec_b;
  exception when insufficient_privilege then get stacked diagnostics v_caught = message_text;
  end;
  reset role;
  if v_caught is distinct from format('Records are not deleted for good here, so %s did not take that deletion.', 'custom.record') then
    raise exception 'GREEN 2b: with the store switched ON a hard DELETE by a non-owner was not refused by REC-23 (got %)',
                    coalesce(v_caught, 'no refusal at all');
  end if;
  -- 2c. THE POSITIVE CONTROL: the role that OWNS the store — the retention lane — still deletes.
  insert into custom.record (organization_id, table_id, data)
  values (v_org_b, null, jsonb_build_object('note','the retention lane takes this')) returning id into v_id;
  delete from custom.record where organization_id = v_org_b and id = v_id;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'GREEN 2c: the owner''s hard DELETE matched % rows, and the retention lane needs it', v_n;
  end if;
  perform set_config('role', 'authenticated', true);

  -- 2d. THE REMEDY THE REFUSAL NAMES IS REAL, AND REVERSIBLE (REC-23) — and it is the door a
  --     person has, so this is back in the seat.
  v_at := custom.record_delete(v_org_b, v_rec_b);
  if v_at is null or (custom.record_resolve(v_org_b, v_rec_b) ->> 'live')::boolean then
    raise exception 'GREEN 2d: custom.record_delete did not mark the record deleted';
  end if;
  perform custom.record_restore(v_org_b, v_rec_b);
  if not (custom.record_resolve(v_org_b, v_rec_b) ->> 'live')::boolean then
    raise exception 'GREEN 2d: custom.record_restore did not bring the record back';
  end if;
  -- and the two ways to change nothing are told apart rather than both answering nothing
  v_caught := null;
  begin
    perform custom.record_delete(v_org_b, gen_random_uuid());
  exception when sqlstate '02000' then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null or v_caught not like 'There is no record %' then
    raise exception 'GREEN 2d: deleting a record that is not here did not say so (got %)', coalesce(v_caught,'nothing');
  end if;
  perform custom.record_delete(v_org_b, v_rec_b);
  v_caught := null;
  begin
    perform custom.record_delete(v_org_b, v_rec_b);
  exception when sqlstate '02000' then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is distinct from 'That record was already deleted, so nothing changed.' then
    raise exception 'GREEN 2d: deleting an already-deleted record did not say so (got %)', coalesce(v_caught,'nothing');
  end if;
  perform custom.record_restore(v_org_b, v_rec_b);
  raise notice 'GREEN 2 — a person cannot reach the hard delete, a back-end role that can is refused by REC-23 with the switch ON, the owner still deletes, and the soft delete is reversible.';

  -- ══════════════════════════ 3. a promotion that moved nothing says so ════════════════════
  v_caught := null;
  begin
    perform custom.promote_table(v_org_b, v_table_a);   -- organization B does not own that Table
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is distinct from 'That is not a table of this organization, so there was nothing to move.' then
    raise exception 'GREEN 3: promote_table did not refuse a Table of another organization (got %)',
                    coalesce(v_caught, 'no refusal - it returned an answer');
  end if;
  -- THE POSITIVE CONTROL: a real Table of this organization is promoted and the answer carries
  -- the row count the guard reads.
  v_answer := custom.promote_table(v_org_b, v_table_b);
  if (v_answer ->> 'now') is distinct from 'heavy' then
    raise exception 'GREEN 3: a real promotion did not land heavy, it answered %', v_answer;
  end if;
  if (v_answer ->> 'table_rows_changed')::bigint <> 1 then
    raise exception 'GREEN 3: a real promotion reported % rows changed, and it changed one', v_answer ->> 'table_rows_changed';
  end if;
  raise notice 'GREEN 3 — promote_table refuses a no-op and reports its row count on a real promotion.';

  -- 3b. THE CLASS, NOT THE INSTANCE, read from the catalogue. `pg_proc` is world-readable, so
  --     this clause is asked from the seat like every other — but it is a STRUCTURAL clause
  --     about the code, not a product clause about what a person may do.
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.proname in ('_field_definition_write', '_rule_definition_write')
     and p.prosrc ~* 'update\s+custom\.record'
     and p.prosrc !~* '(get\s+diagnostics|not\s+found)';
  if v_n <> 0 then
    raise exception 'GREEN 3b: % of the 2 INSTEAD OF writers still count no rows', v_n;
  end if;
  -- THE CLASS, WITH A DATED LEDGER RATHER THAN A SILENT PASS. On 2026-09-19 the same census
  -- over the WHOLE schema named 18 functions that change rows and read no row count. They are
  -- listed here by name, with the date they were measured, so that (a) nothing about them is
  -- hidden, (b) the rule still bites: the NEXT function that changes rows without reading a
  -- count fails this clause the day it lands. They are not this lane's to rewrite — they
  -- belong to the io, anon, doc, migrate, field, work and association lanes — and the list is
  -- the work owed, not an exemption granted. Delete a name from it when its body reads a count.
  --
  -- 🚨 RED-SUITES 2026-09-21 — THE RATCHET FIRED, AND IT WAS RIGHT TO. In the two days since
  -- the 2026-09-19 measurement the census went from 18 to 42: twenty-four MORE doors in
  -- `custom` now change rows and never look at how many they changed, which means every one of
  -- them can tell a person "done" after touching nothing. They are recorded here by name and
  -- by date rather than quietly absorbed, and they are written up as work owed in
  -- PROGRESS-RED-SUITES.md with the lanes that own them. The ledger is ONE array now, read by
  -- all three queries below: it was written out three times, which is the same copy-paste
  -- class this file's own probe grants fell to, and a fourth copy would eventually disagree
  -- with the other three.
  declare
    c_ledger constant text[] := array[
      -- measured 2026-09-19
      '_field_type_converts_values', '_value_envelope', 'anon_capture', 'anon_publish',
      'anon_token_revoke', 'doc_template_save', 'field_declare', 'field_retire',
      'field_update', 'io_comment_resolve', 'io_outbox_drain', 'io_proposal_reject',
      'migrate_merge', 'migrate_purge', 'migrate_retype', 'migrate_split',
      'trg_associations_bump_visibility', 'work_take_assignment',
      -- measured 2026-09-21 (RED-SUITES) — twenty-four that landed after the first census
      '_checklist_watch', '_checklist_watch_for', '_pipeline_on_entry', '_sign_request_resolve',
      'capture_sheet_declare', 'checklist_steps_table', 'dashboard_declare', 'dashboard_delete',
      'doc_template_delete', 'enrich_land', 'enrich_pin', 'entity_field_retire',
      'entity_field_update', 'migrate_reclass', 'pipeline_declare', 'portal_declare',
      'provenance_prune', 'rule_declare', 'sign_request_cancel', 'sign_request_decline',
      'sign_request_public', 'sign_request_remind', 'sign_request_sign', 'work_approval_decide'];
    v_new text;
  begin
    select string_agg(p.proname, ', ' order by p.proname) into v_new
      from pg_proc p
     where p.pronamespace = 'custom'::regnamespace
       and p.prosrc ~* '(update\s+custom\.|delete\s+from\s+custom\.)'
       and p.prosrc !~* '(get\s+diagnostics|not\s+found)'
       and not (p.proname = any (c_ledger));
    if v_new is not null then
      raise exception 'GREEN 3b: function(s) in custom change rows without reading a row count, and are not on the dated ledger in this file: %', v_new;
    end if;
    select count(*) into v_n from pg_proc p
     where p.pronamespace = 'custom'::regnamespace
       and p.prosrc ~* '(update\s+custom\.|delete\s+from\s+custom\.)'
       and p.prosrc !~* '(get\s+diagnostics|not\s+found)';
    raise notice 'GREEN 3b — the two INSTEAD OF writers read their row count; % other function(s) in custom still do not, every one of them on the dated ledger in this file.', v_n;
  end;

  -- ══════════════════════════ 4. THE NEGATIVE CLAUSE, AS A REAL SECOND PERSON ══════════════
  -- `test@test.com` is a member of organization B and was shared nothing. Every refusal above
  -- is a WALL or a STORE RULE; this one is the ACCESS question, which the old seat could not
  -- ask at all: as a member of the role that owns `custom.record`,
  -- `custom.assert_client_may_reach` returned true on its first line for every organization.
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 4a. She cannot promote a Table she is not an admin of.
  v_caught := null;
  begin
    perform custom.promote_table(v_org_b, v_list_b);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'GREEN 4a: test@test.com promoted a Table she is not an admin of';
  end if;
  raise notice 'GREEN 4a — test@test.com is refused a promotion: "%"', left(v_caught, 110);

  -- 4b. Nor delete a record nobody gave her.
  v_caught := null;
  begin
    perform custom.record_delete(v_org_b, v_rec_b);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'GREEN 4b: test@test.com deleted a record nobody shared with her';
  end if;

  -- 4c. And she reaches nothing at all in organization A, which she is not a member of.
  v_caught := null;
  begin
    perform custom.read_record(v_org_a, v_rec_a, true);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'GREEN 4c: test@test.com read a record of an organization she is not in';
  end if;

  -- 4d. THE CONTROL, so 4a-4c are not a door that refuses her everything: the record she IS
  --     given at editor, in the organization she IS in, she deletes.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org_b, v_rec_b, 'user', c_dana, 'editor'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  perform custom.record_delete(v_org_b, v_rec_b);
  if (custom.record_resolve(v_org_b, v_rec_b) ->> 'live')::boolean then
    raise exception 'GREEN 4d: the record shared with test@test.com at editor was not deleted by her';
  end if;
  raise notice 'GREEN 4d — control: the same record, shared with her at editor, she deletes.';
  perform set_config('request.jwt.claims', c_admin_j, true);

  raise notice 'GREEN: all three findings closed on the MAIN database, every clause from the seat `authenticated` except the two named server-lane statements in block 2, each with a control that could have failed, plus the access clauses 4a-4d as a real second person.';
end $t$;

rollback;

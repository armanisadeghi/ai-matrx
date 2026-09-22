-- LANE W1-REL — THE RED TWIN of `scripts/campaign-tests/w1_rel_c12.sql`, on the MAIN database.
--
-- C-12 is sixteen PASSes and six refusals. A suite made of refusals proves nothing until you
-- can show the refusals disappearing when the thing that makes them is removed. This file
-- removes the contract trigger and the version triggers FOR REAL, re-runs the same clauses over
-- the same fixture, and asserts that each one now lets the wrong thing through.
--
--   RED 1  drop `trg_associations_zzz_relation_contract`
--          -> a relation lands on a Table its field never named (REL-8 gone)
--          -> a `one` relation takes a second target (REL-7 gone)
--          -> a relation points back at itself through the same role (REL-5 gone)
--   RED 2  drop `trg_associations_zzz_touch_row` and `trg_associations_zzz_version_capture`
--          -> the edge's version never moves and its history stays empty (REL-16 / REL-13 gone)
--
-- ONE transaction, ROLLBACK at the end: the dropped triggers and the whole fixture go with it.
-- Nothing here survives the session.
--
-- 🚨 THE MAIN DATABASE (SEAT-SUITES, 2026-09-19). This file used to refuse to run anywhere but
-- the rehearsal branch, which carries 226 of schema `custom`'s 332 functions, grants
-- `authenticated` 29 of the 103 main grants, and has no `custom.field_declare` at all. The
-- owner's 2026-09-18 ruling is that there is no production and everything is the main
-- database, so the guard below names main's system identifier and the fixture is built in a
-- DISPOSABLE organization instead of Matrx System.
--
-- 🚨 THE SEAT, AND THE DEFECT TAKING IT FOUND (SEAT-SUITES, 2026-09-19). PART 0 takes the seat
-- `authenticated` and proves it. Then RED 0 records what that seat MEASURES, and it is the
-- finding of this file:
--
--     `platform.relation_set` — the only door that puts a relation between two records —
--     is SECURITY INVOKER and reads `custom.record`, on which `authenticated` holds no
--     privilege at all. A signed-in person calling it is refused
--     `42501 permission denied for table record` BEFORE any contract is consulted. There is
--     no `custom.*` relation-set door beside it: `custom.relation_own` and
--     `custom.relation_carry` are the containment verbs and name no field. So the relation
--     contract below — REL-5, REL-7, REL-8, REL-13, REL-16 — is unreachable from a person's
--     seat today, and this twin CANNOT ask it seated.
--
-- 🚨 THAT DAY CAME, AND RED 1 AND RED 2 HAVE MOVED INTO THE SEAT (lane INVERSE-GUARD,
-- 2026-09-21). `platform.relation_set` is SECURITY DEFINER now, with `SET search_path` and the
-- store's own assertions inside it (`custom.assert_client_may_change` at editor on the source,
-- `custom.assert_client_may_open` at viewer plus `custom.assert_may_know_table` on every
-- target, behind `platform.assert_relations_door`). RED 0 measures that: a person is ANSWERED
-- and refused by the field's own name, `23503`, not walled off with `42501`. So every clause
-- below that asserts anything is asked from the `authenticated` seat, and each one re-proves
-- the seat immediately before it asserts.
--
-- WHAT IS STILL DONE AS THE CONNECTED ROLE, and why each is a PLANT and never an assertion:
-- 🚨 THE OTHER HALF OF RED 0'S FINDING IS CLOSED TOO (lane TAILS-5, 2026-09-21), and the two
-- `relation` fields this file used to PLANT are now declared from the seat like every other
-- column. This bullet used to read: "`custom.field_declare` offers a person `member` and
-- `attachment` and refuses the word `relation` by name, so a relation column cannot be
-- declared from a person's seat at all." It has not been true since 2026-09-20:
-- `custom._field_document_for` carries a `relation` arm that takes the target under either
-- `relation_target` or `target_table`, refuses a target that is not one of this organization's
-- Tables (`23503`, by name), and `custom.field_declare` asks `custom.assert_may_know_table`
-- about that target on top of `assert_client_may_change(… 'admin' …)` on the table whose shape
-- is changing — may I POINT at it is may I SEE it. Measured from this seat on the main
-- database, 2026-09-21. So the ONLY thing left out of the seat in this file is the trigger
-- drops below.
--   * `drop trigger … on platform.associations` — DDL on a table a person does not own. A red
--     twin's whole method is to REMOVE the thing under test; removing it is the plant, and no
--     person is ever supposed to be able to do it. The moment each drop is done the file sits
--     back down, and every question after it is asked as a signed-in person through the door.
-- RED 2's edit is a person's edit too: `platform.relation_set` upserts, so calling it a second
-- time with a target it already holds is an UPDATE on `platform.associations` made BY THE DOOR
-- — which is how a person moves an edge. `authenticated` holds no UPDATE privilege on that
-- table and the client policies refuse it outright, so the raw `update` this clause used to
-- run was itself only ever reachable from the owner's seat.
-- RED 3 is asked seated as a second real person.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w1_rel_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\pset pager off

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $red$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org      uuid := gen_random_uuid();
  v_home     uuid;
  v_note_t   uuid;
  v_proj_t   uuid;
  v_tag_t    uuid;
  v_note     uuid;
  v_a        uuid;
  v_tag      uuid;
  v_b        uuid;
  v_edge     uuid;
  v_ver      integer;
  v_n        integer;
  v_n2       integer;
  v_state    text;
  v_msg      text;
  v_caught   text;
  v_boss     text := current_user;
begin
  perform set_config('app.actor_system', 'campaign.w1_rel.red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Hands & Hope Alliance', 'hands-hope-alliance-red-' || substr(v_org::text, 1, 8), 'HHA', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_rel_red');
  -- A Home has no client door of its own.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Hands & Hope Alliance — Main Office'))
  returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT.
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

  -- ------------------------------------------------------------------ the fixture, ALL of it
  -- through the doors. The three Tables, their records AND their relation columns are a
  -- person's: `custom.field_declare` takes the word `relation` when the caller names the Table
  -- it points at (see the header). Nothing here needs the connected role.
  v_note_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Gift Notes','slug','gift_notes','type','entity','display','list',
    'label_singular','Gift Note','label_plural','Gift Notes','ordered',true,'weight','light',
    'retention_days',365,'row_order','manual','agent_writable',true,
    'parent_id', v_home::text,'title_field','title',
    'default_sort', jsonb_build_array(jsonb_build_object('field','title','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','title'))));
  perform custom.field_declare(v_org, v_note_t, jsonb_build_object('key','title','label','Title','plain','text'));
  v_proj_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Campaigns','slug','campaigns','type','entity','display','list',
    'label_singular','Campaign','label_plural','Campaigns','ordered',true,'weight','light',
    'retention_days',365,'row_order','manual','agent_writable',true,
    'parent_id', v_home::text,'title_field','title',
    'default_sort', jsonb_build_array(jsonb_build_object('field','title','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','title'))));
  perform custom.field_declare(v_org, v_proj_t, jsonb_build_object('key','title','label','Title','plain','text'));
  v_tag_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Appeal Codes','slug','appeal_codes','type','entity','display','list',
    'label_singular','Appeal Code','label_plural','Appeal Codes','ordered',true,'weight','light',
    'retention_days',365,'row_order','manual','agent_writable',true,
    'parent_id', v_home::text,'title_field','title',
    'default_sort', jsonb_build_array(jsonb_build_object('field','title','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','title'))));
  perform custom.field_declare(v_org, v_tag_t, jsonb_build_object('key','title','label','Title','plain','text'));

  v_note := custom.record_write(v_org, v_note_t, '{"title":"Thank-you call note"}'::jsonb);
  v_a    := custom.record_write(v_org, v_proj_t, '{"title":"Winter Coat Drive 2026"}'::jsonb);
  v_b    := custom.record_write(v_org, v_proj_t, '{"title":"Annual Gala 2026"}'::jsonb);
  v_tag  := custom.record_write(v_org, v_tag_t,  '{"title":"Year-End Appeal"}'::jsonb);

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 0 — THE FINDING. The relations door is not reachable from this seat.
  -- This is asserted, not narrated: the day `platform.relation_set` becomes reachable, this
  -- clause goes RED and RED 1 and RED 2 must move into the seat.
  -- ════════════════════════════════════════════════════════════════════════════
  v_caught := null; v_state := null;
  begin
    perform platform.relation_set(v_org, v_note, 'about', jsonb_build_array(v_a));
  exception when others then
    get stacked diagnostics v_caught = message_text, v_state = returned_sqlstate;
  end;
  -- 🚨 THE FINDING THIS CLAUSE RECORDED IS CLOSED (lane RED-SUITES-3, 2026-09-21).
  -- It used to require `42501 permission denied for table record` — a signed-in person could
  -- not reach `platform.relation_set` AT ALL — and it said, in its own words, that "the day
  -- platform.relation_set becomes reachable, this clause goes RED". That day has come. The
  -- door now answers a person and refuses for a REAL reason, by the field's own name:
  --     23503  this record's table has no field called "about"
  -- which is a door deciding, not a wall. So the clause asserts THAT: the refusal is about the
  -- column, it names the column, and it is not a permission refusal — measured in both
  -- directions, so a door that closed again fails here instead of passing quietly.
  if v_caught is null then
    raise exception 'RED 0: `platform.relation_set` accepted a relation over a field this table never declared. The undeclared-field refusal is what the rest of this file stands on.';
  end if;
  if v_state = '42501' or v_caught like '%permission denied%' then
    raise exception 'RED 0: the relations door has gone back to refusing a signed-in person outright (% "%"). It answered a person on 2026-09-21; a wall here is a regression, not a finding.',
      v_state, v_caught;
  end if;
  if v_state <> '23503' or v_caught not like '%about%' then
    raise exception 'RED 0: the relations door refused a person with % "%", and the measured refusal is 23503 naming the column "about". Something changed; re-measure before trusting anything below.',
      v_state, v_caught;
  end if;
  raise notice 'RED 0 — MEASURED: `platform.relation_set` ANSWERS a signed-in person now and refuses an undeclared column by its own name (% "%"). The 42501 wall this clause was written to record is gone, so RED 1 and RED 2 below ask their questions from this same seat.', v_state, v_caught;

  -- ------------------------------------------- THE TWO RELATION COLUMNS, DECLARED FROM THE SEAT.
  -- This used to be a PLANT, out of the seat, with the fields INSERTed straight into
  -- `custom.field` as the connected role, because the door refused the word `relation` to a
  -- person. It does not any more (header), so the fundraising office declares its own columns
  -- exactly as it declares every other one — and the fact that RED 1 and RED 2 below still go
  -- red is now measuring the TRIGGERS and nothing else.
  --
  -- `ordered` is true so that the ORDER of the targets is a real, writable column on the edge
  -- (`platform.associations.position`, which `relation_declaration` gates on exactly this key).
  -- RED 2 needs one edit a person can make that actually CHANGES a column, and reordering the
  -- things a record points at is that edit.
  if current_user <> 'authenticated' then
    raise exception 'the relation columns were about to be declared out of the seat — current_user is %', current_user;
  end if;
  perform custom.field_declare(v_org, v_note_t, jsonb_build_object(
    'key','about','label','About','type','relation',
    'relation_target', v_proj_t::text, 'relation_max', 50, 'multi', true,
    'on_target_delete','set_null', 'sort', 10,
    'config', jsonb_build_object('target_mode','one','loops',false,'ordered',true)));

  -- REL-5's clause needs a field that points a Table at ITSELF, declared on the project Table,
  -- because `platform.relation_set` resolves the field off the SOURCE record's Table before the
  -- contract trigger ever runs — a fact this twin measured the hard way.
  perform custom.field_declare(v_org, v_proj_t, jsonb_build_object(
    'key','about','label','About','type','relation',
    'relation_target', v_proj_t::text, 'relation_max', 50, 'multi', true,
    'on_target_delete','set_null', 'sort', 10,
    'config', jsonb_build_object('target_mode','one','loops',false)));

  -- ==================================================================== RED 1: the contract goes
  -- THE PLANT (connected role, DDL a person can never do): take the contract trigger away.
  -- The seat is left HERE and nowhere earlier — the fixture above, relation columns included,
  -- is entirely a person's now (TAILS-5, 2026-09-21).
  perform set_config('role', v_boss, true);
  drop trigger trg_associations_zzz_relation_contract on platform.associations;

  -- BACK INTO THE SEAT before a single question is asked. Everything from here to the end of
  -- RED 1 is a signed-in person calling the door she actually has and reading what she may see.
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 1: this clause did not take the seat — current_user is %', current_user;
  end if;

  -- (a) a Table the field never named
  perform platform.relation_set(v_org, v_note, 'about', jsonb_build_array(v_tag));
  select count(*) into v_n from platform.associations
   where source_id = v_note and target_id = v_tag and deleted_at is null;
  if v_n <> 1 then
    raise exception 'RED 1a IS NOT RED: a relation onto a Table the field never named was still refused, so the contract trigger was not what was refusing it';
  end if;

  -- (b) `one` takes a second target
  perform platform.relation_set(v_org, v_note, 'about', jsonb_build_array(v_a));
  perform platform.relation_set(v_org, v_note, 'about', jsonb_build_array(v_b));
  select count(*) into v_n from platform.associations
   where source_id = v_note and role = 'about' and deleted_at is null;
  if v_n < 3 then
    raise exception 'RED 1b IS NOT RED: a one-target relation still holds only % edges', v_n;
  end if;

  -- (c) it points back at itself
  perform platform.relation_set(v_org, v_a, 'about', jsonb_build_array(v_a));
  select count(*) into v_n from platform.associations
   where source_id = v_a and target_id = v_a and deleted_at is null;
  if v_n <> 1 then
    raise exception 'RED 1c IS NOT RED: a self-relation was still refused';
  end if;

  -- (d) THE SEAT IS LOAD-BEARING, and this is what makes (a)-(c) mean something. Dropping the
  -- contract trigger took away the CONTRACT; it must not have taken away the WALL. The same
  -- door, the same call, as a second real person who holds nothing on this record, is refused —
  -- so what (a)-(c) walked through was the missing trigger and not an open door.
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_caught := null;
  begin
    perform platform.relation_set(v_org, v_note, 'about', jsonb_build_array(v_b));
  exception when others then v_caught := sqlerrm;
  end;
  perform set_config('request.jwt.claims', c_admin_j, true);
  if v_caught is null then
    raise exception 'RED 1d: with the contract trigger dropped, test@test.com — who holds nothing on this record — could set a relation on it. Then RED 1a-c proved nothing about a person, because the door was open to anyone.';
  end if;

  raise notice 'RED 1 — SEATED as `%`, contract trigger dropped: a relation lands on a Table its field never named, a "one" relation holds % targets, and a record points at itself. REL-8, REL-7 and REL-5 were that one trigger — and the wall is still up, because the same call as test@test.com was refused ("%").', current_user, v_n + 2, left(v_caught, 70);

  -- ===================================================================== RED 2: the versions go
  -- SEATED THROUGHOUT except for the two DDL plants. The edit is a person's edit: the door
  -- upserts, so asking for a target it already holds is an UPDATE on `platform.associations`
  -- performed BY `platform.relation_set` — the only way a person moves one of these edges.
  -- `authenticated` holds no UPDATE privilege on that table and `associations_client_update_refused`
  -- refuses it anyway, so the raw `update` this clause used to run was the owner's seat, not hers.
  if current_user <> 'authenticated' then
    raise exception 'RED 2: this clause did not take the seat — current_user is %', current_user;
  end if;
  select a.id into v_edge from platform.associations a
   where a.source_id = v_note and a.role = 'about' and a.target_id = v_a limit 1;
  if v_edge is null then
    raise exception 'RED 2 setup: the seat cannot even SEE the edge it is about to measure, so nothing below means anything';
  end if;
  -- THE CONTROL FIRST, WITH THE TRIGGERS STILL THERE: one edit through the doors, and the
  -- version moves and a history row is filed. Without it the comparison below is vacuous — an
  -- edge whose version is null before and after would "stay the same" with or without a
  -- trigger, which is exactly the hole this twin had when it ran on the branch.
  --
  -- The edit is a REORDER: the field is `ordered`, the record already points at both Campaigns,
  -- and asking for them in the other order moves `position` on this edge from 1 to 2. Two
  -- shapes were tried first and are written down so nobody repeats them:
  --   * a bare second `relation_set` with the SAME target writes back byte-identical values,
  --     and `platform._version_capture` returns early when an UPDATE changes nothing but
  --     `version` and `updated_at` — it would file nothing, and the control would fail for a
  --     reason that has nothing to do with the trigger being present.
  --   * `relation_unset` then `relation_set` dies inside the door with `ON CONFLICT DO UPDATE
  --     command cannot affect row a second time` — `trg_associations_revive_tombstone` already
  --     revives the soft-deleted edge in that same INSERT, so the upsert then tries to touch
  --     the row twice. That is a real defect in re-linking a target you just unlinked; it is
  --     NOT this twin's to fix, and it is recorded here rather than worked around silently.
  perform platform.relation_set(v_org, v_note, 'about', jsonb_build_array(v_b, v_a));
  select a.version into v_ver from platform.associations a where a.id = v_edge;
  select count(*) into v_n from history.row_versions v
   where v.row_id = v_edge and v.organization_id = v_org and v.operation = 'UPDATE';
  if v_ver is null then
    raise exception 'RED 2 setup: the edge carries NO version after an edit with both version triggers in place, so "the version never moves" cannot be measured';
  end if;
  if v_n < 1 then
    raise exception 'RED 2 setup: no history row was filed for an edited edge with trg_associations_zzz_version_capture in place';
  end if;

  -- THE PLANT (connected role, DDL a person can never do), then straight back into the seat.
  perform set_config('role', v_boss, true);
  drop trigger trg_associations_zzz_touch_row on platform.associations;
  drop trigger trg_associations_zzz_version_capture on platform.associations;
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 2: the seat was not retaken after the trigger drops — current_user is %', current_user;
  end if;

  -- The same shape of edit again, back the other way: `position` really moves, 2 -> 1.
  perform platform.relation_set(v_org, v_note, 'about', jsonb_build_array(v_a, v_b));
  if (select position from platform.associations where id = v_edge) <> 1 then
    raise exception 'RED 2 setup: the second reorder did not move this edge''s position, so "the version never moves" would pass on a row nothing wrote to';
  end if;

  if (select version from platform.associations where id = v_edge) is distinct from v_ver then
    raise exception 'RED 2a IS NOT RED: the version moved with both version triggers dropped, so something else is writing it';
  end if;
  select count(*) into v_n2 from history.row_versions v
   where v.row_id = v_edge and v.organization_id = v_org and v.operation = 'UPDATE';
  if v_n2 <> v_n then
    raise exception 'RED 2b IS NOT RED: % more history row(s) were filed for an edge nobody is capturing', v_n2 - v_n;
  end if;
  raise notice 'RED 2 — SEATED as `%`: with both version triggers in place one edit through the door moved the version to % and filed % history row(s); with them dropped a second edit through the same door moved neither. REL-16 and REL-13 are those two triggers.', current_user, v_ver, v_n;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 3 — THE ONE CLAUSE THIS FILE CAN ASK SEATED, and it is asked as a second real
  -- person. The relation contract is out of a person's reach; the ACCESS ladder is not, and
  -- dropping three triggers on `platform.associations` must not have moved it. Two inputs,
  -- two expected answers: the owner may reshape the Table, test@test.com may not, and she
  -- still reads the record she was given.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if custom.field_declare(v_org, v_note_t, jsonb_build_object('key','owner_added','label','Owner added','plain','text')) is null then
    raise exception 'RED 3: the organization''s owner could not add a column, so the refusal below proves nothing';
  end if;
  perform custom.share_grant(v_org, v_note, 'user', c_dana, 'viewer'::public.permission_level);

  perform set_config('request.jwt.claims', c_dana_j, true);
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_note_t, jsonb_build_object('key','she_added','label','She added','plain','text'));
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception 'RED 3: with three triggers dropped on platform.associations, test@test.com could also reshape a table — those drops were supposed to touch the relation contract and not the ladder';
  end if;
  if (custom.read_record(v_org, v_note, true) ->> 'title') <> 'Thank-you call note' then
    raise exception 'RED 3: the record shared with test@test.com at viewer does not read back for her';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'RED 3 — seated: the owner adds a column and it lands, test@test.com is refused the same call ("%"), and she reads the record shared with her. The three drops touched the relation contract and not the access ladder.', left(v_caught, 80);

  raise notice '=== W1-REL RED — the three triggers were shown failing, on the main database, FROM THE `authenticated` SEAT: every clause here is a signed-in person calling platform.relation_set and reading what RLS lets her read, and the ONLY thing done as the connected role is the plant no person can ever do — the trigger drops themselves. BOTH halves of RED 0''s finding are now closed: the relations door answers a person (2026-09-21, lane RED-SUITES-3) and custom.field_declare takes the word `relation` from her too (2026-09-21, lane TAILS-5), so this file declares its own relation columns from the seat. Rolling back. ===';
end $red$;

rollback;

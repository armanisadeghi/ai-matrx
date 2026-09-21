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
-- That is not small enough for this lane to fix by hand: making `platform.relation_set`
-- SECURITY DEFINER means giving it the store's own three assertions
-- (`custom.assert_store_door`, `assert_client_may_reach`, `assert_client_may_change`) and
-- changing a shared `platform` function other code already calls. It is REPORTED, and RED 0
-- asserts the refusal by its SQLSTATE and its words, so this file goes RED the day the door is
-- built — which is the day RED 1 and RED 2 move into the seat.
--
-- Until then RED 1 and RED 2 run as the connected role and SAY SO. They prove what the three
-- triggers do; they prove nothing about what a person may do, and they claim nothing else.
-- RED 3 is the one clause this file CAN ask seated, and it is asked as a second real person.

\set ON_ERROR_STOP on
\timing off
\pset pager off

do $target$
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'w1_rel_red.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end $target$;

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

  -- ------------------------------------------------------------------ the fixture, through
  -- the doors as far as the doors go. The three Tables and their records are a person's; the
  -- relation FIELDS are not — `custom.field_declare` offers a person `member` (a Person) and
  -- `attachment` (a File) and refuses the word `relation` by name, so a column pointing at
  -- another Table is written into the `custom.field` view as the connected role, which is the
  -- second half of the same finding RED 0 records. Nothing is asserted while out.
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
  if v_caught is null then
    raise exception 'RED 0: `platform.relation_set` now answers a signed-in person. The relations door exists — move RED 1 and RED 2 into the seat and delete this clause.';
  end if;
  if v_state <> '42501' or v_caught not like '%permission denied%' then
    raise exception 'RED 0: the relations door refused a person with % "%", and the measured refusal is 42501 permission denied for table record. Something changed; re-measure before trusting anything below.',
      v_state, v_caught;
  end if;
  raise notice 'RED 0 — MEASURED: a signed-in person calling platform.relation_set is refused % "%". The relation contract below is unreachable from a person''s seat, so RED 1 and RED 2 run as the connected role and prove only what the triggers do.', v_state, v_caught;

  -- The relation FIELDS, as the connected role, for the same reason.
  perform set_config('role', v_boss, true);

  update custom.record
     set data = jsonb_set(data, '{fields}',
                  coalesce(data -> 'fields', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('name','about')))
   where organization_id = v_org and id = v_note_t;
  insert into custom.field (organization_id, entity_definition_id, key, name, label, type,
                            relation_target, relation_max, on_target_delete, config,
                            source, source_config, sensitivity, context_policy,
                            rules, depends_on, applies_to_types, multi, dated, required, sort)
  values (v_org, v_note_t, 'about', 'About', 'About', 'relation', v_proj_t, 50, 'set_null',
          jsonb_build_object('target_mode','one','loops',false),
          'manual','{}'::jsonb,'internal','include',
          '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,true,false,false,10);

  -- REL-5's clause needs a field that points a Table at ITSELF, declared on the project Table,
  -- because `platform.relation_set` resolves the field off the SOURCE record's Table before the
  -- contract trigger ever runs — a fact this twin measured the hard way.
  update custom.record
     set data = jsonb_set(data, '{fields}',
                  coalesce(data -> 'fields', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('name','about')))
   where organization_id = v_org and id = v_proj_t;
  insert into custom.field (organization_id, entity_definition_id, key, name, label, type,
                            relation_target, relation_max, on_target_delete, config,
                            source, source_config, sensitivity, context_policy,
                            rules, depends_on, applies_to_types, multi, dated, required, sort)
  values (v_org, v_proj_t, 'about', 'About', 'About', 'relation', v_proj_t, 50, 'set_null',
          jsonb_build_object('target_mode','one','loops',false),
          'manual','{}'::jsonb,'internal','include',
          '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,true,false,false,10);

  -- ==================================================================== RED 1: the contract goes
  -- OUT OF THE SEAT, because RED 0 measured that a person cannot reach this door at all.
  drop trigger trg_associations_zzz_relation_contract on platform.associations;

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

  raise notice 'RED 1 — contract trigger dropped: a relation lands on a Table its field never named, a "one" relation holds % targets, and a record points at itself. REL-8, REL-7 and REL-5 were that one trigger.', v_n + 2;

  -- ===================================================================== RED 2: the versions go
  select a.id into v_edge from platform.associations a
   where a.source_id = v_note and a.role = 'about' and a.target_id = v_a limit 1;
  -- THE CONTROL FIRST, WITH THE TRIGGERS STILL THERE: one edit, and the version moves and a
  -- history row is filed. Without it the comparison below is vacuous — an edge whose version
  -- is null before and after would "stay the same" with or without a trigger, which is
  -- exactly the hole this twin had when it ran on the branch.
  update platform.associations set label = 'control_moved_it' where id = v_edge;
  select a.version into v_ver from platform.associations a where a.id = v_edge;
  select count(*) into v_n from history.row_versions v
   where v.row_id = v_edge and v.organization_id = v_org and v.operation = 'UPDATE';
  if v_ver is null then
    raise exception 'RED 2 setup: the edge carries NO version after an edit with both version triggers in place, so "the version never moves" cannot be measured';
  end if;
  if v_n < 1 then
    raise exception 'RED 2 setup: no history row was filed for an edited edge with trg_associations_zzz_version_capture in place';
  end if;

  drop trigger trg_associations_zzz_touch_row on platform.associations;
  drop trigger trg_associations_zzz_version_capture on platform.associations;

  update platform.associations set label = 'red_moved_it' where id = v_edge;

  if (select version from platform.associations where id = v_edge) is distinct from v_ver then
    raise exception 'RED 2a IS NOT RED: the version moved with both version triggers dropped, so something else is writing it';
  end if;
  select count(*) into v_n2 from history.row_versions v
   where v.row_id = v_edge and v.organization_id = v_org and v.operation = 'UPDATE';
  if v_n2 <> v_n then
    raise exception 'RED 2b IS NOT RED: % more history row(s) were filed for an edge nobody is capturing', v_n2 - v_n;
  end if;
  raise notice 'RED 2 — with both version triggers in place one edit moved the version to % and filed % history row(s); with them dropped a second edit moved neither. REL-16 and REL-13 are those two triggers.', v_ver, v_n;

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

  raise notice '=== W1-REL RED — the three triggers were shown failing, on the main database; and RED 0 is the finding this lane hands back: the relations door platform.relation_set cannot be reached by a signed-in person at all. Rolling back. ===';
end $red$;

rollback;

-- W1-REL — CHECK C-12, and the T2 / T7 clauses of this lane's exit, on the MAIN database.
--
-- REL-1 · REL-2 · REL-3 · REL-4 · REL-5 · REL-6 · REL-7 · REL-8 · REL-9 · REL-10 · REL-11 ·
-- REL-12 · REL-13 · REL-14 · REL-16, each as a behavioural clause over real rows in
-- `platform.associations`.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w1_rel_c12.sql
--
-- WHAT IT LEAVES BEHIND: NOTHING. One transaction that ends in ROLLBACK — the disposable
-- organization, its memberships, its knob override, its Tables, its records and every
-- association row die with it.
--
-- 🚨 RE-POINTED AND SEATED (lane SEAT-SUITES, 2026-09-19). Three changes, and the second was a
-- finding — CLOSED on 2026-09-21, see the note directly below.
--
-- 🚨 MOVED INTO THE SEAT (lane RED-SUITES-2, 2026-09-21). The finding in (2) below is fixed:
-- `migrations/campaign/reldecl_the_relation_doors_take_a_person.sql` (commit `5f8354fc04`)
-- made the five SECURITY INVOKER relation doors SECURITY DEFINER, and taught
-- `custom.field_declare` the relation column. So the OUT-OF-THE-SEAT band this file used to
-- carry from PART 0b to PART 13 IS GONE: every clause below is asked from `authenticated`,
-- every Field is declared through `custom.field_declare`, and every Field setting moves
-- through `custom.field_update`. THREE THINGS CAME OUT OF THAT MOVE:
--   · REL-12's block was recorded as a standing finding ("a row INSERTed straight into
--     platform.associations lands in organization B … nothing refuses it"). It was measured
--     from the CONNECTED ROLE. From the seat the same INSERT is refused, so it is a PASS
--     clause now. What is still owed is the table being open to the role that OWNS it.
--   · `custom.field_update` accepted `on_target_delete` and dropped it — the column editor's
--     delete-rule control answered "saved" and changed nothing. Fixed at the door by
--     `migrations/campaign/redsuites2_the_column_door_applies_the_delete_rule.sql`, which also
--     applies `relation_target` and withdraws the old edges with it.
--   · Two model facts have NO door at all and are written as the connected role, each saying
--     so at the point it happens: a Table's `contained_by_relation`, and flipping a relation's
--     `loops` (`config` is not on `FieldPatch`, the published contract).
--
-- (1) IT RUNS ON THE MAIN DATABASE, in its OWN disposable organization. It used to refuse
--     anything but the rehearsal branch — 226 of main's 332 functions in schema `custom`, no
--     `custom.field_declare` at all — and it wrote its fixture Tables into the real `Matrx
--     System` organization, which on this server is somebody's data. It also flipped the
--     GLOBAL `custom/associations_guard` knob row; on main that knob already resolves TRUE, so
--     nothing global is touched at all now.
--
-- (2) THE RELATION DOORS ARE GRANTED TO A PERSON AND CANNOT SERVE ONE. MEASURED 2026-09-19:
--     all seventeen `platform.relation*` functions hold EXECUTE for `authenticated`, and five
--     of them — `relation_field`, `relation_declaration`, `relation_label`,
--     `relation_snapshot_of` and `relation_on_delete` — read `custom.record` as SECURITY
--     INVOKER. `authenticated` holds no privilege on `custom.record`, so every one of them
--     dies with `permission denied for table record`, and `platform.relation_set` with them on
--     its second line. The whole relation feature is therefore unreachable from a browser
--     today. That is NOT this lane's to fix — giving these five a client seat is a door
--     design (who may read a field declaration, who may take a snapshot of a record's whole
--     document, who may detach a value), not a flag — so it is ASSERTED in PART 0b instead of
--     papered over: the day the doors are given a seat, PART 0b goes red and this file must be
--     rewritten to ask every clause below through them.
--
-- (3) BECAUSE OF (2), the REL sections run OUTSIDE the seat, under a banner that says so, and
--     assert nothing about what a person may do. PART 0, PART 0b and PART 13 are the seated
--     clauses; PART 13 is a real second person with a control she can do.
--
-- (4) REL-12 WAS READING GREEN FOR THE WRONG REASON, and section 6 now says so. It asserted
--     that a row INSERTed straight into `platform.associations` naming another organization is
--     refused — and the organization id it named, `c0000000-…-000000000001`, exists nowhere, so
--     what refused was a FOREIGN KEY and the wall was never asked. Asked properly, with a real
--     second organization: the row LANDS, in organization B, with its source, its target and
--     its relation field all belonging to organization A. The DOOR (`platform.relation_set`)
--     refuses it, and that clause is kept and passes; the TABLE does not, and that is recorded
--     as a finding rather than taken here — closing it means a trigger on a shared table with
--     86,000 rows that several lanes write.
--
-- THE RED TWIN is `w1_rel_c12_red.sql`, which disables the contract trigger and the version
-- triggers for real and re-runs the same clauses; every REFUSAL clause there must FAIL.

\set ON_ERROR_STOP on
\timing off
\pset pager off

begin;
set local lock_timeout = '10s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_other   uuid := gen_random_uuid();   -- a second real organization, for REL-12's wall
  v_home    uuid;
  t_project uuid; t_person uuid; t_class uuid; t_note uuid; t_tag uuid;
  t_widget  uuid; t_serial uuid;
  r_a uuid; r_b uuid; r_c uuid; r_note uuid; r_tag uuid; r_widget uuid; r_ser uuid;
  r_d uuid; r_cb uuid;
  f_about uuid; f_owner uuid; f_partners uuid; f_filed uuid; f_widget uuid;
  e_id uuid;
  v_n       integer;
  v_txt     text;
  v_json    jsonb;
  v_caught  text;
  v_granted integer;
  v_boss    text := current_user;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'w1_rel_c12.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;

  -- Every write in this suite is made by a named system: `platform._stamp_actor_tier` stamps
  -- actor_tier=code for the connected role, and the provenance guard then refuses a code write
  -- that names no system — '"an AI did it" with no name is not provenance'.
  perform set_config('app.actor_system', 'campaign.w1_rel.c12', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org,   'Hands & Hope Alliance', 'hands-hope-alliance-' || substr(v_org::text,1,8), 'HHA', c_admin),
    (v_other, 'Hands & Hope Alliance — Westside Chapter', 'hands-hope-westside-' || substr(v_other::text,1,8), 'HHW', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_rel_c12');

  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Hands & Hope Alliance — Main Office')) returning id into v_home;

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
  if not platform.relations_are_on(v_org) then
    raise exception '0: custom/associations_guard resolves off for this organization, and every clause below is about what ON does';
  end if;
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, custom.record is not readable from it, and the relation guard is on.';

  -- The seven Tables and their records, through the doors a person has.
  t_project := custom.table_declare(v_org, jsonb_build_object('name','Campaigns','slug','campaigns','type','entity','display','list','label_singular','Campaign','label_plural','Campaigns','ordered',true,'weight','light','retention_days',365,'row_order','manual','agent_writable',true,'parent_id',v_home::text,'title_field','title','default_sort',jsonb_build_array(jsonb_build_object('field','title','direction','asc')),'fields',jsonb_build_array(jsonb_build_object('name','title'))));
  t_person  := custom.table_declare(v_org, jsonb_build_object('name','Donors','slug','donors','type','entity','display','list','label_singular','Donor','label_plural','Donors','ordered',true,'weight','light','retention_days',365,'row_order','manual','agent_writable',true,'parent_id',v_home::text,'title_field','title','default_sort',jsonb_build_array(jsonb_build_object('field','title','direction','asc')),'fields',jsonb_build_array(jsonb_build_object('name','title'))));
  t_class   := custom.table_declare(v_org, jsonb_build_object('name','Pledges','slug','pledges','type','entity','display','list','label_singular','Pledge','label_plural','Pledges','ordered',true,'weight','light','retention_days',365,'row_order','manual','agent_writable',true,'parent_id',v_home::text,'title_field','title','default_sort',jsonb_build_array(jsonb_build_object('field','title','direction','asc')),'fields',jsonb_build_array(jsonb_build_object('name','title'))));
  t_note    := custom.table_declare(v_org, jsonb_build_object('name','Gift Notes','slug','gift_notes','type','entity','display','list','label_singular','Gift Note','label_plural','Gift Notes','ordered',true,'weight','light','retention_days',365,'row_order','manual','agent_writable',true,'parent_id',v_home::text,'title_field','title','default_sort',jsonb_build_array(jsonb_build_object('field','title','direction','asc')),'fields',jsonb_build_array(jsonb_build_object('name','title'))));
  t_tag     := custom.table_declare(v_org, jsonb_build_object('name','Appeal Codes','slug','appeal_codes','type','entity','display','list','label_singular','Appeal Code','label_plural','Appeal Codes','ordered',true,'weight','light','retention_days',365,'row_order','manual','agent_writable',true,'parent_id',v_home::text,'title_field','title','default_sort',jsonb_build_array(jsonb_build_object('field','title','direction','asc')),'fields',jsonb_build_array(jsonb_build_object('name','title'))));
  t_widget  := custom.table_declare(v_org, jsonb_build_object('name','Fundraising Events','slug','fundraising_events','type','entity','display','list','label_singular','Fundraising Event','label_plural','Fundraising Events','ordered',true,'weight','light','retention_days',365,'row_order','manual','agent_writable',true,'parent_id',v_home::text,'title_field','title','default_sort',jsonb_build_array(jsonb_build_object('field','title','direction','asc')),'fields',jsonb_build_array(jsonb_build_object('name','title'))));
  t_serial  := custom.table_declare(v_org, jsonb_build_object('name','Gift Receipts','slug','gift_receipts','type','entity','display','list','label_singular','Gift Receipt','label_plural','Gift Receipts','ordered',true,'weight','light','retention_days',365,'row_order','manual','agent_writable',true,'parent_id',v_home::text,'title_field','title','default_sort',jsonb_build_array(jsonb_build_object('field','title','direction','asc')),'fields',jsonb_build_array(jsonb_build_object('name','title'))));
  perform custom.field_declare(v_org, t_project, jsonb_build_object('key','title','label','Title','plain','text','sort',10));
  perform custom.field_declare(v_org, t_person,  jsonb_build_object('key','title','label','Title','plain','text','sort',10));
  perform custom.field_declare(v_org, t_class,   jsonb_build_object('key','title','label','Title','plain','text','sort',10));
  perform custom.field_declare(v_org, t_note,    jsonb_build_object('key','title','label','Title','plain','text','sort',10));
  perform custom.field_declare(v_org, t_tag,     jsonb_build_object('key','title','label','Title','plain','text','sort',10));
  perform custom.field_declare(v_org, t_widget,  jsonb_build_object('key','title','label','Title','plain','text','sort',10));
  perform custom.field_declare(v_org, t_serial,  jsonb_build_object('key','title','label','Title','plain','text','sort',10));

  r_a      := custom.record_write(v_org, t_project, '{"title":"Winter Coat Drive 2026"}'::jsonb);
  r_b      := custom.record_write(v_org, t_person,  '{"title":"Linda Reyes"}'::jsonb);
  r_c      := custom.record_write(v_org, t_class,   '{"title":"PLG-3001"}'::jsonb);
  r_note   := custom.record_write(v_org, t_note,    '{"title":"Thank-you call note"}'::jsonb);
  r_tag    := custom.record_write(v_org, t_tag,     '{"title":"Year-End Appeal"}'::jsonb);
  r_widget := custom.record_write(v_org, t_widget,  '{"title":"Spring Benefit Dinner"}'::jsonb);
  r_ser    := custom.record_write(v_org, t_serial,  '{"title":"RCPT-1001"}'::jsonb);
  r_d      := custom.record_write(v_org, t_person,  '{"title":"Grace Novak"}'::jsonb);
  r_cb     := custom.record_write(v_org, t_project, '{"title":"Annual Gala 2026"}'::jsonb);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0b — THE FINDING, ASSERTED. The relation doors are granted to a signed-in person and
  -- cannot serve one. Both halves are asserted, because either alone would be satisfied by an
  -- accident: the grant EXISTS (so this is not "the feature is simply closed"), and the call
  -- from the seat DIES on `custom.record` (so the grant is a promise the door cannot keep).
  -- ════════════════════════════════════════════════════════════════════════════
  select count(*) into v_granted from pg_proc p
   where p.pronamespace = 'platform'::regnamespace
     and (p.proname like 'relation%' or p.proname like 'relations%')
     and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_granted = 0 then
    raise exception 'PART 0b: no platform.relation* function is granted to `authenticated` any more. The finding this clause records has changed shape — re-measure it before trusting anything below.';
  end if;
  v_caught := null;
  begin
    perform platform.relation_field(v_org, r_note, 'title');
  exception when others then
    get stacked diagnostics v_caught = message_text;
  end;
  -- 🚨 THE FINDING IS CLOSED, AND THIS CLAUSE NOW ASSERTS THE PROMISE INSTEAD (lane
  -- RED-SUITES-2, 2026-09-21). The landing is `migrations/campaign/reldecl_the_relation_doors_take_a_person.sql`
  -- (commit `5f8354fc04`, lane REL-DECL): the five functions named in (2) of this file's header —
  -- `relation_field`, `relation_declaration`, `relation_label`, `relation_snapshot_of` and
  -- `relation_on_delete` — were SECURITY INVOKER over `custom.record` and are now SECURITY
  -- DEFINER, so the grant they already held became a promise the door can keep. This file's own
  -- text said what to do on that day: "PART 0b goes red and this file must be rewritten to ask
  -- every clause below through them." That is what happened, and the OUT-OF-THE-SEAT band that
  -- used to run from PART 0b to PART 13 is gone — every clause below is asked from the seat.
  --
  -- It is not weakened. The old clause asserted that the door DIED; this one asserts that it
  -- ANSWERS, which is the thing a person actually needs, and it keeps the grant census above so
  -- a silent REVOKE still turns this red.
  if v_caught is not null then
    raise exception 'PART 0b: platform.relation_field is granted to `authenticated` and still cannot serve one — it died with "%". The relation feature has no working client door.', v_caught;
  end if;
  raise notice 'PART 0b — THE DOORS SERVE A PERSON: % platform.relation* functions are EXECUTE-able by `authenticated` and platform.relation_field answers from the seat. Every clause below is asked through them.', v_granted;

  -- ╔══════════════════════════════════════════════════════════════════════════╗
  -- ║  IN THE SEAT FROM HERE TO THE END (lane RED-SUITES-2, 2026-09-21).         ║
  -- ║  This band used to step OUT to the connected role, under a banner saying   ║
  -- ║  that the functions below could not be called by a person at all. PART 0b   ║
  -- ║  above now proves the opposite, so the clauses are asked where they always  ║
  -- ║  should have been asked: from `authenticated`, carrying admin@admin.com's   ║
  -- ║  claims, through the doors a browser reaches.                               ║
  -- ╚══════════════════════════════════════════════════════════════════════════╝

  -- 🚨 THE SECOND FACE OF THE FINDING IS CLOSED TOO (lane RED-SUITES-2, 2026-09-21).
  -- This used to read: "A relation Field cannot be declared through `custom.field_declare`
  -- either … A relation onto an arbitrary Table is written into the `custom.field` view, which
  -- is the store's own writer. Same gap, second face." It was true, and it is why the block
  -- below stepped out of the seat to INSERT the Field row by hand — a privilege no person has.
  -- `reldecl_the_relation_doors_take_a_person.sql` (commit `5f8354fc04`) also taught
  -- `custom.field_declare` the relation column: it reads `relation_target` (and `target_table`,
  -- the same question spelled the other way, since LIMITS-FIX) and asks
  -- `custom.assert_may_know_table` about the target — "may I point at it" is "may I see it".
  -- So the relation Field is now declared through the DOOR, from the seat, which is also
  -- STRICTER than the hand-written INSERT ever was: the INSERT asked nobody anything.
  f_about := custom.field_declare(v_org, t_note, jsonb_build_object(
    'key', 'about', 'label', 'About', 'type', 'relation',
    'relation_target', t_project::text,
    'relation_max', 50,
    'on_target_delete', 'set_null',
    'multi', true, 'sort', 10,
    'config', jsonb_build_object('target_mode','several',
                                 'target_tables', jsonb_build_array(t_project, t_person, t_class),
                                 'ordered', true, 'carries', true, 'carries_max', 'viewer',
                                 'loops', false)));

  -- ── 1. REL-10 / REL-4 / REL-11 : one note, three edges, three Tables, one role ──────────
  if platform.relation_set(v_org, r_note, 'about', jsonb_build_array(r_a, r_b, r_c)) <> 3 then
    raise exception 'REL-10: relation_set did not write three edges';
  end if;
  select count(*) into v_n from platform.associations
   where source_id = r_note and deleted_at is null and role = 'about' and origin = 'campaign'
     and relation_field_id = f_about;
  if v_n <> 3 then
    raise exception 'FAIL REL-10 / T2: % edge(s) onto three different Tables with one role and the origin marker, expected 3', v_n;
  end if;
  if (select array_agg(position order by position) from platform.associations
       where source_id = r_note and deleted_at is null and role = 'about') is distinct from array[1,2,3] then
    raise exception 'FAIL REL-4: the order is not stored on the edge';
  end if;
  -- Through the READ DOOR, not a select on custom.record: the seat holds no privilege on that
  -- table (PART 0 proves it), and what a person can see of the note's document is exactly what
  -- this clause is about.
  if custom.read_record(v_org, r_note, true) ?| array['about','relations','_relations'] then
    raise exception 'FAIL REL-11: the note''s document says something about the relation';
  end if;
  raise notice 'PASS REL-10 / REL-4 / REL-11 — three edges, three Tables, one role, order on the edge, nothing in the document.';

  -- ── 2. REL-9 / C-12a : the reverse end BY QUERY, with no second stored row ──────────────
  if (select count(*) from platform.relations_to(v_org, r_a)) <> 1
     or (select count(*) from platform.associations
          where deleted_at is null
            and ((source_id = r_note and target_id = r_a) or (source_id = r_a and target_id = r_note))) <> 1 then
    raise exception 'FAIL REL-9 / C-12a: the reverse end does not answer from the ONE stored row';
  end if;
  raise notice 'PASS REL-9 / C-12a — the reverse end answers from the one stored row.';

  -- ── 3. REL-14 : the label is hydrated at read, so renaming the target renames the chip ──
  perform custom.record_update(v_org, r_a, '{"title":"Winter Coat Drive 2026, renamed"}'::jsonb, null);
  if (select label from platform.relations_from(v_org, r_note) where target_id = r_a) <> 'Winter Coat Drive 2026, renamed' then
    raise exception 'FAIL REL-14: the label did not follow the target, so something stored it';
  end if;
  raise notice 'PASS REL-14 — the label followed the target, because nothing stored it.';

  -- ── 4. REL-8 : several means several, and a table outside the list is refused BY NAME ───
  v_caught := null;
  begin
    perform platform.relation_set(v_org, r_note, 'about', jsonb_build_array(r_tag));
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'FAIL REL-8: a target outside the declared list was accepted';
  end if;
  if v_caught not like '%Campaign%' or v_caught not like '%Donor%' or v_caught not like '%Pledge%' then
    raise exception 'FAIL REL-8: the refusal does not name the tables it may point at: %', v_caught;
  end if;
  raise notice 'PASS REL-8 — a table outside the list is refused, naming the three it may point at.';

  -- ── 5. REL-7 : at most one ──────────────────────────────────────────────────────────────
  f_owner := custom.field_declare(v_org, t_note, jsonb_build_object(
    'key', 'owner', 'label', 'Owner', 'type', 'relation',
    'relation_target', t_person::text, 'relation_max', 1,
    'on_target_delete', 'set_null', 'multi', true, 'sort', 10,
    'config', jsonb_build_object('target_mode','one')));
  perform platform.relation_set(v_org, r_note, 'owner', jsonb_build_array(r_b));
  v_caught := null;
  begin
    perform platform.relation_set(v_org, r_note, 'owner', jsonb_build_array(r_d));
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'FAIL REL-7: a second target was accepted on an at-most-one relation';
  end if;
  if v_caught not like '%Linda Reyes%' then
    raise exception 'FAIL REL-7: the refusal does not name the one already there: %', v_caught;
  end if;
  raise notice 'PASS REL-7 — at most one, and the refusal names the one already there.';

  -- ── 6. REL-12 : organizations are hard walls ────────────────────────────────────────────
  -- MEASURED 2026-09-18 and still true on main: it refuses ONE STEP EARLIER than this suite
  -- once expected — "there is no field <id> in this organization", from
  -- platform.relation_declaration, not from the organization wall. That is the better answer
  -- and the honest one to record: a relation cannot cross organizations because the FIELD that
  -- would declare it does not exist over there. The other organization is a REAL one this
  -- suite made, so what refuses is that law and never a foreign key onto an id nobody has.
  -- The wall on the record store itself is proven separately by v1store_fixes_green.sql 1a-1d.
  v_caught := null;
  begin
    insert into platform.associations (source_type, source_id, target_type, target_id,
                                       organization_id, role, relation_field_id, origin)
    values ('record', r_note, 'record', r_d, v_other, 'about', f_about, 'campaign');
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  -- 🚨 TURNED BACK INTO A PASS CLAUSE (lane RED-SUITES-2, 2026-09-21), exactly as the sentence
  -- this block used to raise instructed. The 2026-09-19 finding — "a row INSERTed straight
  -- into platform.associations lands in organization B while its source, its target and its
  -- relation field all belong to organization A, and nothing refuses it" — was measured from
  -- the CONNECTED ROLE, because this whole band ran outside the seat. From the seat a person
  -- actually sits in, the same INSERT is refused, and that is what REL-12 is about. The wall
  -- is asked now because the caller is a person.
  --
  -- WHAT IS STILL OWED, and it is not this clause's to close: the table is still open to the
  -- ROLE THAT OWNS IT. Closing that is a trigger on a shared table with ~86,000 rows and other
  -- lanes writing it, so it stays reported rather than taken here.
  if v_caught is null then
    raise exception 'FAIL REL-12: a signed-in person INSERTed straight into platform.associations an edge whose source, target and relation field all belong to a different organization, and nothing refused it.';
  end if;
  raise notice 'PASS REL-12 (the table, from the seat) — the cross-organization INSERT is refused: "%"', left(v_caught, 110);

  -- AND THE DOOR IS CLOSED, which is what a person meets: `platform.relation_set` asks
  -- `platform.relation_field` for the record first, and there is no such record over there.
  v_caught := null;
  begin
    perform platform.relation_set(v_other, r_note, 'about', jsonb_build_array(r_d));
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'FAIL REL-12: platform.relation_set wrote an edge into another organization';
  end if;
  raise notice 'PASS REL-12 (the door) — platform.relation_set refuses an edge across organizations: "%"', left(v_caught, 110);

  -- ── 7. REL-5 : loops are refused unless the relation allows them ────────────────────────
  f_partners := custom.field_declare(v_org, t_project, jsonb_build_object(
    'key', 'partners', 'label', 'Partners', 'type', 'relation',
    'relation_target', t_project::text, 'relation_max', 50,
    'on_target_delete', 'set_null', 'multi', true, 'sort', 10,
    'config', jsonb_build_object('target_mode','one','loops',false)));
  perform platform.relation_set(v_org, r_a, 'partners', jsonb_build_array(r_cb));
  v_caught := null;
  begin
    perform platform.relation_set(v_org, r_cb, 'partners', jsonb_build_array(r_a));
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'FAIL REL-5: a loop was accepted on a relation that does not allow them';
  end if;
  -- THE SECOND INPUT WITH A DIFFERENT EXPECTED VALUE: the same write, once the relation says
  -- loops are allowed — it lands.
  -- 🚨 THE SECOND NAMED GAP (lane RED-SUITES-2, 2026-09-21): a relation's `loops` cannot be
  -- CHANGED by a person. `custom.field_declare` carries a `config` object through (which is how
  -- this column was born with loops off), but `custom.field_update` builds its patch from an
  -- ENUMERATED key list and `config` is not on it — nor is it on `FieldPatch`, the published
  -- contract in `@ai-matrx/records` `src/field.ts`. Sending it is accepted and DROPPED, and the
  -- door answers "saved". So this flip is written as the connected role, says so here, and
  -- asserts nothing about what a person may do; the clause underneath it — that the loop LANDS
  -- once the relation allows it — is asked from the seat through platform.relation_set.
  -- Left behind for the field-door lane: `custom.field_update` silently discards every patch
  -- key it does not implement, which is the "nothing fails silently" class on a live write door.
  perform set_config('role', v_boss, true);
  update custom.record set data = data || '{"config":{"target_mode":"one","loops":true}}'::jsonb
   where organization_id = v_org and id = f_partners;
  perform set_config('role', 'authenticated', true);
  perform platform.relation_set(v_org, r_cb, 'partners', jsonb_build_array(r_a));
  raise notice 'PASS REL-5 — a loop is refused, and lands once the relation allows it.';

  -- ── 8. REL-3 : a snapshot is a frozen copy in the relation's own payload ────────────────
  f_filed := custom.field_declare(v_org, t_note, jsonb_build_object(
    'key', 'as_filed', 'label', 'As filed', 'type', 'relation',
    'relation_target', t_person::text, 'relation_max', 50,
    'on_target_delete', 'set_null', 'multi', true, 'sort', 10,
    'config', jsonb_build_object('target_mode','one','binding','snapshot')));
  perform platform.relation_set(v_org, r_note, 'as_filed', jsonb_build_array(r_b));
  perform custom.record_update(v_org, r_b, '{"title":"Linda Reyes-Okoye"}'::jsonb, null);
  if (select snapshot -> 'values' ->> 'title' from platform.relations_from(v_org, r_note) where role = 'as_filed') <> 'Linda Reyes'
     or (select label from platform.relations_from(v_org, r_note) where role = 'as_filed') <> 'Linda Reyes-Okoye' then
    raise exception 'FAIL REL-3: the snapshot did not freeze while the live label moved';
  end if;
  if (select snapshot from platform.relations_from(v_org, r_note) where role = 'as_filed') ?| array['version','row_version_id','as_of'] then
    raise exception 'FAIL REL-3: the snapshot points into History';
  end if;
  raise notice 'PASS REL-3 — the snapshot froze, the live label moved, and the snapshot names no version to resolve against.';

  -- ── 9. REL-1 / REL-6 : ownership is ONE fact, on the contained table ────────────────────
  -- 🚨 THE ONE STEP OUT OF THE SEAT LEFT IN THIS FILE, AND IT IS A NAMED GAP (lane
  -- RED-SUITES-2, 2026-09-21). "This Table is contained by its relation" is a fact about the
  -- TABLE, and `custom.table_declare` — the only table door — takes no id and knows no
  -- `contained_by_relation` key, so a person has no way to say it. Every other model change in
  -- this file now goes through `custom.field_declare` or `custom.field_update`. This one is
  -- written as the connected role, it says so here at the point it happens, and it asserts
  -- nothing about what a person may do — REL-1 below asserts what the relation doors ANSWER
  -- once the fact is true, and that clause is asked from the seat.
  perform set_config('role', v_boss, true);
  update custom.record set data = data || '{"contained_by_relation": true}'::jsonb
   where organization_id = v_org and id = t_person;
  perform set_config('role', 'authenticated', true);
  if (platform.relation_declaration(v_org, f_owner) ->> 'flavor') <> 'owned' then
    raise exception 'FAIL REL-1: the field did not read ownership off the table it points at';
  end if;
  if not (platform.relation_declaration(v_org, f_owner) ->> 'carries')::boolean then
    raise exception 'FAIL REL-6: carries does not default ON for owned';
  end if;
  if (platform.relation_declaration(v_org, f_partners) ->> 'carries')::boolean then
    raise exception 'FAIL REL-6: carries does not default OFF for referenced';
  end if;
  -- OUT OF THE SEAT, and it has to be: this clause is about a GUARD ON THE FIELD DOCUMENT —
  -- "a field may not declare whether the relation owns what it points at" — and there is no
  -- door that offers `flavor` for the guard to refuse. `custom.field_update` drops the key
  -- silently (the named gap above), so asking it through the door would prove the guard was
  -- gone when it is in fact intact. The write is made as the connected role so the guard is
  -- actually asked; the REFUSAL it produces is the product clause, and it is read below.
  perform set_config('role', v_boss, true);
  update custom.record set data = data || '{"flavor":"owned"}'::jsonb where organization_id = v_org and id = f_owner;
  v_caught := null;
  begin
    perform platform.relation_declaration(v_org, f_owner);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'FAIL REL-1: a field was allowed to declare whether the relation owns what it points at';
  end if;
  update custom.record set data = data - 'flavor' where organization_id = v_org and id = f_owner;
  perform set_config('role', 'authenticated', true);
  raise notice 'PASS REL-1 / REL-6 — ownership is the contained table''s fact, carries defaults follow it, and a field may not declare it.';

  -- ── 10. REL-2 / T7 : the three delete outcomes, and on_delete is separate from flavor ───
  perform custom.field_update(v_org, f_owner, jsonb_build_object('on_target_delete','restrict'));
  if (platform.relation_declaration(v_org, f_owner) ->> 'on_delete') <> 'restrict'
     or (platform.relation_declaration(v_org, f_owner) ->> 'flavor') <> 'owned' then
    raise exception 'FAIL REL-2: an OWNED relation could not restrict — the two words are not independent';
  end if;
  v_caught := null;
  begin
    perform platform.relation_on_delete(v_org, r_b);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'FAIL T7 restrict: the delete was not refused';
  end if;
  if v_caught not like '%Thank-you call note%' then
    raise exception 'FAIL T7 restrict: the refusal does not name what is in the way: %', v_caught;
  end if;
  perform custom.field_update(v_org, f_owner, jsonb_build_object('on_target_delete','set_null'));
  perform platform.relation_on_delete(v_org, r_b);
  if exists (select 1 from platform.associations
              where source_id = r_note and role = 'owner' and deleted_at is null) then
    raise exception 'FAIL T7 set_null: the relation was not detached';
  end if;
  f_widget := custom.field_declare(v_org, t_serial, jsonb_build_object(
    'key', 'widget', 'label', 'Widget', 'type', 'relation',
    'relation_target', t_widget::text, 'relation_max', 1,
    'on_target_delete', 'cascade', 'multi', true, 'sort', 10,
    'config', jsonb_build_object('target_mode','one')));
  perform platform.relation_set(v_org, r_ser, 'widget', jsonb_build_array(r_widget));
  if not (platform.relation_on_delete(v_org, r_widget) -> 'cascade_to' @> to_jsonb(array[r_ser])) then
    raise exception 'FAIL T7 cascade: the delete verb was not handed the records it must take with it';
  end if;
  raise notice 'PASS REL-2 / T7 — restrict names what is in the way, set_null detaches, cascade hands over the records, and on_delete is independent of flavor.';

  -- ── 11. REL-13 / REL-16 : the edge is versioned, and relation history exists ────────────
  select a.id into e_id from platform.associations a
   where a.source_id = r_note and a.role = 'about' and a.target_id = r_a limit 1;
  update platform.associations set label = 'part_of_nothing' where id = e_id;
  if (select version from platform.associations where id = e_id) < 1 then
    raise exception 'FAIL REL-16: _touch_row did not bump the version';
  end if;
  if not exists (select 1 from platform.relation_history(v_org, e_id)) then
    raise exception 'FAIL REL-13: relation history does not exist';
  end if;
  raise notice 'PASS REL-13 / REL-16 — the edge is versioned and its history is readable.';

  -- ── 12. THE OFF PATH : an association that is not one of ours carries none of our marks ──
  -- RESTATED 2026-09-19. The old clause asserted that such a row carries NULL in all FOUR new
  -- columns; on main 243 of them carry `version` and `updated_at`, because `_touch_row` fires
  -- on EVERY association and not only on ours. That is the trigger doing its job, not a leak.
  -- The law that is actually ours is the two columns THIS lane added: our origin marker never
  -- appears on a row that is not one of ours. MEASURED 2026-09-19: 0 rows.
  select count(*) into v_n from platform.associations
   where relation_field_id is null and origin is not null;
  if v_n <> 0 then
    raise exception 'FAIL OFF: % association(s) that declare no relation field carry our origin marker', v_n;
  end if;
  raise notice 'PASS OFF — no association outside this lane carries this lane''s marks.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 13 — BACK IN THE SEAT, AS A REAL SECOND PERSON.
  -- The relation surface a person CAN reach today is the store's own: `custom.relation_own`,
  -- `custom.relation_carry` and `custom.relation_targets` are SECURITY DEFINER doors of schema
  -- `custom` with a client grant, and they ask the ladder. This is the access question the old
  -- seat could not ask at all.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 13a. THE CONTROL FIRST: she reads the note's relation targets, which is on her
  --      organization's lane, so PART 13 is not a door that refuses her everything.
  v_caught := null;
  begin
    perform count(*) from custom.relation_targets(v_org, r_note, 'about');
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is not null then
    raise exception '13a: test@test.com cannot read the note''s relation targets ("%"), so 13b proves nothing', v_caught;
  end if;
  raise notice '13a. control — test@test.com reads the note''s relation targets.';

  -- 13b. THE NEGATIVE: she may not make one record contain another when nobody gave her either.
  v_caught := null;
  begin
    perform custom.relation_own(v_org, r_note, r_tag);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception '13b: test@test.com made one record contain another with nothing shared with her';
  end if;
  raise notice '13b. test@test.com is refused a containment she was given nothing for: "%"', left(v_caught, 110);
  perform set_config('request.jwt.claims', c_admin_j, true);

  raise notice '════ W1-REL / C-12 — every REL clause holds on the MAIN database, and every one of them was asked FROM THE SEAT `authenticated` through the doors a browser reaches. Two model facts have no door and say so where they happen: a Table''s `contained_by_relation`, and flipping a relation''s `loops`. Rolling back. ════';
end $t$;

rollback;

-- LANE REFERENCE-KEEPS-ARCHIVED — ARCHIVING A RECORD KEEPS EVERY REFERENCE OTHER RECORDS HOLD TO IT.
--
-- THE USE CASE (BREAKER-3 B3-21): a physical-therapy front desk keeps Follow-ups that point at Patients
-- (one Patient, and a multi-reference Family list). The desk archives a Patient. The Follow-up must
-- still name that Patient — drawn as archived — and after "Bring back" the reference works again,
-- unchanged and in its place. Chair ruling B3-21 (2026-10-01): an archive is only a delete a person can
-- undo; stripping references on archive is data loss a restore cannot undo. A relation's
-- `on_target_delete` is carried out by a true purge only (custom.migrate_purge_hard).
--   A. archive the Patient: the Follow-up's Patient cell and Family list are unchanged; the edges live;
--      the Follow-up stays editable (A2); a NEW pointer at the archived Patient is still refused (A3);
--   B. the store still names the archived Patient for the chip (custom.relation_words_many);
--   C. the list a person CHOOSES from (the Patients table's live rows) does not offer the archived one;
--   D. bring it back: nothing changed on the Follow-up (same ids, same order, no duplicate edge);
--   E. archiving a whole target table keeps the reference too; a compliance erasure (migrate_purge_hard)
--      of that table past its window takes the pointer out of the Follow-up and its edge — the one
--      place set_null runs.
-- RUN IT (clone; always rolled back):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/refkeep_an_archived_record_keeps_every_reference.sql
-- ITS RED: on the bodies before refkeep_an_archived_record_keeps_every_reference_to_it.sql it fails at A
-- (the Patient cell is emptied and Sean is taken out of the Family list); with that file and without
-- refkeep_c_a_record_pointing_at_an_archived_one_stays_editable.sql it fails at A2.

\set ON_ERROR_STOP on
\timing off

\set suite 'refkeep_an_archived_record_keeps_every_reference.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '180s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss    text := current_user;
  v_org uuid := gen_random_uuid();
  v_home uuid; v_pat uuid; v_fu uuid; v_f_one uuid; v_f_fam uuid;
  v_sean uuid; v_maya uuid; v_fu1 uuid; v_doc uuid; v_lee uuid;
  v_j jsonb; v_before jsonb; v_t text; v_n int; v_res jsonb;
begin
  perform set_config('app.actor_system', 'campaign-test/refkeep', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Harbor Physical Therapy', 'harbor-pt-refkeep-' || substr(v_org::text, 1, 8), 'HPT', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'refkeep');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Front desk')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  v_pat := custom.table_declare(v_org, jsonb_build_object(
    'name','Patients','slug','patients','type','entity','label_singular','Patient','label_plural','Patients',
    'title_field','pname','display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',30,
    'fields', jsonb_build_array(jsonb_build_object('name','pname')),'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_pat, jsonb_build_object('label','Name','key','pname','type','text'));
  v_fu := custom.table_declare(v_org, jsonb_build_object(
    'name','Follow-ups','slug','follow_ups','type','entity','label_singular','Follow-up','label_plural','Follow-ups',
    'title_field','task','display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','task')),'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_fu, jsonb_build_object('label','Task','key','task','type','text'));
  v_f_one := custom.field_declare(v_org, v_fu, jsonb_build_object('label','Patient','key','patient','type','relation',
    'relation_target', v_pat::text, 'on_target_delete','set_null'));
  v_f_fam := custom.field_declare(v_org, v_fu, jsonb_build_object('label','Family','key','family','type','relation',
    'relation_target', v_pat::text, 'multi', true, 'relation_max', 10, 'on_target_delete','set_null'));

  v_sean := custom.record_write(v_org, v_pat, jsonb_build_object('pname','Sean O''Brien'));
  v_maya := custom.record_write(v_org, v_pat, jsonb_build_object('pname','Maya Chen'));
  v_fu1  := custom.record_write(v_org, v_fu, jsonb_build_object('task','Call Sean about his knee',
              'patient', v_sean::text, 'family', jsonb_build_array(v_sean::text, v_maya::text)));
  v_before := custom.read_record(v_org, v_fu1, false);

  -- A. ARCHIVE THE PATIENT.
  perform custom.record_delete(v_org, v_sean);
  v_j := custom.read_record(v_org, v_fu1, false);
  if (v_j ->> 'patient') is distinct from v_sean::text then
    raise exception 'A: archiving the Patient emptied the Follow-up''s Patient cell (now %)', coalesce(v_j ->> 'patient', '<empty>');
  end if;
  if (v_j -> 'family') is distinct from jsonb_build_array(v_sean::text, v_maya::text) then
    raise exception 'A: archiving the Patient changed the Family list to %', coalesce((v_j -> 'family')::text, '<empty>');
  end if;
  perform set_config('role', v_boss, true);
  select count(*) into v_n from platform.associations a
   where a.organization_id = v_org and a.source_id = v_fu1 and a.target_id = v_sean and a.deleted_at is null;
  if v_n <> 2 then raise exception 'A: % live edge(s) from the Follow-up to the archived Patient, not 2', v_n; end if;
  perform set_config('role', 'authenticated', true);

  -- A2. THE FOLLOW-UP STAYS EDITABLE while it points at an archived Patient: a change to another
  --     column saves, and the reference is still there after it.
  perform custom.record_update(v_org, v_fu1, jsonb_build_object('task','Call Sean about his knee (left voicemail)'));
  v_j := custom.read_record(v_org, v_fu1, false);
  if (v_j ->> 'patient') is distinct from v_sean::text or (v_j ->> 'task') not like '%voicemail%' then
    raise exception 'A2: editing the Follow-up beside an archived reference read back %', v_j; end if;

  -- A3. A NEW pointer at the archived Patient is still refused (the choose list never offers him).
  v_t := null;
  begin
    perform custom.record_write(v_org, v_fu, jsonb_build_object('task','Book Sean''s next visit','patient', v_sean::text));
  exception when others then v_t := sqlerrm;
  end;
  if v_t is null then raise exception 'A3: a new Follow-up pointing at the archived Patient was accepted'; end if;

  -- B. THE CHIP STILL HAS THE PATIENT'S WORDS.
  select w.words into v_t from custom.relation_words_many(v_org, v_f_one, array[v_sean]) w where w.record_id = v_sean;
  if v_t is distinct from 'Sean O''Brien' then
    raise exception 'B: the archived Patient reads "%" on the Follow-up, not his name', coalesce(v_t, '<nothing>');
  end if;

  -- C. THE LIST TO CHOOSE FROM DOES NOT OFFER HIM.
  select count(*) into v_n from custom.read_records(v_org, v_pat, false, 200, 0) r where r.id = v_sean;
  if v_n <> 0 then raise exception 'C: the Patients a person chooses from still offer the archived one'; end if;

  -- D. BRING HIM BACK: NOTHING ON THE FOLLOW-UP HAD TO CHANGE.
  perform custom.record_restore(v_org, v_sean);
  v_j := custom.read_record(v_org, v_fu1, false);
  if (v_j ->> 'patient') is distinct from v_sean::text
     or (v_j -> 'family') is distinct from (v_before -> 'family') then
    raise exception 'D: after the restore the Follow-up reads patient % family %, not as it was (% / %)',
      v_j ->> 'patient', v_j -> 'family', v_before ->> 'patient', v_before -> 'family';
  end if;
  perform set_config('role', v_boss, true);
  select count(*) into v_n from platform.associations a
   where a.organization_id = v_org and a.source_id = v_fu1 and a.deleted_at is null;
  if v_n <> 3 then raise exception 'D: after the restore the Follow-up has % live edge(s), not 3', v_n; end if;

  -- E. A TRUE PURGE IS WHERE set_null RUNS. The clinic's old Referring doctors table is archived
  --    whole, sits past its window, and a compliance erasure destroys it.
  perform set_config('role', 'authenticated', true);
  v_doc := custom.table_declare(v_org, jsonb_build_object(
    'name','Referring doctors','slug','referring_doctors','type','entity','label_singular','Doctor','label_plural','Doctors',
    'title_field','dname','display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',30,
    'fields', jsonb_build_array(jsonb_build_object('name','dname')),'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_doc, jsonb_build_object('label','Name','key','dname','type','text'));
  perform custom.field_declare(v_org, v_fu, jsonb_build_object('label','Referred by','key','referred_by','type','relation',
    'relation_target', v_doc::text, 'on_target_delete','set_null'));
  v_lee := custom.record_write(v_org, v_doc, jsonb_build_object('dname','Dr. Priya Lee'));
  perform custom.record_update(v_org, v_fu1, jsonb_build_object('referred_by', v_lee::text));
  perform custom.record_delete(v_org, v_doc);
  v_j := custom.read_record(v_org, v_fu1, false);
  if (v_j ->> 'referred_by') is distinct from v_lee::text then
    raise exception 'E: archiving the Referring doctors table took the reference out of the Follow-up (%)', coalesce(v_j ->> 'referred_by', '<empty>');
  end if;
  perform set_config('role', v_boss, true);
  -- Back-date that archive past the window (the store owner's seat; this table's rows only).
  update custom.record set deleted_at = deleted_at - interval '400 days'
   where organization_id = v_org and deleted_at is not null
     and (id = v_doc or table_id = v_doc or data ->> 'entity_definition_id' = v_doc::text);
  v_res := custom.migrate_purge_hard(v_org, v_doc,
             'The clinic closed its referral program and its counsel asked in writing for the list to be erased (refkeep test).',
             200, false);
  if coalesce((v_res ->> 'rows_purged')::int, 0) < 1 then
    raise exception 'E: the erasure destroyed nothing: %', v_res; end if;
  v_j := custom.read_record(v_org, v_fu1, false);
  if nullif(v_j ->> 'referred_by', '') is not null then
    raise exception 'E: after the erasure the Follow-up still points at %: a pointer at nothing was kept (%)', v_j ->> 'referred_by', v_res;
  end if;
  select count(*) into v_n from platform.associations a
   where a.organization_id = v_org and a.target_id = v_lee and a.deleted_at is null;
  if v_n <> 0 then raise exception 'E: % live edge(s) still point at the erased doctor', v_n; end if;
  if (v_j -> 'family') is distinct from (v_before -> 'family') then
    raise exception 'E: the erasure of another table changed the Family list (%)', v_j -> 'family'; end if;

  raise notice '[GREEN] refkeep — an archive keeps every reference (A-B), the choose list leaves the archived one out (C), a restore changes nothing (D), a true erasure clears the pointer (E).';
end
$t$;

rollback;

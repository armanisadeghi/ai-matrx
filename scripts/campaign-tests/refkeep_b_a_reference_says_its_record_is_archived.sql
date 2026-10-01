-- LANE REFERENCE-KEEPS-ARCHIVED (b) — A CHIP SAYS ITS RECORD IS ARCHIVED.
--
-- THE USE CASE: the Follow-up of the front desk (see refkeep_an_archived_record_keeps_every_reference.sql)
-- points at a Patient the desk archived. Its chip draws "Sean O'Brien" with the archived badge, which
-- needs the store to say so: custom.relation_words_many answers `archived` per record.
--   F1. before the archive both Patients read archived = false;
--   F2. after it Sean reads archived = true with his own words, Maya false;
--   F3. after the restore Sean reads false again;
--   F4. a reader who may not see the record gets the withheld sentence and archived = null (no disclosure).
-- RUN IT (clone; always rolled back):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/refkeep_b_a_reference_says_its_record_is_archived.sql
-- ITS RED: before refkeep_b_a_reference_says_its_record_is_archived.sql the door has no `archived` column (F1, 42703).

\set ON_ERROR_STOP on
\timing off

\set suite 'refkeep_b_a_reference_says_its_record_is_archived.sql'
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
  v_j jsonb; v_before jsonb; v_t text; v_n int; v_res jsonb; v_a boolean; v_b boolean;
  c_dana_j constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
begin
  perform set_config('app.actor_system', 'campaign-test/refkeep', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Harbor Physical Therapy', 'harbor-pt-refkeepb-' || substr(v_org::text, 1, 8), 'HPT', c_admin);
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
  select w.archived into v_a from custom.relation_words_many(v_org, v_f_one, array[v_sean]) w;
  select w.archived into v_b from custom.relation_words_many(v_org, v_f_one, array[v_maya]) w;
  if v_a is distinct from false or v_b is distinct from false then
    raise exception 'F1: before any archive the door says archived % / %', v_a, v_b; end if;

  perform custom.record_delete(v_org, v_sean);
  select w.words, w.archived into v_t, v_a from custom.relation_words_many(v_org, v_f_one, array[v_sean]) w;
  if v_t is distinct from 'Sean O''Brien' or v_a is distinct from true then
    raise exception 'F2: the archived Patient reads "%" archived %, not his name and true', v_t, v_a; end if;
  select w.archived into v_b from custom.relation_words_many(v_org, v_f_one, array[v_maya]) w;
  if v_b is distinct from false then raise exception 'F2: the live Patient reads archived %', v_b; end if;

  perform custom.record_restore(v_org, v_sean);
  select w.archived into v_a from custom.relation_words_many(v_org, v_f_one, array[v_sean]) w;
  if v_a is distinct from false then raise exception 'F3: after the restore the Patient reads archived %', v_a; end if;

  -- F4. test@test.com, a member shared nothing, asks about the archived Patient.
  perform custom.record_delete(v_org, v_sean);
  perform set_config('role', v_boss, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','member_default_visibility','organization', v_org, v_org, '"shared_only"'::jsonb, 'refkeepb');
  perform set_config('request.jwt.claims', c_dana_j, true);
  perform set_config('role', 'authenticated', true);
  select w.words, w.archived into v_t, v_a from custom.relation_words_many(v_org, v_f_one, array[v_sean]) w;
  if v_t is distinct from platform.relation_withheld_label() or v_a is not null then
    raise exception 'F4: a reader shared nothing reads "%" archived % for the archived Patient', v_t, v_a; end if;

  raise notice '[GREEN] refkeepb — the words door says archived for a reference to an archived record (F1-F3) and nothing to a reader it withholds from (F4).';
end
$t$;

rollback;

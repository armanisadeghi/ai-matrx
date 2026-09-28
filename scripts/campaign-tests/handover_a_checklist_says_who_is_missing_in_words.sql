-- HANDOVER (2026-09-28) — A CHECKLIST SAYS WHO IS MISSING IN WORDS, NEVER BY KEY.
--
-- The use case: Cedar Ridge Physical Therapy starts "New patient intake" on a new patient. Its
-- two roles (front desk, therapist) have nobody named yet. The start said "Nobody is named for
-- front_desk or therapist yet" — the template's keys. RED before the lane: the sentence carries
-- the keys.
--
--   1  the start names the missing roles by the template's own labels.
--   2  a role with no label is read aloud ("intake_coordinator" -> "Intake Coordinator").
--   3  waiting_on_a_name still answers the keys, for code.
\set suite 'handover_a_checklist_says_who_is_missing_in_words.sql'
\set requires 'function:custom.checklist_start'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '45s';
set local statement_timeout = '120s';

do $$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_patients uuid;
  v_patient uuid;
  v_tpl     uuid;
  v_res     jsonb;
  v_msg     text;
begin
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy — Eastside ' || left(v_org::text, 8),
          'cedar-ridge-pt-eastside-' || left(v_org::text, 8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'handover checklist words', c_admin);
  perform set_config('app.actor_system', 'campaign-test/handover_a_checklist_says_who_is_missing_in_words', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Clinic', 'description', 'the suite''s home', '_actor', 'user'));
  v_patients := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Patients', 'slug', 'patients', 'description', 'everyone the clinic treats',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 3650, 'row_order', 'sorted', 'default_sort', '[]'::jsonb,
      'agent_writable', true, 'label_singular', 'Patient', 'label_plural', 'Patients',
      'title_field', 'name', 'fields', jsonb_build_array(jsonb_build_object('name', 'name')),
      'parent_id', v_home));
  perform custom.field_declare(v_org, v_patients, jsonb_build_object('label', 'Name', 'key', 'name', 'type', 'text'));
  v_patient := custom.record_write(v_org, v_patients, jsonb_build_object('name', 'Camille Duprez'));

  v_res := custom.checklist_declare(v_org, jsonb_build_object(
    'name', 'New patient intake',
    'about_table_id', v_patients::text,
    'roles', jsonb_build_array(
      jsonb_build_object('role', 'front_desk', 'label', 'Front desk'),
      jsonb_build_object('role', 'therapist', 'label', 'Therapist'),
      jsonb_build_object('role', 'intake_coordinator')),
    'steps', jsonb_build_array(
      jsonb_build_object('ref', 'insurance', 'title', 'Verify insurance benefits', 'role', 'front_desk', 'due_days', 1),
      jsonb_build_object('ref', 'packet', 'title', 'Send the intake packet', 'role', 'intake_coordinator', 'due_days', 1),
      jsonb_build_object('ref', 'evaluation', 'title', 'Initial evaluation', 'role', 'therapist',
                         'due_days', 3, 'depends_on', jsonb_build_array('insurance')))));
  v_tpl := (v_res ->> 'template_id')::uuid;

  v_res := custom.checklist_start(v_org, v_tpl, v_patient, '{}'::jsonb, null);
  v_msg := v_res ->> 'message';

  -- ── 1  LABELS ────────────────────────────────────────────────────────────────────────
  if v_msg like '%front_desk%' or v_msg like '%therapist or%' or v_msg not like '%Front desk%' or v_msg not like '%Therapist%' then
    raise exception '1: the start names the missing roles by key, not by the template''s words: %', v_msg;
  end if;
  raise notice '1 PASSED — %', v_msg;

  -- ── 2  A ROLE WITH NO LABEL IS READ ALOUD ───────────────────────────────────────────
  if v_msg like '%intake_coordinator%' or v_msg not like '%Intake Coordinator%' then
    raise exception '2: a role with no label reached the sentence as its key: %', v_msg;
  end if;
  raise notice '2 PASSED — a role with no label reads "Intake Coordinator".';

  -- ── 3  THE KEYS STAY FOR CODE ───────────────────────────────────────────────────────
  if (v_res -> 'waiting_on_a_name') is distinct from '["front_desk","intake_coordinator","therapist"]'::jsonb then
    raise exception '3: waiting_on_a_name no longer answers the keys: %', v_res -> 'waiting_on_a_name';
  end if;
  raise notice '3 PASSED — waiting_on_a_name still answers the keys.';
end
$$;
rollback;

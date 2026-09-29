-- HANDOVER (2026-09-28) — A CHANGE THE STORE WOULD REFUSE IS NEVER FILED FOR APPROVAL.
--
-- The use case: Cedar Ridge Physical Therapy's workflow adds a referred patient whose Insurance
-- is "Blue Shield", which is not one of the column's choices. The wait was filed and the run
-- paused; only Approve found the store refuses it. RED before the lane: the request is filed.
--
--   1  a new record the store would refuse is refused at filing, in the store's own words.
--   2  a patch the store would refuse is refused at filing too.
--   3  a good new record is filed, and trying it wrote nothing.
\set suite 'handover_a_change_the_store_would_refuse_is_never_filed.sql'
\set requires 'function:custom.work_approval_request'
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
  v_camille uuid;
  v_filed   jsonb;
  v_msg     text;
  v_n       integer;
begin
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy — Southside ' || left(v_org::text, 8),
          'cedar-ridge-pt-southside-' || left(v_org::text, 8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'handover held refusal', c_admin);
  perform set_config('app.actor_system', 'campaign-test/handover_a_change_the_store_would_refuse_is_never_filed', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Clinic', 'description', 'the suite''s home', '_actor', 'user'));
  v_patients := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Patients', 'slug', 'patients', 'description', 'everyone the clinic treats',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 3650, 'row_order', 'sorted', 'default_sort', '[]'::jsonb,
      'agent_writable', true, 'label_singular', 'Patient', 'label_plural', 'Patients',
      'title_field', 'full_name',
      'fields', jsonb_build_array(jsonb_build_object('name', 'full_name'), jsonb_build_object('name', 'insurance_provider')),
      'parent_id', v_home));
  perform custom.field_declare(v_org, v_patients, jsonb_build_object('label', 'Full name', 'key', 'full_name', 'type', 'text'));
  perform custom.field_declare(v_org, v_patients, jsonb_build_object(
      'label', 'Insurance', 'key', 'insurance_provider', 'parity_type', 'select',
      'options', jsonb_build_array('Aetna', 'Blue Cross Blue Shield', 'Medicare')));
  v_camille := custom.record_write(v_org, v_patients, jsonb_build_object('full_name', 'Camille Duprez', 'insurance_provider', 'Aetna'));

  -- ── 1  A NEW RECORD THE STORE WOULD REFUSE ──────────────────────────────────────────
  begin
    v_filed := custom.work_approval_request(v_org, v_patients,
      jsonb_build_object('kind', 'record_add', 'rows',
        jsonb_build_array(jsonb_build_object('full_name', 'Rafael Moreno', 'insurance_provider', 'Blue Shield'))),
      null, null, 'agent', null);
    raise exception '1: a record the store would refuse was filed for approval: %', v_filed;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '1:%' then raise; end if;
    if v_msg not like '%does not have a choice called%' then
      raise exception '1: refused, but not in the store''s words: %', v_msg;
    end if;
  end;
  raise notice '1 PASSED — %', v_msg;

  -- ── 2  A PATCH THE STORE WOULD REFUSE ────────────────────────────────────────────────
  begin
    v_filed := custom.work_approval_request(v_org, v_camille,
      jsonb_build_object('kind', 'record_patch', 'patch', jsonb_build_object('insurance_provider', 'Blue Shield')),
      null, null, 'agent', null);
    raise exception '2: a patch the store would refuse was filed for approval: %', v_filed;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '2:%' then raise; end if;
    if v_msg not like '%does not have a choice called%' then
      raise exception '2: refused, but not in the store''s words: %', v_msg;
    end if;
  end;
  raise notice '2 PASSED — the patch is refused at filing too.';

  -- ── 3  A GOOD NEW RECORD IS FILED, AND NOTHING WAS WRITTEN ─────────────────────────
  v_filed := custom.work_approval_request(v_org, v_patients,
    jsonb_build_object('kind', 'record_add', 'rows',
      jsonb_build_array(jsonb_build_object('full_name', 'Rafael Moreno', 'insurance_provider', 'Blue Cross Blue Shield'))),
    null, null, 'agent', null);
  if v_filed is null then
    raise exception '3: a good record was not filed';
  end if;
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from custom.record
   where organization_id = v_org and table_id = v_patients and deleted_at is null and data ->> 'full_name' = 'Rafael Moreno';
  if v_n <> 0 then
    raise exception '3: trying the change wrote % record(s)', v_n;
  end if;
  raise notice '3 PASSED — filed, and nothing was written.';
end
$$;
rollback;

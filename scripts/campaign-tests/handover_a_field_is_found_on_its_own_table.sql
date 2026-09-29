-- HANDOVER (2026-09-29) — A FIELD IS FOUND ON ITS OWN TABLE.
--
-- The use case: Cedar Ridge Physical Therapy's Visits table keeps a Status list (Scheduled,
-- Completed, No-show). A booking page over it writes "booked" when a visitor takes a time, which
-- that list cannot hold, so custom.booking_declare must refuse the page when it is made. It looked
-- the Status Field up by data.table_id, which a Field does not carry, found nothing, and let the
-- page through; every visitor was refused at the last step. RED before the lane: 1 and 2 fail.
--
--   1  a booking page over a Status list with no "booked" is refused when it is made.
--   2  a form whose question is required gets an accept Rule that checks it.
\set suite 'handover_a_field_is_found_on_its_own_table.sql'
\set requires 'function:custom.booking_declare'
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
  v_visits  uuid;
  v_msg     text;
  v_rule    text;
begin
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy — Westfield ' || left(v_org::text, 8),
          'cedar-ridge-pt-westfield-' || left(v_org::text, 8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'handover field lookup', c_admin);
  perform set_config('app.actor_system', 'campaign-test/handover_a_field_is_found_on_its_own_table', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Clinic', 'description', 'the suite''s home', '_actor', 'user'));
  v_visits := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Visits', 'slug', 'visits', 'description', 'every appointment',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 3650, 'row_order', 'sorted', 'default_sort', '[]'::jsonb,
      'agent_writable', true, 'label_singular', 'Visit', 'label_plural', 'Visits',
      'title_field', 'visit_notes',
      'fields', jsonb_build_array(jsonb_build_object('name', 'visit_notes'), jsonb_build_object('name', 'status')),
      'parent_id', v_home));
  perform custom.field_declare(v_org, v_visits, jsonb_build_object('label', 'Visit notes', 'key', 'visit_notes', 'type', 'text', 'required', true));
  perform custom.field_declare(v_org, v_visits, jsonb_build_object(
      'label', 'Status', 'key', 'status', 'parity_type', 'select',
      'options', jsonb_build_array('Scheduled', 'Completed', 'No-show')));

  -- ── 1  REFUSED WHEN IT IS MADE ───────────────────────────────────────────────────────
  begin
    perform custom.booking_declare(v_org, v_visits, 'Book a 30-minute visit',
      jsonb_build_array(jsonb_build_object('field', 'visit_notes')),
      jsonb_build_object('timezone', 'America/Los_Angeles', 'slot_minutes', 30,
                         'windows', jsonb_build_array(jsonb_build_object('weekday', 1, 'from', '09:00', 'to', '17:00'))),
      '{}'::jsonb, null, null, null, null, null, null);
    raise exception '1: a booking page over a Status with no "booked" was made';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '1:%' then raise; end if;
    if v_msg not like '%has no choice called booked%' then
      raise exception '1: refused, but not for the Status: %', v_msg;
    end if;
  end;
  raise notice '1 PASSED — %', v_msg;

  -- ── 2  THE ACCEPT RULE CHECKS THE REQUIRED QUESTION ──────────────────────────────────
  perform custom.form_declare(v_org, v_visits, 'Visit request',
      jsonb_build_array(jsonb_build_object('field', 'visit_notes', 'required', true)),
      '{}'::jsonb, null, null, null, null, null);
  perform set_config('role', 'postgres', true);
  select string_agg(data ->> 'name', ' | ') into v_rule from custom.record
   where organization_id = v_org and deleted_at is null and data ->> 'name' like 'Visit request:%';
  if v_rule is null or v_rule not like '%every answer it asks for is there%' then
    raise exception '2: the form''s accept Rule does not check its required question: %', coalesce(v_rule, 'none');
  end if;
  raise notice '2 PASSED — %', v_rule;
end
$$;
rollback;

-- HANDOVER (2026-09-28) — A SUMMARY SAYS "SINCE" IN ITS OWNER'S CLOCK.
--
-- The use case: Cedar Ridge Physical Therapy's office manager, in California, previews her weekly
-- Patients summary. It said "Since Monday 21 September 2026 20:43 UTC." RED before the lane: the
-- sentence is always UTC, whatever zone the subscription carries.
--
--   1  a subscription kept in America/Los_Angeles says "13:43, America/Los_Angeles time".
--   2  a subscription with no zone still says UTC, plainly.
\set suite 'handover_a_summary_says_since_in_its_owners_clock.sql'
\set requires 'function:custom.subscription_declare'
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
  v_view    uuid;
  v_la      uuid;
  v_utc     uuid;
  v_body    text;
begin
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy — Northside ' || left(v_org::text, 8),
          'cedar-ridge-pt-northside-' || left(v_org::text, 8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'handover since words', c_admin);
  perform set_config('app.actor_system', 'campaign-test/handover_a_summary_says_since_in_its_owners_clock', true);
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
  perform custom.record_write(v_org, v_patients, jsonb_build_object('name', 'Camille Duprez'));
  v_view := custom.view_declare(v_org, v_patients, jsonb_build_object('name', 'All patients', 'filters', '{}'::jsonb));

  v_la := custom.subscription_declare(v_org, v_patients, jsonb_build_object(
      'name', 'Weekly Patients summary', 'saved_view_id', v_view, 'cadence', 'weekly',
      'schedule', 'monday 08:00', 'channel', 'in_app',
      'quiet_hours', jsonb_build_object('tz', 'America/Los_Angeles')));
  v_utc := custom.subscription_declare(v_org, v_patients, jsonb_build_object(
      'name', 'Weekly Patients summary (no zone)', 'saved_view_id', v_view, 'cadence', 'weekly',
      'schedule', 'monday 08:00', 'channel', 'in_app'));

  perform set_config('role', 'postgres', true);

  -- ── 1  ITS OWNER'S CLOCK ─────────────────────────────────────────────────────────────
  v_body := custom.agg_digest_assemble(v_org, v_la, '2026-09-21 20:43:00+00', now()) ->> 'body';
  if v_body not like '%Since Monday 21 September 2026 13:43, America/Los_Angeles time.%' then
    raise exception '1: the summary did not say "since" in its owner''s clock: %', v_body;
  end if;
  raise notice '1 PASSED — %', v_body;

  -- ── 2  NO ZONE SAYS UTC ─────────────────────────────────────────────────────────────
  v_body := custom.agg_digest_assemble(v_org, v_utc, '2026-09-21 20:43:00+00', now()) ->> 'body';
  if v_body not like '%Since Monday 21 September 2026 20:43 UTC.%' then
    raise exception '2: a summary with no zone did not say UTC plainly: %', v_body;
  end if;
  raise notice '2 PASSED — a summary with no zone says UTC.';
end
$$;
rollback;

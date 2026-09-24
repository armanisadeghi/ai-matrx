-- LANE S7-PRIME — the DATA the public-form headless walk opens, left COMMITTED on the dev clone.
--
-- Ridgeline Physical Therapy (the test organization FORMS-FIX-1's walk already uses on the
-- clone, owned by admin@admin.com = Dr. Ana Whitfield, practice manager). A referral intake: a
-- referring clinic's link fills in the clinic, the imaging question is asked only when a clinic
-- is named, and the thank-you screen says the next step. Every name is synthesized. The
-- organization's redirect list names example.com (IANA's reserved domain, which really answers
-- over https), so the walk can prove the redirect lands without sending a stranger anywhere real.
-- The nightly clone refresh restores production over all of it.
--
-- CLONE ONLY: `\set expect 'clone'` makes the preamble refuse the main database and the branch.
-- Prints `WALK <key> <value>` for every id the walk needs. Re-running it makes a NEW form (and
-- Table) with a fresh suffix, so a walk never inherits an earlier walk's saved places.

\set ON_ERROR_STOP on
\timing off
\set suite '_s7_walk_fixture.sql'
\set expect 'clone'
\set requires 'function:custom.form_draft_save'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

do $w$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_org     constant uuid := '0fec03d8-afe5-4ea0-bf14-d0ab18e4a536';
  c_home    constant uuid := '0f81c607-c32e-4909-ac79-bb4212fe4a61';
  v_boss    text := current_user;
  v_suffix  text := to_char(clock_timestamp(), 'HH24MISS');
  v_table   uuid;
  v_clinic  uuid;
  v_form    uuid;
begin
  if not exists (select 1 from iam.organizations where id = c_org and name = 'Ridgeline Physical Therapy') then
    raise exception 'the Ridgeline Physical Therapy test organization is not on this clone';
  end if;
  -- The practice's own booking vendor, as its owner would list it in the forms settings.
  delete from platform.knob_override
   where feature = 'custom' and key = 'form_redirect_domains' and organization_id = c_org;
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'form_redirect_domains', 'organization', c_org, c_org, '["example.com"]'::jsonb,
          '_s7_walk_fixture.sql: the practice''s booking page for the S7-PRIME walk', c_admin);

  perform set_config('app.actor_system', 'campaign-test/_s7_walk_fixture.sql', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  v_table := custom.table_declare(c_org, jsonb_build_object(
      'name', 'Referral intake ' || v_suffix, 'slug', 'referral_intake_' || v_suffix,
      'description', 'New patients sent to us by another clinic, from the referral link.',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 30, 'row_order', 'sorted',
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'full_name', 'direction', 'asc')),
      'agent_writable', true, 'label_singular', 'Referral', 'label_plural', 'Referrals',
      'title_field', 'full_name',
      'fields', jsonb_build_array(jsonb_build_object('name', 'referring_clinic'), jsonb_build_object('name', 'imaging_sent'),
                                  jsonb_build_object('name', 'full_name'), jsonb_build_object('name', 'phone'),
                                  jsonb_build_object('name', 'reason_for_visit'), jsonb_build_object('name', 'goals')),
      'parent_id', c_home));
  v_clinic := custom.field_declare(c_org, v_table, jsonb_build_object('label', 'Referring clinic', 'key', 'referring_clinic', 'type', 'text'));
  perform custom.field_declare(c_org, v_table, jsonb_build_object('label', 'Imaging sent', 'key', 'imaging_sent', 'type', 'text'));
  perform custom.field_declare(c_org, v_table, jsonb_build_object('label', 'Full name', 'key', 'full_name', 'type', 'text', 'required', true));
  perform custom.field_declare(c_org, v_table, jsonb_build_object('label', 'Mobile phone', 'key', 'phone', 'type', 'text', 'format', 'phone', 'required', true));
  perform custom.field_declare(c_org, v_table, jsonb_build_object('label', 'What brings you in?', 'key', 'reason_for_visit', 'type', 'text', 'format', 'long'));
  perform custom.field_declare(c_org, v_table, jsonb_build_object('label', 'Goals', 'key', 'goals', 'type', 'text', 'format', 'long'));

  v_form := custom.form_declare(c_org, v_table, 'Referral intake',
    jsonb_build_array(
      jsonb_build_object('field', 'referring_clinic', 'ask', 'Which clinic referred you?'),
      jsonb_build_object('field', 'imaging_sent', 'ask', 'Did your referring clinic send any X-rays or an MRI?',
                         'help', 'If you are not sure, say so — we will ask them.',
                         'showIf', jsonb_build_object('op', 'present', 'args', jsonb_build_array(jsonb_build_object('field', v_clinic)))),
      jsonb_build_object('field', 'full_name', 'ask', 'Your full name', 'required', true),
      jsonb_build_object('field', 'phone', 'ask', 'Best number to reach you', 'required', true),
      jsonb_build_object('field', 'reason_for_visit', 'ask', 'What brings you in?'),
      jsonb_build_object('field', 'goals', 'ask', 'What would you like to get back to doing?')),
    jsonb_build_object('flow', 'one-at-a-time',
      'intro', 'Welcome to Ridgeline Physical Therapy. This takes about three minutes; you can stop and finish later.'));
  perform custom.anon_publish(c_org, v_form, true);

  perform set_config('role', v_boss, true);
  raise notice 'WALK org %', c_org;
  raise notice 'WALK table %', v_table;
  raise notice 'WALK form %', v_form;
end;
$w$;

commit;

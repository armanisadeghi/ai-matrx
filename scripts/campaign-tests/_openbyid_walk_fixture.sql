-- LANE ROUTE-RESOLVER — the DATA the /o/<id> headless walk opens, left COMMITTED on the dev clone.
--
-- Same use case as openbyid_green.sql (Cedar Ridge Veterinary Clinic; Marisol Vega =
-- test@test.com; Dr. Ana Whitfield = admin@admin.com; Bend Animal Emergency & Referral shares its
-- Referrals table with Marisol, who is not a member). Every name is synthesized. The nightly
-- clone refresh restores production over all of it.
--
-- CLONE ONLY: `\set expect 'clone'` makes the preamble refuse the main database and the branch.
-- Prints one line per id the walk needs: `WALK <key> <uuid>`.

\set ON_ERROR_STOP on
\timing off
\set suite '_openbyid_walk_fixture.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';
\i scripts/campaign-tests/_gridprim_clinic.sql

do $w$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid; v_appts uuid; v_er uuid; v_er_home uuid; v_referrals uuid; v_id uuid;
begin
  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';

  perform set_config('request.jwt.claims', c_dana_j, true);
  insert into workbench.udt_datasets (table_name, description, user_id, organization_id, created_by, visibility)
  values ('Boarding kennel log', 'Who is boarding, which run, feeding notes', c_dana, v_org, c_dana, 'personal')
  returning id into v_id;
  insert into gp values ('kennel', v_id);

  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into custom.anon_form (organization_id, table_id, slug, title, exposed_field_keys, required_field_keys,
                                rate_limit_per_window, rate_limit_window)
  values (v_org, v_appts, 'new-patient-intake', 'New patient intake',
          '["patient","species","owner_phone"]'::jsonb, '["patient"]'::jsonb, 20, interval '1 hour')
  returning id into v_id;
  insert into gp values ('form', v_id);

  v_er := gen_random_uuid();
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_er, 'Bend Animal Emergency & Referral ' || substr(v_er::text, 1, 8),
          'bend-animal-er-' || substr(v_er::text, 1, 8), 'BAE', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_er, 'organization', v_er, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',             'organization', v_er, v_er, 'true'::jsonb, 'openbyid walk fixture'),
    ('custom', 'external_principal_enabled', 'organization', v_er, v_er, 'true'::jsonb, 'openbyid walk fixture: the hospital shares with referring clinics');
  insert into custom.record (organization_id, table_id, data)
  values (v_er, null, jsonb_build_object('name', 'Home')) returning id into v_er_home;
  v_referrals := custom.table_declare(v_er, jsonb_build_object(
    'name', 'Referrals', 'slug', 'referrals', 'type', 'entity',
    'label_singular', 'Referral', 'label_plural', 'Referrals',
    'title_field', 'patient', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'patient', 'direction', 'asc')),
    'parent_id', v_er_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'patient'))));
  perform custom.field_declare(v_er, v_referrals, jsonb_build_object(
    'key', 'patient', 'label', 'Patient', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.record_write(v_er, v_referrals, jsonb_build_object('patient', 'Moose (Delgado) — CCL tear, TPLO consult'));
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status, created_by)
  values ('record', v_referrals, c_dana, 'viewer', 'active', c_admin);
  insert into gp values ('er', v_er), ('referrals', v_referrals);
end $w$;

select 'WALK ' || k || ' ' || v from gp where k in ('org', 'appts', 'r3', 'kennel', 'form', 'er', 'referrals') order by k;
commit;

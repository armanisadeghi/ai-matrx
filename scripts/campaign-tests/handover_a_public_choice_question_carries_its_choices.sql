-- HANDOVER (2026-09-28) — A PUBLIC CHOICE QUESTION CARRIES ITS CHOICES.
--
-- The use case: Cedar Ridge Physical Therapy published a booking page on Visits that asks the
-- visitor for the Visit type (Initial Evaluation, Follow-up, Re-evaluation, Discharge Visit). A
-- stranger saw a free-text box: the choices live in the organization's own choice list, which a
-- page answered without an account may not read, and custom.booking_public / custom.form_public
-- handed back only the list's id. RED before the lane: the field carries no public_choices.
--
--   1  booking_public hands a choice question its live choices' labels and keys, in order.
--   2  form_public does the same for a form over the same table.
--   3  a text question carries none (nothing is invented for a field that takes no choices).
\set suite 'handover_a_public_choice_question_carries_its_choices.sql'
\set requires 'function:custom.organization_kernel_id'
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
  v_table   uuid;
  v_form    uuid;
  v_page    record;
  v_field   jsonb;
  v_form2   uuid;
  v_labels  text;
begin
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy — Westside ' || left(v_org::text, 8),
          'cedar-ridge-pt-westside-' || left(v_org::text, 8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'handover public choices', c_admin);
  perform set_config('app.actor_system', 'campaign-test/handover_a_public_choice_question_carries_its_choices', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Clinic', 'description', 'the suite''s home', '_actor', 'user'));
  v_table := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Visits', 'slug', 'visits', 'description', 'every booked appointment',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 30, 'row_order', 'sorted', 'default_sort', '[]'::jsonb,
      'agent_writable', true, 'label_singular', 'Visit', 'label_plural', 'Visits',
      'title_field', 'visit_notes',
      'fields', jsonb_build_array(jsonb_build_object('name', 'visit_notes'), jsonb_build_object('name', 'visit_type')),
      'parent_id', v_home));
  perform custom.field_declare(v_org, v_table, jsonb_build_object('label', 'Visit notes', 'key', 'visit_notes', 'type', 'text'));
  perform custom.field_declare(v_org, v_table, jsonb_build_object(
      'label', 'Visit type', 'key', 'visit_type', 'parity_type', 'select',
      'options', jsonb_build_array('Initial Evaluation', 'Follow-up', 'Re-evaluation', 'Discharge Visit')));

  -- THE FORM FIRST, through the owner's own door. (A booking page is the same row with a booking
  -- block; custom.booking_declare also builds a slot index on custom.record, which a busy copy
  -- cannot lock, so the block is written straight onto the row the form door made — the read
  -- door under test is custom.booking_public, not the builder.)
  v_form2 := custom.form_declare(v_org, v_table, 'New patient request',
      jsonb_build_array(jsonb_build_object('field', 'visit_type'), jsonb_build_object('field', 'visit_notes')),
      '{}'::jsonb, null, null, null, null, null);
  perform custom.anon_publish(v_org, v_form2, true);
  perform set_config('role', 'postgres', true);
  insert into custom.anon_form (organization_id, table_id, slug, title, exposed_field_keys, published_at, presentation)
  values (v_org, v_table, 'book-an-evaluation-' || left(v_org::text, 8), 'Book an evaluation',
          '["visit_type","visit_notes"]'::jsonb, now(),
          jsonb_build_object(
            'questions', jsonb_build_array(jsonb_build_object('field', 'visit_type'), jsonb_build_object('field', 'visit_notes')),
            'booking', jsonb_build_object('slot_table_id', gen_random_uuid(), 'timezone', 'America/Los_Angeles',
                                          'slot_minutes', 30, 'buffer_minutes', 0, 'lead_minutes', 0,
                                          'max_per_day', 8, 'days', 7,
                                          'windows', jsonb_build_array(jsonb_build_object('weekday', 1, 'from', '09:00', 'to', '17:00')))))
  returning id into v_form;

  -- ── 1  THE BOOKING PAGE ───────────────────────────────────────────────────────────────
  select * into v_page from custom.booking_public(v_form, 1);
  select f into v_field from jsonb_array_elements(v_page.fields) f where f ->> 'key' = 'visit_type';
  select string_agg(c ->> 'label', ' | ' order by ord) into v_labels
    from jsonb_array_elements(coalesce(v_field -> 'public_choices', '[]'::jsonb)) with ordinality x(c, ord);
  if v_labels is distinct from 'Initial Evaluation | Follow-up | Re-evaluation | Discharge Visit' then
    raise exception '1: the booking page''s Visit type carries no choices a stranger can pick (%)', coalesce(v_labels, 'none');
  end if;
  raise notice '1 PASSED — the booking page offers: %', v_labels;

  -- ── 3  A TEXT QUESTION CARRIES NONE ──────────────────────────────────────────────────
  select f into v_field from jsonb_array_elements(v_page.fields) f where f ->> 'key' = 'visit_notes';
  if v_field ? 'public_choices' then
    raise exception '3: a text question was handed choices: %', v_field -> 'public_choices';
  end if;
  raise notice '3 PASSED — a text question carries no choices.';

  -- ── 2  THE FORM PAGE ─────────────────────────────────────────────────────────────────
  select f into v_field from custom.form_public(v_form2) p, jsonb_array_elements(p.fields) f where f ->> 'key' = 'visit_type';
  if jsonb_array_length(coalesce(v_field -> 'public_choices', '[]'::jsonb)) <> 4 then
    raise exception '2: the form''s Visit type carries no choices a stranger can pick (%)', v_field;
  end if;
  raise notice '2 PASSED — the form offers the same four choices.';
end
$$;
rollback;

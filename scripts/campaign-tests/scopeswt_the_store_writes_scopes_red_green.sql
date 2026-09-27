-- LANE SCOPES-WRITE-THROUGH — THE RECORD STORE WRITES AN ORGANIZATION'S SCOPES, measured RED then
-- GREEN on the dev clone.
--
-- THE USE CASE. Bayfront Family Dentistry keeps its patients as a scope type in the scopes screens —
-- "Patients", with "Preferred dentist", "Recall interval (months)" and "Contact email" — and tags
-- its front-desk notes to the patient they are about. An organization made today writes its scopes
-- in the record store first: every scope, field, value and tag lands in the store in the same save,
-- the old context tables are kept exact for every screen and server path that still reads them, and
-- the store's own rules decide. Harbor Point Validation, an older organization, keeps the old tables
-- as its writer until the scopes switch is pressed for it, and the switch goes back losslessly.
--
-- Both organizations, the patients and the notes are synthesized and rolled back. Nothing of the
-- owner's is read or written.
--
-- WHAT MAKES IT FAIL (RED before the three scopeswt_* campaign files, GREEN after):
--   T1  an organization made after the switch was installed writes in the store; a scope type,
--       fields, a patient and a value made through the OLD doors are in the store in the same
--       statement, with the same ids
--   T2  a value written through the store's door (custom.context_value_write) is in the patient's
--       Record first, and the old row is its image under the id the Record's source names
--   T3  archiving the scope type through the door archives its Table, Fields and Records; restoring
--       it brings back exactly those
--   T4  a value the store refuses (words in a number field) refuses the old write too: nothing lands
--   T5  a generic store write into the patient's Record (the grid, the records tool) is refused
--       with the sentence that names where to edit it
--   T6  tagging a note to the patient lands the tag's store copy in the same statement
--   T7  the older organization is untouched: its write queues a follow row and writes no Record
--   T8  the scopes switch for one organization: refused until parity is measured, then switched,
--       its state read from the writer, and switched back to an explicit off
--   T9  the switch for every organization at once (the final switch), for a named batch, and its undo
--   T11 an organization with no scopes is ready (nothing to compare) and the every-organization press
--       presses it; one whose record store is off is skipped and named, never a failed run
--       (RED before scopeswt_an_organization_with_nothing_to_compare_is_ready.sql)
--   T12 a signed-in stranger (test@test.com, no member of Bayfront) cannot ask which system writes
--       Bayfront's scopes: custom.context_writer is closed to her, custom._ctx_answer refuses her by
--       name (RED before scopeswt_the_scope_doors_decide_who_is_asking.sql, VERIFIER-27)
--   T13 a stranger's scope write is refused in the name of the door she called
--       (RED before scopeswt_the_scope_doors_refuse_in_their_own_name.sql, census 17)
--   T10 an industry template (Dental Practice) applies through the store's door: its types and fields
--       land on both sides, and "Reports To" points at another team member (RED before
--       scopeswt_a_template_applies_and_a_value_brings_its_field.sql: 26 of 34 templates refused)

\set ON_ERROR_STOP on
\timing off
\set suite 'scopeswt_the_store_writes_scopes_red_green.sql'
\set requires 'relation:custom.io_outbox|function:public.create_scope_type|function:public.set_entity_scopes'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '240s';

create temp table sf (k text primary key, v uuid) on commit drop;

do $fixture$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_org uuid := gen_random_uuid();
  v_old uuid := gen_random_uuid();
  v_new uuid := gen_random_uuid();
  v_empty uuid := gen_random_uuid();
  v_off uuid := gen_random_uuid();
begin
  perform set_config('app.actor_system', 'campaign-test/scopeswt', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Bayfront Family Dentistry ' || substr(v_org::text, 1, 6), 'bayfront-family-dentistry-' || substr(v_org::text, 1, 8), 'BFD', c_admin),
    (v_old, 'Harbor Point Validation ' || substr(v_old::text, 1, 6), 'harbor-point-val-' || substr(v_old::text, 1, 8), 'HPV', c_admin),
    (v_new, 'Lakeview Dental Studio ' || substr(v_new::text, 1, 6), 'lakeview-dental-' || substr(v_new::text, 1, 8), 'LDS', c_admin),
    (v_empty, 'Seaside Orthodontics ' || substr(v_empty::text, 1, 6), 'seaside-ortho-' || substr(v_empty::text, 1, 8), 'SOR', c_admin),
    (v_off, 'Cove Street Endodontics ' || substr(v_off::text, 1, 6), 'cove-endo-' || substr(v_off::text, 1, 8), 'CSE', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner', 'active'),
    (v_old, 'organization', v_old, c_admin, 'owner', 'active'),
    (v_new, 'organization', v_new, c_admin, 'owner', 'active'),
    (v_empty, 'organization', v_empty, c_admin, 'owner', 'active'),
    (v_off, 'organization', v_off, c_admin, 'owner', 'active');
  -- The older organization existed before the switch: it keeps the old tables as its writer.
  if exists (select 1 from platform.feature_knob where feature = 'custom' and key = 'scopes_written_in_the_store') then
    insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
      ('custom', 'scopes_written_in_the_store', 'organization', v_old, v_old, 'false'::jsonb, 'scopeswt suite: an organization that existed before the switch'),
      ('custom', 'scopes_written_in_the_store', 'organization', v_empty, v_empty, 'false'::jsonb, 'scopeswt suite: an older organization with no scopes'),
      ('custom', 'scopes_written_in_the_store', 'organization', v_off, v_off, 'false'::jsonb, 'scopeswt suite: an older organization whose store is off');
    insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
      ('custom', 'system_enabled', 'organization', v_off, v_off, 'false'::jsonb, 'scopeswt suite: this organization''s record store is off');
  end if;
  insert into sf values ('org', v_org), ('old', v_old), ('new', v_new), ('empty', v_empty), ('off', v_off);
end
$fixture$;

do $t$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_org uuid; v_old uuid;
  v_type uuid; v_dentist uuid; v_recall uuid; v_email uuid; v_patient uuid;
  v_otype uuid; v_oitem uuid; v_oscope uuid;
  v_rec custom.record; v_row jsonb; v_out jsonb; v_img uuid; v_src jsonb; v_n int; v_msg text;
  v_note uuid; v_press jsonb; v_state text; v_all jsonb; v_tmpl uuid; v_team uuid; v_new uuid; v_empty uuid; v_off uuid;
begin
  select v into v_org from sf where k = 'org';  select v into v_old from sf where k = 'old';
  select v into v_new from sf where k = 'new';  select v into v_empty from sf where k = 'empty';
  select v into v_off from sf where k = 'off';

  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated', 'session_id', 'scopeswt')::text, true);
  perform set_config('role', 'authenticated', true);

  -- ══ T1: the old doors, in an organization born on the store ══
  v_type := (public.create_scope_type(v_org, 'Patient', 'Patients', null, 'user', 'People the practice treats',
                                      0::smallint, null::smallint, '{}'::text[], 'blue', null)) ->> 'id';
  v_dentist := (public.create_context_item(v_type, 'preferred_dentist', 'Preferred dentist', 'string'::context_value_type,
                 'Who the patient likes to see', null, 'always'::context_fetch_hint, 'internal'::context_sensitivity,
                 '{}'::text[], null, 0::smallint, null, null, null, null)) ->> 'id';
  v_recall := (public.create_context_item(v_type, 'recall_interval_months', 'Recall interval (months)', 'number'::context_value_type,
                 '', null, 'always'::context_fetch_hint, 'internal'::context_sensitivity,
                 '{}'::text[], null, 1::smallint, null, null, null, null)) ->> 'id';
  v_email := (public.create_context_item(v_type, 'contact_email', 'Contact email', 'email'::context_value_type,
                 '', null, 'on_demand'::context_fetch_hint, 'restricted'::context_sensitivity,
                 '{}'::text[], null, 2::smallint, null, null, null, null)) ->> 'id';
  v_patient := (public.create_scope(v_org, v_type, 'Marisol Ortega', null, 'Hygiene patient since 2019', '{}'::jsonb, null, null)) ->> 'id';
  perform public.set_context_value(jsonb_build_object('context_item_id', v_dentist, 'scope_id', v_patient,
                                                      'value_text', 'Dr. Anaya Patel', 'source_type', 'manual'));
  perform set_config('role', 'none', true);

  select * into v_rec from custom.record where organization_id = v_org and id = v_patient;
  if v_rec.id is null then
    raise exception 'T1 RED: Marisol Ortega was made through the old doors and is not in the record store — the store is not the writer';
  end if;
  if v_rec.table_id is distinct from v_type or v_rec.data ->> 'preferred_dentist' is distinct from 'Dr. Anaya Patel'
     or v_rec.data ->> 'name' is distinct from 'Marisol Ortega' then
    raise exception 'T1: the store holds Marisol Ortega as %, not in the Patients Table with her preferred dentist', v_rec.data - '_values' - '_sources';
  end if;
  if not exists (select 1 from custom.record f where f.organization_id = v_org and f.id = v_email
                   and f.data ->> 'key' = 'contact_email' and f.data ->> 'sensitivity' = 'confidential'
                   and f.data ->> 'context_policy' = 'on_request') then
    raise exception 'T1: Contact email is not a Field of the Patients Table with the mover''s sensitivity and policy';
  end if;
  if not exists (select 1 from custom.record t where t.organization_id = v_org and t.id = v_type
                   and t.data ->> 'kept_for' = 'context'
                   and t.data -> 'fields' @> '[{"name": "preferred_dentist"}, {"name": "recall_interval_months"}, {"name": "contact_email"}]'::jsonb) then
    raise exception 'T1: the Patients Table does not say it is kept for the context system, or does not declare its fields';
  end if;

  -- ══ T2: the store's own door writes the value first ══
  if to_regprocedure('custom.context_value_write(jsonb)') is null then
    raise exception 'T2 RED: there is no store door for a value (custom.context_value_write)';
  end if;
  perform set_config('role', 'authenticated', true);
  v_out := custom.context_value_write(jsonb_build_object('context_item_id', v_recall, 'scope_id', v_patient,
                                                         'value_number', 6, 'source_type', 'manual'));
  perform set_config('role', 'none', true);
  if not coalesce((v_out ->> 'ok')::boolean, false) or v_out ->> 'writer' <> 'store' then
    raise exception 'T2: the value door answered %, not ok from the store', v_out;
  end if;
  v_img := (v_out -> 'data' ->> 'id')::uuid;
  select * into v_rec from custom.record where organization_id = v_org and id = v_patient;
  v_src := v_rec.data -> '_sources' -> (v_rec.data -> '_values' -> 'recall_interval_months' ->> 'src');
  if (v_rec.data ->> 'recall_interval_months')::numeric is distinct from 6 or v_src ->> 'old_value_id' is distinct from v_img::text then
    raise exception 'T2: the Record holds % with source %, not 6 naming the old row %', v_rec.data -> 'recall_interval_months', v_src, v_img;
  end if;
  if not exists (select 1 from context.context_item_values v where v.id = v_img and v.is_current and v.value_number = 6) then
    raise exception 'T2: the old row % is not the current image of the value', v_img;
  end if;

  -- ══ T3: archive and restore the scope type through the doors ══
  perform set_config('role', 'authenticated', true);
  perform custom.context_type_archive(v_type);
  perform set_config('role', 'none', true);
  select count(*) into v_n from custom.record
   where organization_id = v_org and id in (v_type, v_patient, v_dentist) and deleted_at is not null;
  if v_n <> 3 then
    raise exception 'T3: archiving Patients archived % of its Table, Record and Field in the store, not 3', v_n;
  end if;
  perform set_config('role', 'authenticated', true);
  perform custom.context_type_restore(v_type);
  perform set_config('role', 'none', true);
  select count(*) into v_n from custom.record
   where organization_id = v_org and id in (v_type, v_patient, v_dentist) and deleted_at is null;
  if v_n <> 3 then
    raise exception 'T3: restoring Patients brought back % of its Table, Record and Field, not 3', v_n;
  end if;

  -- ══ T4: the store's refusal refuses the old write ══
  begin
    perform set_config('role', 'authenticated', true);
    perform public.set_context_value(jsonb_build_object('context_item_id', v_recall, 'scope_id', v_patient,
                                                        'value_text', 'about six months', 'source_type', 'manual'));
    perform set_config('role', 'none', true);
    raise exception 'T4 RED: words in the number field were accepted — the store did not decide';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    perform set_config('role', 'none', true);
    if v_msg like 'T4 RED%' then raise; end if;
  end;
  if exists (select 1 from context.context_item_values v where v.context_item_id = v_recall and v.scope_id = v_patient
               and v.value_text = 'about six months') then
    raise exception 'T4: the old row with words in the number field was written although the store refused it';
  end if;

  -- ══ T5: a generic store write into the copy is refused, with the address ══
  begin
    perform set_config('role', 'authenticated', true);
    perform custom.record_update(v_org, v_patient, '{"preferred_dentist": "Dr. Lena Brooks"}'::jsonb);
    perform set_config('role', 'none', true);
    raise exception 'T5 RED: a generic record_update wrote Marisol Ortega past the scope doors';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    perform set_config('role', 'none', true);
    if v_msg like 'T5 RED%' then raise; end if;
    if v_msg not like '%written through the scopes screens%' then
      raise exception 'T5: the generic write was refused, but not with the sentence naming where to edit it: %', v_msg;
    end if;
  end;

  -- ══ T6: a tag lands its store copy in the same statement ══
  insert into workbench.notes (organization_id, label, content, folder_name, created_by)
  values (v_org, 'Marisol asked to move her cleaning to a Saturday', 'She can only come in on weekends until December.',
          'Front desk', c_admin) returning id into v_note;
  perform set_config('role', 'authenticated', true);
  perform public.set_entity_scopes('note', v_note, array[v_patient]);
  perform set_config('role', 'none', true);
  if not exists (select 1 from platform.associations a where a.source_type = 'note' and a.source_id = v_note
                   and a.target_type = 'record' and a.target_id = v_patient and a.role = 'context_tag' and a.deleted_at is null) then
    raise exception 'T6: the note tagged to Marisol Ortega has no store copy of its tag in the same statement';
  end if;
  if exists (select 1 from custom.io_outbox where organization_id = v_org and event_key = 'context.follow' and consumed_at is null) then
    raise exception 'T6: an organization whose store is the writer queued follow rows — something waits instead of being written';
  end if;

  -- ══ T7: the older organization is untouched ══
  perform set_config('role', 'authenticated', true);
  v_otype := (public.create_scope_type(v_old, 'Clinic', 'Clinics', null, 'building', '', 0::smallint, null::smallint,
                                       '{}'::text[], null, null)) ->> 'id';
  v_oscope := (public.create_scope(v_old, v_otype, 'Harbor Point — Validation', null, '', '{}'::jsonb, null, null)) ->> 'id';
  perform set_config('role', 'none', true);
  if exists (select 1 from custom.record where organization_id = v_old and id = v_oscope) then
    raise exception 'T7: the older organization''s clinic was written into the store synchronously — its writer is still the old tables';
  end if;
  if not exists (select 1 from custom.io_outbox where organization_id = v_old and event_key = 'context.follow'
                   and dedupe_key = 'context.follow:scopes:' || v_oscope::text and consumed_at is null) then
    raise exception 'T7: the older organization''s clinic queued no follow row — the copy would never hear of it';
  end if;

  -- ══ T8: the switch for one organization ══
  if to_regprocedure('platform.cutover_seam_measure_record(text,uuid,text,boolean,text,jsonb,text)') is null then
    raise exception 'T8 RED: the scopes switch has no measured parity to read (platform.cutover_seam_measure_record)';
  end if;
  update custom.io_outbox set consumed_at = now(), consumer = 'context-follow'
   where organization_id = v_old and event_key = 'context.follow' and consumed_at is null;  -- the follow drained it
  perform set_config('request.headers', '{"origin": "https://manage.aimatrx.com", "x-matrx-admin-lane": "1"}', true);
  v_press := platform.cutover_seam_press('scopes_screens', v_old, 'new', 'scopeswt suite');
  if coalesce((v_press ->> 'ok')::boolean, false) then
    raise exception 'T8: the switch pressed with no parity measured for the organization';
  end if;
  perform set_config('request.jwt.claims', '', true);
  perform platform.cutover_seam_measure_record('scopes_screens', v_old, 'parity', true,
            '0 defects in 1 scope type (suite).', '{}'::jsonb, 'scopeswt suite');
  perform set_config('matrx.cutover_census_door', 'on', true);
  update platform.cutover_seam
     set prerequisites = (select jsonb_agg(case when e ->> 'key' = 'writers_listed' then e || '{"met": true}'::jsonb else e end)
                            from jsonb_array_elements(prerequisites) e)
   where seam_key = 'scopes_screens';
  perform set_config('matrx.cutover_census_door', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated', 'session_id', 'scopeswt')::text, true);
  v_press := platform.cutover_seam_press('scopes_screens', v_old, 'new', 'scopeswt suite');
  if not coalesce((v_press ->> 'ok')::boolean, false) or custom.context_writer(v_old) <> 'store' then
    raise exception 'T8: pressing the ready organization answered % and its writer is %', v_press, custom.context_writer(v_old);
  end if;
  select s ->> 'state' into v_state from jsonb_array_elements(platform.cutover_seams(v_old) -> 'seams') s where s ->> 'key' = 'scopes_screens';
  if v_state <> 'new' then
    raise exception 'T8: the switch reads % after pressing, not new', v_state;
  end if;
  v_press := platform.cutover_seam_press('scopes_screens', v_old, 'old', 'scopeswt suite');
  if not coalesce((v_press ->> 'ok')::boolean, false) or custom.context_writer(v_old) <> 'old'
     or not exists (select 1 from platform.knob_override o where o.feature = 'custom' and o.key = 'scopes_written_in_the_store'
                      and o.scope_id = v_old and o.value = 'false'::jsonb) then
    raise exception 'T8: switching back answered %; the writer is % and the setting is not an explicit off', v_press, custom.context_writer(v_old);
  end if;

  -- ══ T9: every organization at once, for a named batch, and its undo ══
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.headers', '', true);
  if to_regprocedure('platform.cutover_seam_press_everyone(text,text,text,boolean,uuid[],uuid)') is null then
    raise exception 'T9 RED: there is no press for every organization at once';
  end if;
  v_all := platform.cutover_seam_press_everyone('scopes_screens', 'new', 'scopeswt suite', false, array[v_old, v_org], c_admin);
  if not coalesce((v_all ->> 'ok')::boolean, false) or (v_all ->> 'pressed_count')::int <> 1 or (v_all ->> 'already')::int <> 1
     or custom.context_writer(v_old) <> 'store' then
    raise exception 'T9: pressing the batch answered %', v_all;
  end if;
  v_all := platform.cutover_seam_press_everyone('scopes_screens', 'old', 'scopeswt suite undo', false, array[v_old], c_admin);
  if not coalesce((v_all ->> 'ok')::boolean, false) or custom.context_writer(v_old) <> 'old' then
    raise exception 'T9: the undo answered % and the writer is %', v_all, custom.context_writer(v_old);
  end if;

  -- ══ T11: nothing to compare is ready; a store that is off is skipped, never a failed run ══
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.headers', '', true);
  v_all := platform.cutover_seam_press_everyone('scopes_screens', 'new', 'scopeswt suite T11', false, array[v_empty, v_off], c_admin);
  if not coalesce((v_all ->> 'ok')::boolean, false) then
    raise exception 'T11 RED: the every-organization press failed the run instead of pressing an organization with nothing to compare and skipping one whose store is off: %', v_all ->> 'says';
  end if;
  if custom.context_writer(v_empty) <> 'store' or (v_all ->> 'skipped_count')::int <> 1 or custom.context_writer(v_off) <> 'old' then
    raise exception 'T11: the press answered %; Seaside writes in %, Cove Street in %', v_all, custom.context_writer(v_empty), custom.context_writer(v_off);
  end if;

  -- ══ T12: a stranger learns nothing about Bayfront's scopes ══
  perform set_config('request.jwt.claims', json_build_object('sub', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'role', 'authenticated', 'session_id', 'scopeswt')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    v_state := custom.context_writer(v_org);
    perform set_config('role', 'none', true);
    raise exception 'T12 RED: a stranger asked custom.context_writer about Bayfront and was told %', v_state;
  exception when insufficient_privilege then
    null;
  end;
  begin
    v_out := custom._ctx_answer(v_org, v_patient, null);
    perform set_config('role', 'none', true);
    raise exception 'T12 RED: a stranger asked custom._ctx_answer about Bayfront and was told %', v_out;
  exception when insufficient_privilege then
    null;
  end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated', 'session_id', 'scopeswt')::text, true);
  perform set_config('role', 'authenticated', true);
  if custom._ctx_answer(v_org, v_patient, null) ->> 'writer' <> 'store' then
    raise exception 'T12: Bayfront''s own owner is not told that its scopes are written in the store';
  end if;
  perform set_config('role', 'none', true);

  -- ══ T13: refused in the door's own name ══
  perform set_config('request.jwt.claims', json_build_object('sub', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'role', 'authenticated', 'session_id', 'scopeswt')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform custom.context_type_write(v_org, null, '{"label_singular": "Insurer", "label_plural": "Insurers"}'::jsonb);
    perform set_config('role', 'none', true);
    raise exception 'T13 RED: a stranger made a scope type in Bayfront';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    perform set_config('role', 'none', true);
    if v_msg not like '%custom.context_type_write%' then
      raise exception 'T13 RED: the stranger was refused, but not in the name of the door she called: %', v_msg;
    end if;
  end;
  perform set_config('role', 'none', true);

  -- ══ T10: an industry template, through the store's door ══
  select t.id into v_tmpl from context.templates t where t.name = 'Dental Practice' and t.is_active;
  if v_tmpl is null then
    raise exception 'T10 FIXTURE: the Dental Practice template is not on this database';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated', 'session_id', 'scopeswt')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    v_out := custom.context_template_apply(v_new, v_tmpl);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    perform set_config('role', 'none', true);
    raise exception 'T10 RED: the Dental Practice template could not be applied: %', v_msg;
  end;
  perform set_config('role', 'none', true);
  select count(*) into v_n from context.scope_types t
   where t.organization_id = v_new and t.deleted_at is null
     and not exists (select 1 from custom.record r where r.organization_id = v_new and r.id = t.id and r.deleted_at is null);
  if v_n <> 0 then
    raise exception 'T10: % of the template''s scope types are not Tables in the store', v_n;
  end if;
  select t.id into v_team from context.scope_types t where t.organization_id = v_new and t.label_plural = 'Team Members';
  if not exists (select 1 from custom.record f where f.organization_id = v_new and f.data_class = 'field'
                   and f.data ->> 'entity_definition_id' = v_team::text and f.data ->> 'key' = 'reports_to'
                   and f.data ->> 'type' = 'relation' and f.data ->> 'relation_target' = v_team::text) then
    raise exception 'T10: Team Members'' "Reports To" is not a relation to another team member in the store';
  end if;

  raise notice 'GREEN T1–T13: the store writes Bayfront Family Dentistry''s scopes (old doors carried, the value door store first, archive and restore, refusals refuse, generic writers held off, tags carried), Harbor Point Validation keeps the old tables until its switch, and the switch goes one organization at a time or all at once, and back; an industry template applies with its Reports To.';
end
$t$;

rollback;

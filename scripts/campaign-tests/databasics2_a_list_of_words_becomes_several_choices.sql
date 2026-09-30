-- LANE DATA-V2-BASICS-2 — A LINE OF WORDS BECOMES SEVERAL CHOICES (BREAKER-3 B3-02, 2026-09-30).
--
-- THE USE CASE: a physical-therapy clinic's referral log (admin@admin.com's Workspace, made here the
-- way New table makes one). "Body Areas" started as Text and holds what the front desk typed:
-- "Lower back, Hip", "Knee, Hip", "Neck; Shoulder". The clinic changes it to Multi-choice with the
-- single areas as its choices. MEASURED on production: each line stayed ONE value, drawn as
-- ["Lower back, Hip"].
--   A. each line becomes the choices it names, in the order written ("Lower back", "Hip");
--   B. a repeat inside one line counts once ("Neck; Shoulder; neck" → Neck, Shoulder);
--   C. a line naming a word that is none of the choices, on a column taking only its choices, is set
--      aside whole in `_retired` (kept, never deleted, never half-kept).
-- RUN IT (clone; always rolled back):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/databasics2_a_list_of_words_becomes_several_choices.sql
-- ITS RED: before the campaign file it fails at A (the cell holds one value, "Lower back, Hip").

\set ON_ERROR_STOP on
\timing off

\set suite 'databasics2_a_list_of_words_becomes_several_choices.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '180s';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics2l1"}', true);

do $t$
declare
  c_ws    constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';  -- admin@admin.com's Workspace
  c_tbl   uuid;
  v_home  uuid;
  v_ba    uuid;
  s       jsonb;
begin
  if current_user <> 'authenticated' then
    raise exception '0: the suite is not in the signed-in person''s seat (%)', current_user;
  end if;
  v_home := custom.record_write(c_ws, custom.person_kernel_id(), jsonb_build_object('name', 'Referral Log Home'));
  c_tbl := custom.table_declare(c_ws, jsonb_build_object(
    'name', 'Referral intake log', 'slug', 'referral_intake_log_databasics2', 'type', 'entity',
    'label_singular', 'Referral', 'label_plural', 'Referrals', 'display', 'list', 'weight', 'light',
    'ordered', false, 'row_order', 'manual', 'title_field', 'patient', 'retention_days', 365,
    'agent_writable', true, 'default_sort', jsonb_build_array(jsonb_build_object('field', 'patient', 'direction', 'asc')),
    'fields', jsonb_build_array(jsonb_build_object('name', 'patient')), 'parent_id', v_home::text));
  perform custom.field_declare(c_ws, c_tbl, jsonb_build_object('key', 'patient', 'label', 'Patient', 'type', 'text'));
  v_ba := custom.field_declare(c_ws, c_tbl, jsonb_build_object('key', 'body_areas', 'label', 'Body Areas', 'type', 'text'));
  s := jsonb_build_object('ba', v_ba,
    'r1', custom.record_write(c_ws, c_tbl, '{"patient":"Amélie Durand","body_areas":"Lower back, Hip"}'),
    'r2', custom.record_write(c_ws, c_tbl, '{"patient":"Sean O''Brien","body_areas":"Neck; Shoulder; neck"}'),
    'r3', custom.record_write(c_ws, c_tbl, '{"patient":"Zofia Nowak","body_areas":"Knee, Elbow"}'));
  perform custom.field_update(c_ws, v_ba,
    '{"parity_type":"multi_select","options":["Lower back","Hip","Knee","Neck","Shoulder"],"allow_other":false}');
  perform set_config('dv2b2.l', s::text, true);
end
$t$;
reset role;

do $a$
declare
  s     jsonb := current_setting('dv2b2.l')::jsonb;
  v_opt jsonb;
  w1    jsonb;
  w2    jsonb;
  d3    jsonb;
begin
  v_opt := jsonb_build_object('options', custom.choice_options(
    (select organization_id from custom.record where id = (s ->> 'ba')::uuid),
    (select (f.data -> 'config' ->> 'options_table_id')::uuid from custom.record f where f.id = (s ->> 'ba')::uuid)));
  w1 := (select custom.choice_render_value(v_opt, data -> 'body_areas') from custom.record where id = (s ->> 'r1')::uuid);
  w2 := (select custom.choice_render_value(v_opt, data -> 'body_areas') from custom.record where id = (s ->> 'r2')::uuid);
  d3 := (select data from custom.record where id = (s ->> 'r3')::uuid);
  raise notice 'A % · B % · C %', w1, w2, d3 -> 'body_areas';
  if w1 is distinct from '["Lower back", "Hip"]'::jsonb then
    raise exception 'A: "Lower back, Hip" became % instead of the two choices Lower back and Hip', w1;
  end if;
  if w2 is distinct from '["Neck", "Shoulder"]'::jsonb then
    raise exception 'B: "Neck; Shoulder; neck" became % instead of Neck and Shoulder', w2;
  end if;
  if d3 ? 'body_areas' then
    raise exception 'C: "Knee, Elbow" (Elbow is no choice) was kept in the column as %', d3 -> 'body_areas';
  end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(d3 -> '_retired', '[]')) e
                  where e ->> 'key' = 'body_areas' and e -> 'value' = '"Knee, Elbow"'::jsonb) then
    raise exception 'C: "Knee, Elbow" was not kept whole in _retired: %', d3 -> '_retired';
  end if;
  raise notice 'GREEN: A–C';
end
$a$;

rollback;
